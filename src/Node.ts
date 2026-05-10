import WebSocket from "ws";
import { NodeOptions, NodeStats, Track, SearchResult, LavalinkException } from "./types";
import type { Yukimu } from "./Yukimu";

export class Node {
  public readonly manager: Yukimu;
  public readonly options: NodeOptions;
  public ws: WebSocket | null = null;
  public connected: boolean = false;
  public stats: NodeStats | null = null;
  public sessionId: string | null = null;

  /** Lavalink version this node runs (3 or 4) */
  public readonly version: 3 | 4;

  private reconnectAttempts: number = 0;
  private reconnectTimeout?: ReturnType<typeof setTimeout>;

  constructor(manager: Yukimu, options: NodeOptions) {
    this.manager = manager;
    this.options = {
      secure: false,
      retries: 5,
      version: 4,
      ...options,
    };
    this.version = this.options.version ?? 4;
  }

  // ─── URL Helpers ──────────────────────────────────────────────────

  /** WebSocket URL differs between v3 and v4 */
  get wsUrl(): string {
    const protocol = this.options.secure ? "wss" : "ws";
    const base = `${protocol}://${this.options.host}:${this.options.port}`;
    return this.version === 4 ? `${base}/v4/websocket` : base;
  }

  /** REST base URL */
  get restUrl(): string {
    const protocol = this.options.secure ? "https" : "http";
    return `${protocol}://${this.options.host}:${this.options.port}`;
  }

  /** API prefix — v4 uses /v4, v3 uses nothing */
  get apiPrefix(): string {
    return this.version === 4 ? "/v4" : "";
  }

  get headers(): Record<string, string> {
    const h: Record<string, string> = {
      Authorization: this.options.password,
      "User-Id": this.manager.options.clientId,
      "Client-Name": "Yukimu/1.0.0",
    };
    // v3 uses Num-Shards header
    if (this.version === 3) {
      h["Num-Shards"] = "1";
    }
    return h;
  }

  // ─── Connection ───────────────────────────────────────────────────

