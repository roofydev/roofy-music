# Desktop Integration Plan

## Current Product Tree

```txt
desktop/              Roofy Music desktop app, forked from Feishin
upstream-feishin/     Clean upstream reference clone, ignored by git
upstream-navidrome/   Clean upstream reference clone, ignored by git
```

`desktop/` is the product app. The upstream clones are research/reference inputs and should not be edited for product work.

## What Is Implemented

- Feishin Electron/React app copied into `desktop/`.
- App renamed to Roofy Music in package and builder metadata.
- Local-first Electron feature at `desktop/src/main/features/core/local-first`.
- Navidrome sidecar startup on `127.0.0.1:4533`.
- Local library folder under the user's Music folder by default.
- Local Navidrome data under Electron `userData/local-first/navidrome-data`.
- Generated local admin password stored in Electron settings.
- Renderer server lock configured for the local Navidrome endpoint.
- Auto-bootstrap of the local Navidrome server into Feishin auth state.
- In-app `Roofy Local` page for engine status, library folder selection, local user creation, and one-field yt-dlp imports.
- Automatic local signed-in browser handling for sites that require authentication.
- Bundled Deno sidecar for yt-dlp JavaScript challenge support.

## Sidecar Strategy

Navidrome should be bundled as an official release binary first. Fork Navidrome only if there is a hard product limitation that cannot be solved with configuration or API usage.

Development can use:

```powershell
$env:ROOFY_NAVIDROME_PATH="C:\path\to\navidrome.exe"
cd desktop
pnpm dev
```

Packaged builds should place binaries under `desktop/resources/bin/<platform>/<arch>/`.

Windows packaging currently uses unsigned local builds (`signAndEditExecutable: false`) so
Electron Builder does not try to sign bundled sidecar executables during development. A
release pipeline should restore proper code signing for the app and sidecars.

## Import Strategy

The importer runs in Electron main and calls local `yt-dlp`. YouTube imports pass a JavaScript runtime to yt-dlp when Deno or Node is available. The normal UI only asks for a link; the app infers video versus playlist import, converts to MP3 by default, and automatically tries common local signed-in browser sessions when YouTube requires authentication.

Completed audio files are written into:

```txt
<library folder>/Downloads/<uploader>/<title> [id].ext
```

Navidrome scans the same library folder, so imported tracks become normal library tracks.

## Next Milestones

1. Download/pin Navidrome, yt-dlp, ffmpeg, ffprobe, and Deno binaries per platform.
2. Add checksum verification and update metadata for sidecars.
3. Add explicit rescan trigger against Navidrome after imports.
4. Improve import metadata cleanup and manual edit before enqueue.
5. Replace remaining Feishin branding/icons.
6. Add Android native project after desktop import/library flow is stable.
