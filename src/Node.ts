import WebSocket from "ws";
import { NodeOptions, NodeStats, Track, LavalinkException } from "./types";
import type { Yukimu } from "./Yukimu";

const LAVALINK_API_VERSION = "v4";

export class Node {
  public readonly manager: Yukimu;
  public readonly options: NodeOptions;
  public ws: WebSocket | null = null;
  public connected: boolean = false;
  public stats: NodeStats | null = null;
  public sessionId: string | null = null;

  private reconnectAttempts: number = 0;
  private reconnectTimeout?: ReturnType<typeof setTimeout>;

  constructor(manager: Yukimu, options: NodeOptions) {
    this.manager = manager;
    this.options = {
      secure: false,
      retries: 5,
      ...options,
    };
  }

  // ─── Connection ───────────────────────────────────────────────────

  get wsUrl(): string {
    const protocol = this.options.secure ? "wss" : "ws";
    return `${protocol}://${this.options.host}:${this.options.port}/${LAVALINK_API_VERSION}/websocket`;
  }

  get restUrl(): string {
    const protocol = this.options.secure ? "https" : "http";
    return `${protocol}://${this.options.host}:${this.options.port}`;
  }

  get headers(): Record<string, string> {
    return {
      Authorization: this.options.password,
      "User-Id": this.manager.options.clientId,
      "Client-Name": "Yukimu/1.0.0",
    };
  }

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
    console.log(`[Yukimu] Node "${this.options.name}" connected`);
  }

  private onMessage(raw: WebSocket.RawData): void {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (payload.op) {
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

    switch (payload.type) {
      case "TrackStartEvent":
        player.playing = true;
        this.manager.emit("trackStart", player, payload.track as Track);
        break;

      case "TrackEndEvent":
        player.playing = false;
        player.position = 0;
        this.manager.emit("trackEnd", player, payload.track as Track, payload.reason as string);
        // Auto-play next in queue
        if (payload.reason !== "replaced" && payload.reason !== "stopped") {
          player.queue.next();
          if (player.queue.current) {
            player.play(player.queue.current);
          } else {
            this.manager.emit("queueEnd", player);
          }
        }
        break;

      case "TrackExceptionEvent":
        this.manager.emit("trackError", player, payload.track as Track, payload.exception as LavalinkException);
        break;

      case "TrackStuckEvent":
        this.manager.emit("trackStuck", player, payload.track as Track, payload.thresholdMs as number);
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
    if (!this.sessionId) throw new Error("Node is not ready (no session ID)");

    const url = `${this.restUrl}/${LAVALINK_API_VERSION}${path}`;
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

  /** Load tracks from Lavalink */
  public async loadTracks(identifier: string): Promise<import("./types").SearchResult> {
    return this.request("GET", `/loadtracks?identifier=${encodeURIComponent(identifier)}`);
  }

  /** Decode a single track */
  public async decodeTrack(encoded: string): Promise<Track> {
    return this.request("GET", `/decodetrack?encodedTrack=${encodeURIComponent(encoded)}`);
  }
}
