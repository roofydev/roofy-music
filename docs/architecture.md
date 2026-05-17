# Architecture

## Product Shape

Roofy Music should feel like one private Spotify-style app while remaining local-first. Internally it can run a local engine, scanner, database, downloader worker, and desktop shell, but the user should not have to manage services.

## MVP Architecture

```txt
Browser UI
  -> localhost Node engine
      -> JSON database
      -> local music folder
      -> ffprobe metadata scanner
      -> yt-dlp/ffmpeg import worker
```

The current MVP intentionally avoids external dependencies. That makes it easy to verify the core flows before choosing Electron, Tauri, or a Navidrome sidecar.

## Target Desktop Architecture

```txt
Desktop app
  -> local engine sidecar
      -> SQLite database
      -> scanner/indexer
      -> playback/streaming API
      -> downloader service
      -> metadata service
  -> bundled tools
      -> yt-dlp
      -> ffmpeg/ffprobe
      -> optional Navidrome/OpenSubsonic engine
```

The desktop shell should bind the local engine to `127.0.0.1` on a random free port, start it on app launch, stop it on quit, and persist app data under the user's application data directory.

## Why Not Android First

Android can run yt-dlp through wrapper libraries, but the first product should not depend on that path. Desktop has fewer restrictions around long-running imports, file organization, conversion, and metadata cleanup.

## Data Model

```txt
Track
  id
  path
  title
  artist
  album
  albumArtist
  genre
  year
  duration
  trackNumber
  discNumber
  addedAt
  updatedAt
  sourceUrl?
  coverPath?

Playlist
  id
  name
  trackIds[]
  createdAt
  updatedAt

ImportJob
  id
  input
  status
  progress
  message
  outputPath?
  createdAt
  updatedAt
```

## Import Flow

```txt
User enters URL or search query
  -> engine normalizes input
  -> yt-dlp metadata preview
  -> user confirms import
  -> job enters queue
  -> yt-dlp downloads audio to staging/library
  -> ffmpeg extracts/converts if needed
  -> metadata and thumbnail are embedded when possible
  -> library scan refreshes database
```

## Future Navidrome Integration

The recommended final product can still adopt Navidrome as the backend engine. This MVP is useful either way:

- It defines importer behavior.
- It defines product UI flows.
- It can become the Electron/Tauri shell.
- Its scanner can be replaced by Navidrome/OpenSubsonic APIs later.
