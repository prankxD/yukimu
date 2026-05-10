# Yukimu 🎵

A powerful **Lavalink v4** wrapper for Discord bots — built like Shoukaku.

Supports: YouTube · YouTube Music · Spotify · Deezer · Apple Music · JioSaavn · Tidal · SoundCloud · Yandex Music

---

## Requirements

- Node.js 18+
- A running **Lavalink v4** server
- **LavaSrc plugin** on your Lavalink server (for Spotify, Deezer, Apple Music, Tidal, JioSaavn)

## Install

```bash
npm install yukimu ws
npm install -D typescript @types/node @types/ws
```

## Lavalink Setup

Your `application.yml` needs the LavaSrc plugin for multi-source support:

```yaml
lavalink:
  plugins:
    - dependency: "com.github.topi314.lavasrc:lavasrc-plugin:4.3.0"
      repository: "https://maven.topi.wtf/releases"

plugins:
  lavasrc:
    providers:
      - "ytsearch:\"%ISRC%\""
      - "ytsearch:%QUERY%"
    sources:
      spotify: true
      appleMusic: true
      deezer: true
      yandexMusic: true
      jiosaavn: true
    spotify:
      clientId: "YOUR_SPOTIFY_CLIENT_ID"
      clientSecret: "YOUR_SPOTIFY_CLIENT_SECRET"
    appleMusic:
      mediaAPIToken: "YOUR_APPLE_MUSIC_TOKEN"
    deezer:
      masterDecryptionKey: "YOUR_DEEZER_KEY"
```

## Quick Start

```ts
import { Client, GatewayIntentBits } from "discord.js";
import { Yukimu } from "yukimu";

const client = new Client({ intents: [...] });

const yukimu = new Yukimu({
  clientId: "BOT_ID",
  token: "BOT_TOKEN",
  nodes: [{
    name: "main",
    host: "localhost",
    port: 2333,
    password: "youshallnotpass",
  }],
  defaultSource: "youtube",
});

// Required: forward voice payloads
yukimu.sendPayload = (guildId, payload) => {
  client.guilds.cache.get(guildId)?.shard.send(payload);
};

// Required: forward voice events
client.on("raw", (packet) => {
  if (packet.t === "VOICE_STATE_UPDATE") yukimu.handleVoiceStateUpdate(packet.d);
  if (packet.t === "VOICE_SERVER_UPDATE") yukimu.handleVoiceServerUpdate(packet.d);
});
```

## Search Examples

```ts
// Search YouTube (default)
const result = await yukimu.search("never gonna give you up");

// Search Spotify
const result = await yukimu.search("blinding lights", "spotify");

// Direct URL (any platform)
const result = await yukimu.search("https://open.spotify.com/track/...");
const result = await yukimu.search("https://www.jiosaavn.com/song/...");
const result = await yukimu.search("https://tidal.com/browse/track/...");
```

## Player API

```ts
const player = yukimu.createPlayer({
  guildId: "123",
  voiceChannelId: "456",
  selfDeaf: true,
  volume: 80,
});

await player.add(track);         // Add & auto-play
await player.pause();            // Pause
await player.resume();           // Resume
await player.skip();             // Skip
await player.seek(30000);        // Seek to 30s
await player.setVolume(80);      // Volume 0-1000
await player.setBassBoost("high"); // Bass boost
await player.setNightcore(true); // Nightcore
await player.set8D(true);        // 8D audio
await player.clearFilters();     // Clear all filters
player.queue.shuffle();          // Shuffle queue
player.setLoop("track");         // Loop: none | track | queue
yukimu.destroyPlayer(guildId);   // Disconnect
```

## Events

```ts
yukimu.on("nodeReady", (node) => {});
yukimu.on("trackStart", (player, track) => {});
yukimu.on("trackEnd", (player, track, reason) => {});
yukimu.on("trackError", (player, track, exception) => {});
yukimu.on("queueEnd", (player) => {});
yukimu.on("nodeDisconnect", (node, code, reason) => {});
```

## Supported Sources

| Source | Search | Direct URL | Requires |
|--------|--------|------------|---------|
| YouTube | ✅ | ✅ | Lavalink default |
| YouTube Music | ✅ | ✅ | Lavalink default |
| SoundCloud | ✅ | ✅ | Lavalink default |
| Spotify | ✅ | ✅ | LavaSrc plugin |
| Deezer | ✅ | ✅ | LavaSrc plugin |
| Apple Music | ✅ | ✅ | LavaSrc plugin |
| Tidal | ✅ | ✅ | LavaSrc plugin |
| JioSaavn | ✅ | ✅ | LavaSrc plugin |
| Yandex Music | ✅ | ✅ | LavaSrc plugin |

---

MIT License

