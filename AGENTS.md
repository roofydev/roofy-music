# AGENTS.md

## Project Intent

Roofy Music is a local-first personal music system. It manages local audio files, plays them through a desktop-style UI, and optionally imports permitted audio with local `yt-dlp` and `ffmpeg` tooling.

The product must not require cloud hosting or an external backend. Any server process should run on the user's own machine and bind to localhost by default.

## Architecture Direction

- Desktop first.
- Local engine first, packaged later behind Electron or Tauri.
- Native Android later, using Media3/ExoPlayer and optional sync from the desktop engine.
- Avoid SaaS dependencies.
- Keep downloader behavior explicit, user-initiated, and framed for lawful/personal imports.

## Current Product Tree

- `desktop/` is the real product app, forked from Feishin.
- `desktop/src/main/features/core/local-first/` owns the Navidrome sidecar and importer.
- `src/server/` is an early scratch MVP kept only as reference until removed.
- `upstream-feishin/` and `upstream-navidrome/` are ignored reference clones.

## Coding Rules

- Keep filesystem access scoped to user-configured music folders and app data.
- Do not add telemetry.
- Do not add remote services without making them optional.
- Prefer small modules and clear data flow over framework churn.
- Do not market or implement the app as a piracy tool.
- Store source URLs only for duplicate detection and provenance.

## External Tools

The engine may call these local executables if available:

- `yt-dlp` for metadata extraction and permitted imports.
- `ffmpeg` for audio extraction/conversion through yt-dlp.
- `ffprobe` for metadata reads during scanning.

Future packaged builds should bundle pinned, checksummed binaries or allow the user to provide system paths.

## Verification

Run:

```powershell
npm run desktop:install
npm run desktop:typecheck
npm run desktop:dev
```

For local Navidrome during development, set `ROOFY_NAVIDROME_PATH` or place the binary under `desktop/resources/bin`.
