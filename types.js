export interface YukimuOptions {
  /** Your Discord bot token */
  token: string;
  /** Client ID of your bot */
  clientId: string;
  /** Lavalink nodes to connect to */
  nodes: NodeOptions[];
  /** Default search source */
  defaultSource?: SearchSource;
  /** Spotify credentials (for Spotify support) */
  spotify?: SpotifyOptions;
  /** Deezer options */
  deezer?: DeezerOptions;
  /** Apple Music options */
  appleMusic?: AppleMusicOptions;
}

export interface NodeOptions {
  /** Node identifier */
  name: string;
  /** Lavalink server host */
  host: string;
  /** Lavalink server port */
  port: number;
  /** Lavalink server password */
  password: string;
  /** Use SSL/TLS */
  secure?: boolean;
  /** Number of retries on disconnect */
  retries?: number;
}

export interface SpotifyOptions {
  clientId: string;
  clientSecret: string;
}

export interface DeezerOptions {
  /** Deezer master decryption key (from LavaSrc plugin) */
  masterKey?: string;
}

export interface AppleMusicOptions {
  /** Apple Music media API token */
  mediaAPIToken?: string;
  countryCode?: string;
}

export type SearchSource =
  | "youtube"
  | "youtubemusic"
  | "spotify"
  | "deezer"
  | "applemusic"
  | "soundcloud"
  | "tidal"
  | "jiosaavn"
  | "yandexmusic";

export const SourcePrefixes: Record<SearchSource, string> = {
  youtube: "ytsearch",
  youtubemusic: "ytmsearch",
  spotify: "spsearch",
  deezer: "dzsearch",
  applemusic: "amsearch",
  soundcloud: "scsearch",
  tidal: "tdsearch",
  jiosaavn: "jssearch",
  yandexmusic: "ymsearch",
};

export interface Track {
  encoded: string;
  info: TrackInfo;
  pluginInfo?: Record<string, unknown>;
}

export interface TrackInfo {
  identifier: string;
  isSeekable: boolean;
  author: string;
  length: number;
  isStream: boolean;
  position: number;
  title: string;
  uri?: string;
  artworkUrl?: string;
  isrc?: string;
  sourceName: string;
}

export interface SearchResult {
  loadType: LoadType;
  tracks: Track[];
  playlistInfo?: PlaylistInfo;
  exception?: LavalinkException;
}

export type LoadType =
  | "track"
  | "playlist"
  | "search"
  | "empty"
  | "error";

export interface PlaylistInfo {
  name: string;
  selectedTrack: number;
}

export interface LavalinkException {
  message?: string;
  severity: "common" | "suspicious" | "fault";
  cause: string;
}

export interface PlayerOptions {
  /** Guild ID to create player for */
  guildId: string;
  /** Voice channel ID */
  voiceChannelId: string;
  /** Text channel ID (for sending messages) */
  textChannelId?: string;
  /** Whether to self-deaf */
  selfDeaf?: boolean;
  /** Whether to self-mute */
  selfMute?: boolean;
  /** Node name to use (optional, auto-selected if not set) */
  nodeName?: string;
  /** Default volume 0-100 */
  volume?: number;
}

export interface VoiceState {
  token: string;
  endpoint: string;
  sessionId: string;
}

export interface NodeStats {
  players: number;
  playingPlayers: number;
  uptime: number;
  memory: {
    free: number;
    used: number;
    allocated: number;
    reservable: number;
  };
  cpu: {
    cores: number;
    systemLoad: number;
    lavalinkLoad: number;
  };
  frameStats?: {
    sent: number;
    nulled: number;
    deficit: number;
  };
}

export type YukimuEvents = {
  nodeConnect: [node: import("./Node").Node];
  nodeDisconnect: [node: import("./Node").Node, code: number, reason: string];
  nodeError: [node: import("./Node").Node, error: Error];
  nodeReady: [node: import("./Node").Node];
  trackStart: [player: import("./Player").Player, track: Track];
  trackEnd: [player: import("./Player").Player, track: Track, reason: string];
  trackError: [player: import("./Player").Player, track: Track, exception: LavalinkException];
  trackStuck: [player: import("./Player").Player, track: Track, threshold: number];
  playerCreate: [player: import("./Player").Player];
  playerDestroy: [player: import("./Player").Player];
  playerUpdate: [player: import("./Player").Player];
  queueEnd: [player: import("./Player").Player];
  socketClosed: [player: import("./Player").Player, code: number, reason: string];
};
