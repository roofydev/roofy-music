# Music Sources Architecture

## Overview

Roofy Music supports multiple music sources through a unified player architecture:

- **Local Library** — Files on disk, managed by the local-first Navidrome sidecar
- **Navidrome** — Remote or local Navidrome/Subsonic servers
- **YouTube Music** — Streaming and discovery via youtubei.js
- **Radio** — Internet radio stations

## Core Principle

```
AppTrack = stable identity + metadata
PlayableMedia = temporary resolved playback object
DownloadEntity = permanent local file creation state
```

Stream URLs are never stored as canonical track identity. The queue stores `source` + `sourceId` + metadata, and resolves playback URLs just-in-time.

## Source Identity

Every track has a composite ID:

```
track.id = `${source}:${sourceId}`
```

Examples:
- `local:C:/Music/Artist/Song.flac`
- `navidrome:abc123`
- `youtube_music:dQw4w9WgXcQ`
- `radio:https://example.com/stream`

## Stream Resolution Flow

```
User clicks Play on YT Music track
→ queue stores only source + videoId + metadata
→ player asks main process to resolve stream
→ main process resolves fresh playable media
→ player receives fresh media
→ if playback returns 403:
   → invalidate stream cache
   → resolve once more
   → retry playback
→ if still failing:
   → show source-aware error message
```

## Download Flow

```
User clicks "Download to Library" on YT Music track
→ main process queues download job
→ yt-dlp downloads audio
→ metadata/cover written
→ file saved to local library folder
→ Navidrome scan triggered
→ track becomes local
→ source link created: youtube_music:videoId → local:path
```

## File Organization

```
MusicLibrary/
  Downloads/
    YouTube Music/
      Artist/
        Album/
          01 - Track Title.opus
          cover.jpg
```

## IPC Channels

### Stream Resolution
- `stream:resolve` — Resolve a playable URL for a track
- `stream:invalidate` — Invalidate cached stream for a track

### Downloads
- `download:start` — Start downloading a track to local library
- `download:status` — Get download job status
- `download:cancel` — Cancel a download job

### YouTube Music
- `youtube-music:auth:start`
- `youtube-music:auth:status`
- `youtube-music:auth:logout`
- `youtube-music:search`
- `youtube-music:getHome`
- `youtube-music:getPlaylist`

## Error Codes

- `YT_STREAM_403` — YouTube stream forbidden
- `YT_STREAM_EXPIRED` — Stream URL expired
- `YT_AUTH_REQUIRED` — Authentication needed
- `LOCAL_FILE_MISSING` — Local file not found
- `NAVIDROME_OFFLINE` — Navidrome server unreachable
- `DOWNLOAD_FAILED` — Download could not complete

## Anti-Patterns Avoided

1. **No embedded YouTube Music web UI** — All YT content renders through native React components
2. **No Navidrome as YT proxy** — Navidrome only indexes permanent local files
3. **No persistent stream URLs** — URLs are resolved at playback time
4. **No cookie leakage to renderer** — Auth session stays in main process
