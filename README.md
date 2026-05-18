# Roofy Music

Roofy Music is a local-first personal music app: local library, desktop-style player, playlists, search, and optional user-initiated imports through local `yt-dlp` and `ffmpeg`.

The desktop app is forked from Feishin and is being adapted to launch a bundled local Navidrome engine as a sidecar.

## Quick Start

```powershell
npm run desktop:install
$env:ROOFY_NAVIDROME_PATH="C:\path\to\navidrome.exe"
npm run desktop:dev
```

The app auto-starts the local Navidrome engine when a binary is available. The `Roofy Local` page shows sidecar status, local library path, user creation, and a one-field YouTube import flow.

Local login credentials and user-account notes are documented in `docs/local-login.md`. The same credentials are also shown in the app under `Roofy Local`.

For an unpacked Windows desktop build:

```powershell
npm run desktop:typecheck
npm run desktop:build
npm run desktop:package:dir
```

## Public Release Hygiene

- Do not commit generated `app-data` contents, local databases, `.env` files, signing keys, certificates, or sidecar build artifacts.
- Keep release credentials in local environment variables or repository secrets.
- Report security issues privately through GitHub security advisories; see `SECURITY.md`.

Optional importer requirements:

- `yt-dlp`
- `ffmpeg`
- `ffprobe`

The importer is for content you have rights to download or use. Roofy Music does not provide a catalog, hosting, or sharing.

## Features In Progress

- Feishin-based desktop player UI.
- Local Navidrome sidecar lifecycle.
- Local music folder configuration.
- Navidrome scanning, browsing, playlists, search, metadata, and playback.
- YouTube video/playlist import through `yt-dlp`.
- Download/import queue with progress, cancel, retry, and rescan.

## Desktop Architecture

The MVP runs as a local web app. The next desktop milestone should wrap it as one application:

```txt
Feishin/Electron shell
  -> starts Navidrome on localhost
  -> auto-connects to local server
  -> manages yt-dlp/ffmpeg binaries
  -> stores app data locally
```

## Android Direction

Android should be native Kotlin/Compose with Media3/ExoPlayer. It should sync or import from the desktop engine first. Fully local Android yt-dlp is technically possible, but should remain optional because of APK size, storage, background execution, and policy risk.

## Repository Layout

```txt
desktop/              Feishin/Electron desktop app fork
desktop/resources/bin Bundled local sidecar binaries, ignored except README
docs/                 Architecture, Android, legal, and login notes
upstream-feishin/     Reference clone, ignored by git
upstream-navidrome/   Reference clone, ignored by git
```
