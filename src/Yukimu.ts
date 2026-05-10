import { EventEmitter } from "events";
import { Node } from "./Node";
import { Player } from "./Player";
import { Resolver } from "./Resolver";
import {
  YukimuOptions,
  PlayerOptions,
  YukimuEvents,
  SearchSource,
  SearchResult,
} from "./types";

/**
 * Yukimu - A powerful Lavalink v4 wrapper for Discord bots
 * Supports: YouTube, YouTube Music, Spotify, Deezer, Apple Music,
 *           JioSaavn, Tidal, SoundCloud, Yandex Music
 */
export class Yukimu extends EventEmitter {
  public readonly options: YukimuOptions;
  public readonly nodes: Map<string, Node> = new Map();
  public readonly players: Map<string, Player> = new Map();
  public readonly resolver: Resolver;

  /** Send function — you must set this to send voice payloads to Discord */
  public sendPayload!: (guildId: string, payload: unknown) => void;

  constructor(options: YukimuOptions) {
    super();
    this.options = options;
    this.resolver = new Resolver(this);

    // Initialize all nodes
    for (const nodeOpts of options.nodes) {
      this.addNode(nodeOpts);
    }
  }

  // ─── Node Management ────────────────────────────────────────────

  /** Add a new Lavalink node */
  public addNode(options: import("./types").NodeOptions): Node {
    const node = new Node(this, options);
    this.nodes.set(options.name, node);
    node.connect();
    return node;
  }

  /** Remove a node by name */
  public removeNode(name: string): void {
    const node = this.nodes.get(name);
    if (!node) throw new Error(`Node "${name}" not found`);
    node.destroy();
    this.nodes.delete(name);
  }

  /** Get the best available node (least load) */
  public getBestNode(): Node {
    const connected = [...this.nodes.values()].filter(n => n.connected);
    if (!connected.length) throw new Error("No connected Lavalink nodes available");

    return connected.sort((a, b) => {
      const aLoad = a.stats?.cpu?.lavalinkLoad ?? 0;
      const bLoad = b.stats?.cpu?.lavalinkLoad ?? 0;
      return aLoad - bLoad;
    })[0];
  }

  // ─── Player Management ───────────────────────────────────────────

  /** Create a new player for a guild */
  public createPlayer(options: PlayerOptions): Player {
    const existing = this.players.get(options.guildId);
    if (existing) return existing;

    const node = options.nodeName
      ? this.nodes.get(options.nodeName) ?? this.getBestNode()
      : this.getBestNode();

    const player = new Player(this, node, options);
    this.players.set(options.guildId, player);
    this.emit("playerCreate", player);
    return player;
  }

  /** Get an existing player */
  public getPlayer(guildId: string): Player | undefined {
    return this.players.get(guildId);
  }

  /** Destroy a player */
  public destroyPlayer(guildId: string): void {
    const player = this.players.get(guildId);
    if (!player) return;
    player.destroy();
    this.players.delete(guildId);
    this.emit("playerDestroy", player);
  }

  // ─── Search ──────────────────────────────────────────────────────

  /**
   * Search for tracks across any supported source
   * @param query - Search query or direct URL
   * @param source - Where to search (youtube, spotify, deezer, etc.)
   */
  public async search(
    query: string,
    source: SearchSource = this.options.defaultSource ?? "youtube"
  ): Promise<SearchResult> {
    return this.resolver.resolve(query, source);
  }

  // ─── Discord Voice Gateway Handlers ──────────────────────────────

  /**
   * Handle Discord voice state updates — call this in your bot's
   * voiceStateUpdate event handler
   */
  public handleVoiceStateUpdate(data: {
    guild_id?: string;
    user_id: string;
    session_id: string;
    channel_id?: string | null;
  }): void {
    if (data.user_id !== this.options.clientId) return;
    if (!data.guild_id) return;

    const player = this.players.get(data.guild_id);
    if (!player) return;

    if (!data.channel_id) {
      // Bot was disconnected from voice
      player.voiceChannelId = null;
      player.connected = false;
      return;
    }

    player.voiceChannelId = data.channel_id;
    player.sessionId = data.session_id;
    player.connected = true;
    player.checkVoiceReady();
  }

  /**
   * Handle Discord voice server updates — call this in your bot's
   * voiceServerUpdate event handler
   */
  public handleVoiceServerUpdate(data: {
    guild_id: string;
    token: string;
    endpoint?: string | null;
  }): void {
    const player = this.players.get(data.guild_id);
    if (!player) return;
    if (!data.endpoint) return;

    player.voiceToken = data.token;
    player.voiceEndpoint = data.endpoint;
    player.checkVoiceReady();
  }

  // ─── EventEmitter typing ─────────────────────────────────────────

  public on<K extends keyof YukimuEvents>(
    event: K,
    listener: (...args: YukimuEvents[K]) => void
  ): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  public emit<K extends keyof YukimuEvents>(
    event: K,
    ...args: YukimuEvents[K]
  ): boolean {
    return super.emit(event, ...args);
  }
}
