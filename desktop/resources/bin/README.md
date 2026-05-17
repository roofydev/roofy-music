# Sidecar Binaries

Packaged Roofy Music builds should place platform binaries here:

```txt
resources/bin/
  win32/x64/navidrome.exe
  win32/x64/yt-dlp.exe
  win32/x64/ffmpeg.exe
  win32/x64/ffprobe.exe
  win32/x64/deno.exe
  darwin/arm64/navidrome
  linux/x64/navidrome
```

During development, you can point the app at system/downloaded tools:

```powershell
$env:ROOFY_NAVIDROME_PATH="C:\Tools\navidrome\navidrome.exe"
$env:ROOFY_YT_DLP_PATH="C:\Tools\yt-dlp.exe"
$env:ROOFY_FFMPEG_PATH="C:\Tools\ffmpeg.exe"
$env:ROOFY_DENO_PATH="C:\Tools\deno.exe"
pnpm dev
```

The app also falls back to `yt-dlp`, `ffmpeg`, `ffprobe`, `deno`, and `node` on `PATH`.

`deno` is used as yt-dlp's JavaScript runtime for modern YouTube extraction challenges.
