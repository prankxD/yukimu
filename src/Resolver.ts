import { SearchResult, SearchSource, SourcePrefixes, SpotifyOptions } from "./types";
import type { Yukimu } from "./Yukimu";

// ─── URL Patterns ─────────────────────────────────────────────────────────────

const URL_PATTERNS: Record<string, RegExp[]> = {
  youtube: [
    /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/,
    /^https?:\/\/music\.youtube\.com\/.+/,
  ],
  spotify: [
    /^https?:\/\/open\.spotify\.com\/(track|album|playlist|artist)\/.+/,
  ],
  soundcloud: [
    /^https?:\/\/(www\.)?soundcloud\.com\/.+/,
  ],
  deezer: [
    /^https?:\/\/(www\.)?deezer\.com\/(track|album|playlist)\/.+/,
  ],
  applemusic: [
    /^https?:\/\/music\.apple\.com\/.+/,
  ],
  tidal: [
    /^https?:\/\/(www\.)?tidal\.com\/(browse\/)?(track|album|playlist)\/.+/,
  ],
  jiosaavn: [
    /^https?:\/\/(www\.)?jiosaavn\.com\/.+/,
  ],
  yandexmusic: [
    /^https?:\/\/music\.yandex\.(ru|com)\/.+/,
  ],
};

export class Resolver {
  private manager: Yukimu;
  private spotifyToken: string | null = null;
  private spotifyExpiry: number = 0;

  constructor(manager: Yukimu) {
    this.manager = manager;
  }

  /**
   * Resolve a query or URL to Lavalink tracks
   */
  public async resolve(query: string, source: SearchSource): Promise<SearchResult> {
    const node = this.manager.getBestNode();

    // Check if query is a direct URL
    const detectedSource = this.detectSource(query);

    if (detectedSource) {
      // It's a URL — pass directly to Lavalink (LavaSrc handles platform resolution)
      return node.loadTracks(query);
    }

    // It's a search query — use source prefix
    const prefix = SourcePrefixes[source];
    return node.loadTracks(`${prefix}:${query}`);
  }

  /**
   * Detect what platform a URL belongs to
   */
  public detectSource(url: string): SearchSource | null {
    for (const [source, patterns] of Object.entries(URL_PATTERNS)) {
      if (patterns.some(p => p.test(url))) {
        return source as SearchSource;
      }
    }
    return null;
  }

  /**
   * Get Spotify API token (for resolving Spotify metadata without LavaSrc)
   * Only needed if you're NOT using the LavaSrc Lavalink plugin
   */
  public async getSpotifyToken(): Promise<string | null> {
    const opts = this.manager.options.spotify;
    if (!opts) return null;
    if (this.spotifyToken && Date.now() < this.spotifyExpiry) return this.spotifyToken;

    try {
      const res = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${opts.clientId}:${opts.clientSecret}`).toString("base64")}`,
        },
        body: "grant_type=client_credentials",
      });

      const data = await res.json() as { access_token: string; expires_in: number };
      this.spotifyToken = data.access_token;
      this.spotifyExpiry = Date.now() + data.expires_in * 1000 - 5000;
      return this.spotifyToken;
    } catch (err) {
      console.error("[Yukimu] Failed to fetch Spotify token:", err);
      return null;
    }
  }

  /**
   * Resolve a Spotify URL to track metadata (title + artist for YouTube fallback search)
   * Used when LavaSrc plugin is NOT installed
   */
  public async resolveSpotifyFallback(url: string): Promise<{ title: string; artist: string } | null> {
    const token = await this.getSpotifyToken();
    if (!token) return null;

    const match = url.match(/spotify\.com\/track\/([a-zA-Z0-9]+)/);
    if (!match) return null;

    try {
      const res = await fetch(`https://api.spotify.com/v1/tracks/${match[1]}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json() as { name: string; artists: { name: string }[] };
      return {
        title: data.name,
        artist: data.artists[0]?.name ?? "Unknown",
      };
    } catch {
      return null;
    }
  }
}