  public connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    this.ws = new WebSocket(this.wsUrl, { headers: this.headers });
    this.ws.on("open", () => this.onOpen());
    this.ws.on("message", (data) => this.onMessage(data));
    this.ws.on("close", (code, reason) => this.onClose(code, reason.toString()));
    this.ws.on("error", (err) => this.onError(err));
  }

  public destroy(): void {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.ws?.removeAllListeners();
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }

  // ─── WebSocket Events ─────────────────────────────────────────────

  private onOpen(): void {
    this.connected = true;
    this.reconnectAttempts = 0;
    this.manager.emit("nodeConnect", this);
    console.log(`[Yukimu] Node "${this.options.name}" connected (Lavalink v${this.version})`);

    // v3 doesn't send a "ready" op — mark ready immediately on open
    if (this.version === 3) {
      this.sessionId = "v3-no-session";
      this.manager.emit("nodeReady", this);
    }
  }

  private onMessage(raw: WebSocket.RawData): void {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(raw.toString());
    } catch {
      return;
    }

    const op = payload.op as string;

    // ── v4 ops ──
    if (this.version === 4) {
      switch (op) {
        case "ready":
          this.sessionId = payload.sessionId as string;
          this.manager.emit("nodeReady", this);
          console.log(`[Yukimu] Node "${this.options.name}" ready | session: ${this.sessionId}`);
          break;
        case "stats":
          this.stats = payload as unknown as NodeStats;
          break;
        case "playerUpdate":
          this.handlePlayerUpdate(payload);
          break;
        case "event":
          this.handleEvent(payload);
          break;
      }
      return;
    }

    // ── v3 ops ──
    switch (op) {
      case "stats":
        this.stats = payload as unknown as NodeStats;
        break;
      case "playerUpdate":
        this.handlePlayerUpdate(payload);
        break;
      case "event":
        this.handleEvent(payload);
        break;
    }
  }

  private onClose(code: number, reason: string): void {
    this.connected = false;
    this.manager.emit("nodeDisconnect", this, code, reason);
    console.warn(`[Yukimu] Node "${this.options.name}" disconnected (${code}): ${reason}`);
    this.scheduleReconnect();
  }

  private onError(error: Error): void {
    this.manager.emit("nodeError", this, error);
    console.error(`[Yukimu] Node "${this.options.name}" error:`, error.message);
  }

  // ─── Reconnect ────────────────────────────────────────────────────

  private scheduleReconnect(): void {
    const maxRetries = this.options.retries ?? 5;
    if (this.reconnectAttempts >= maxRetries) {
      console.error(`[Yukimu] Node "${this.options.name}" max reconnect attempts reached`);
      return;
    }
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000);
    this.reconnectAttempts++;
    console.log(`[Yukimu] Reconnecting node "${this.options.name}" in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimeout = setTimeout(() => this.connect(), delay);
  }

  // ─── Event Handlers ───────────────────────────────────────────────

  private handlePlayerUpdate(payload: Record<string, unknown>): void {
    const player = this.manager.players.get(payload.guildId as string);
    if (!player) return;
    const state = payload.state as { position?: number; connected?: boolean; ping?: number };
    player.position = state.position ?? 0;
    player.ping = state.ping ?? -1;
    this.manager.emit("playerUpdate", player);
  }

  private handleEvent(payload: Record<string, unknown>): void {
    const player = this.manager.players.get(payload.guildId as string);
    if (!player) return;

    // Normalize track — v3 uses { track: "encoded_string" }, v4 uses { track: { encoded, info } }
    let track: Track;
    if (this.version === 3) {
      track = {
        encoded: payload.track as string,
        info: {} as Track["info"],
      };
    } else {
      track = payload.track as Track;
    }

    switch (payload.type) {
      case "TrackStartEvent":
        player.playing = true;
        this.manager.emit("trackStart", player, track);
        break;

      case "TrackEndEvent":
        player.playing = false;
        player.position = 0;
        this.manager.emit("trackEnd", player, track, payload.reason as string);
        if (payload.reason !== "replaced" && payload.reason !== "stopped" && payload.reason !== "REPLACED" && payload.reason !== "STOPPED") {
          player.queue.next();
          if (player.queue.current) {
            player.play(player.queue.current);
          } else {
            this.manager.emit("queueEnd", player);
          }
        }
        break;

      case "TrackExceptionEvent":
        this.manager.emit("trackError", player, track, payload.exception as LavalinkException);
        break;

      case "TrackStuckEvent":
        this.manager.emit("trackStuck", player, track, payload.thresholdMs as number);
        break;

      case "WebSocketClosedEvent":
        this.manager.emit("socketClosed", player, payload.code as number, payload.reason as string);
        break;
    }
  }

  // ─── REST API ─────────────────────────────────────────────────────

  public async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.restUrl}${this.apiPrefix}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        ...this.headers,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`[Yukimu] REST error ${res.status} on ${method} ${path}: ${text}`);
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  /** Load tracks — works for both v3 and v4 */
  public async loadTracks(identifier: string): Promise<SearchResult> {
    const raw = await this.request<Record<string, unknown>>(
      "GET",
      `/loadtracks?identifier=${encodeURIComponent(identifier)}`
    );

    // Normalize v3 response to v4 format
    if (this.version === 3) {
      return this.normalizeV3Response(raw);
    }

    return raw as unknown as SearchResult;
  }

  /**
   * Convert v3 loadtracks response to v4 format so the rest
   * of the codebase only needs to handle one format
   */
  private normalizeV3Response(raw: Record<string, unknown>): SearchResult {
    const loadType = (raw.loadType as string).toLowerCase();

    // v3 tracks are { track: "encoded", info: {...} }
    // v4 tracks are { encoded: "...", info: {...} }
    const normalizeTracks = (tracks: unknown[]): Track[] =>
      tracks.map((t: unknown) => {
        const track = t as Record<string, unknown>;
        return {
          encoded: (track.track ?? track.encoded) as string,
          info: track.info as Track["info"],
          pluginInfo: track.pluginInfo as Record<string, unknown> | undefined,
        };
      });

    switch (loadType) {
      case "track_loaded":
        return {
          loadType: "track",
          tracks: normalizeTracks(raw.tracks as unknown[]),
        };
      case "playlist_loaded":
        return {
          loadType: "playlist",
          tracks: normalizeTracks(raw.tracks as unknown[]),
          playlistInfo: raw.playlistInfo as SearchResult["playlistInfo"],
        };
      case "search_result":
        return {
          loadType: "search",
          tracks: normalizeTracks(raw.tracks as unknown[]),
        };
      case "no_matches":
        return { loadType: "empty", tracks: [] };
      case "load_failed":
        return {
          loadType: "error",
          tracks: [],
          exception: raw.exception as SearchResult["exception"],
        };
      default:
        return { loadType: "empty", tracks: [] };
    }
  }

  /** Get player endpoint path — differs between v3 and v4 */
  public playerPath(guildId: string): string {
    if (this.version === 4) {
      return `/sessions/${this.sessionId}/players/${guildId}`;
    }
    // v3 uses /players/{guildId}
    return `/players/${guildId}`;
  }
}
