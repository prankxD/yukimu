import { Queue } from "./Queue";
import { Track, PlayerOptions, VoiceState } from "./types";
import type { Yukimu } from "./Yukimu";
import type { Node } from "./Node";

export class Player {
  public readonly manager: Yukimu;
  public readonly node: Node;
  public readonly queue: Queue;

  // IDs
  public readonly guildId: string;
  public voiceChannelId: string | null;
  public textChannelId?: string;

  // State
  public playing: boolean = false;
  public paused: boolean = false;
  public connected: boolean = false;
  public position: number = 0;
  public ping: number = -1;
  public volume: number;

  // Voice connection
  public sessionId: string | null = null;
  public voiceToken: string | null = null;
  public voiceEndpoint: string | null = null;

  // Filters
  public filters: Record<string, unknown> = {};

  // Loop mode
  public loop: "none" | "track" | "queue" = "none";

  constructor(manager: Yukimu, node: Node, options: PlayerOptions) {
    this.manager = manager;
    this.node = node;
    this.queue = new Queue();

    this.guildId = options.guildId;
    this.voiceChannelId = options.voiceChannelId;
    this.textChannelId = options.textChannelId;
    this.volume = options.volume ?? 100;

    // Send voice channel join payload to Discord
    this.sendVoicePayload(options.voiceChannelId, options.selfDeaf ?? true, options.selfMute ?? false);
  }

  // ─── Voice ───────────────────────────────────────────────────────

  private sendVoicePayload(channelId: string | null, selfDeaf: boolean, selfMute: boolean): void {
    this.manager.sendPayload(this.guildId, {
      op: 4,
      d: {
        guild_id: this.guildId,
        channel_id: channelId,
        self_deaf: selfDeaf,
        self_mute: selfMute,
      },
    });
  }

  /** Called when both sessionId and voiceToken/endpoint are available */
  public checkVoiceReady(): void {
    if (!this.sessionId || !this.voiceToken || !this.voiceEndpoint) return;

    const voiceState: VoiceState = {
      token: this.voiceToken,
      endpoint: this.voiceEndpoint,
      sessionId: this.sessionId,
    };

    this.node
      .request("PATCH", `/sessions/${this.node.sessionId}/players/${this.guildId}`, {
        voice: voiceState,
      })
      .catch(console.error);
  }

  // ─── Playback ─────────────────────────────────────────────────────

  /** Play a track */
  public async play(track: Track, options?: { startTime?: number; endTime?: number }): Promise<void> {
    this.queue.current = track;

    await this.node.request("PATCH", `/sessions/${this.node.sessionId}/players/${this.guildId}?noReplace=false`, {
      track: { encoded: track.encoded },
      volume: this.volume,
      ...(options?.startTime && { position: options.startTime }),
      ...(options?.endTime && { endTime: options.endTime }),
    });

    this.playing = true;
    this.paused = false;
  }

  /** Pause or resume playback */
  public async pause(state: boolean = true): Promise<void> {
    await this.node.request("PATCH", `/sessions/${this.node.sessionId}/players/${this.guildId}`, {
      paused: state,
    });
    this.paused = state;
    this.playing = !state;
  }

  /** Resume playback */
  public async resume(): Promise<void> {
    return this.pause(false);
  }

  /** Stop playback */
  public async stop(): Promise<void> {
    await this.node.request("PATCH", `/sessions/${this.node.sessionId}/players/${this.guildId}`, {
      track: { encoded: null },
    });
    this.playing = false;
    this.paused = false;
    this.position = 0;
    this.queue.current = null;
  }

  /** Skip to next track */
  public async skip(): Promise<Track | null> {
    const next = this.queue.next();
    if (next) {
      await this.play(next);
    } else {
      await this.stop();
      this.manager.emit("queueEnd", this);
    }
    return next;
  }

  /** Seek to position in milliseconds */
  public async seek(position: number): Promise<void> {
    if (!this.queue.current?.info.isSeekable) throw new Error("Current track is not seekable");
    await this.node.request("PATCH", `/sessions/${this.node.sessionId}/players/${this.guildId}`, {
      position,
    });
    this.position = position;
  }

  /** Set volume (0–1000, Lavalink default 100) */
  public async setVolume(volume: number): Promise<void> {
    if (volume < 0 || volume > 1000) throw new Error("Volume must be between 0 and 1000");
    await this.node.request("PATCH", `/sessions/${this.node.sessionId}/players/${this.guildId}`, {
      volume,
    });
    this.volume = volume;
  }

  // ─── Filters ──────────────────────────────────────────────────────

  /** Apply audio filters (bass boost, nightcore, 8D, etc.) */
  public async setFilters(filters: Record<string, unknown>): Promise<void> {
    this.filters = filters;
    await this.node.request("PATCH", `/sessions/${this.node.sessionId}/players/${this.guildId}`, {
      filters,
    });
  }

  /** Enable bass boost */
  public async setBassBoost(level: "low" | "medium" | "high" | "off"): Promise<void> {
    const bands: { band: number; gain: number }[] = [];
    const gains = {
      off: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      low: [0.2, 0.15, 0.1, 0.05, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      medium: [0.4, 0.3, 0.2, 0.1, 0.05, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      high: [0.6, 0.5, 0.4, 0.25, 0.1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    };

    for (let i = 0; i < 15; i++) {
      bands.push({ band: i, gain: gains[level][i] });
    }

    await this.setFilters({ ...this.filters, equalizer: bands });
  }

  /** Enable nightcore effect */
  public async setNightcore(enabled: boolean): Promise<void> {
    await this.setFilters({
      ...this.filters,
      timescale: enabled ? { speed: 1.2, pitch: 1.2, rate: 1.0 } : {},
    });
  }

  /** Enable 8D audio */
  public async set8D(enabled: boolean): Promise<void> {
    await this.setFilters({
      ...this.filters,
      rotation: enabled ? { rotationHz: 0.2 } : {},
    });
  }

  /** Clear all filters */
  public async clearFilters(): Promise<void> {
    this.filters = {};
    await this.node.request("PATCH", `/sessions/${this.node.sessionId}/players/${this.guildId}`, {
      filters: {},
    });
  }

  // ─── Queue Helpers ────────────────────────────────────────────────

  /** Add track(s) to queue and optionally start playing */
  public async add(tracks: Track | Track[], playNow: boolean = false): Promise<void> {
    const arr = Array.isArray(tracks) ? tracks : [tracks];

    if (!this.queue.current && arr.length > 0) {
      const first = arr.shift()!;
      this.queue.current = first;
      this.queue.add(arr);
      await this.play(first);
    } else {
      this.queue.add(arr);
      if (playNow && arr.length > 0) {
        await this.play(arr[0]);
      }
    }
  }

  /** Set loop mode */
  public setLoop(mode: "none" | "track" | "queue"): void {
    this.loop = mode;
  }

  // ─── Disconnect ───────────────────────────────────────────────────

  /** Disconnect from voice and clean up */
  public async destroy(): Promise<void> {
    this.sendVoicePayload(null, false, false);
    await this.node
      .request("DELETE", `/sessions/${this.node.sessionId}/players/${this.guildId}`)
      .catch(() => {});
    this.playing = false;
    this.connected = false;
    this.queue.clear();
  }

  /** Move to a different voice channel */
  public async move(channelId: string, selfDeaf: boolean = true): Promise<void> {
    this.voiceChannelId = channelId;
    this.sendVoicePayload(channelId, selfDeaf, false);
  }
}
