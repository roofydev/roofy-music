$ErrorActionPreference = 'Stop'

$outDir = 'resources/bin/win32/x64'
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

# --- Navidrome ---
Write-Host 'Fetching latest Navidrome release...'
$ndRelease = Invoke-RestMethod -Uri 'https://api.github.com/repos/navidrome/navidrome/releases/latest'
$ndAsset = $ndRelease.assets | Where-Object { $_.name -like '*windows_amd64.zip' } | Select-Object -First 1
if (-not $ndAsset) { throw 'Could not find Navidrome Windows amd64 asset' }
Invoke-WebRequest -Uri $ndAsset.browser_download_url -OutFile 'navidrome.zip'
Expand-Archive -Path 'navidrome.zip' -DestinationPath $outDir -Force
Remove-Item 'navidrome.zip'
Write-Host "Downloaded Navidrome: $($ndAsset.name)"

# --- yt-dlp ---
Write-Host 'Fetching yt-dlp...'
Invoke-WebRequest -Uri 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe' -OutFile "$outDir/yt-dlp.exe"
Write-Host 'Downloaded yt-dlp.exe'

# --- ffmpeg (static build from BtbN) ---
Write-Host 'Fetching ffmpeg...'
Invoke-WebRequest -Uri 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip' -OutFile 'ffmpeg.zip'
Expand-Archive -Path 'ffmpeg.zip' -DestinationPath 'ffmpeg_temp' -Force
$ffmpegBin = Get-ChildItem -Path 'ffmpeg_temp' -Recurse -Filter 'ffmpeg.exe' | Select-Object -First 1
if ($ffmpegBin) { Move-Item -Path $ffmpegBin.FullName -Destination "$outDir/ffmpeg.exe" -Force }
Remove-Item 'ffmpeg.zip'
Remove-Item 'ffmpeg_temp' -Recurse -Force
Write-Host 'Downloaded ffmpeg.exe'

# --- Deno ---
Write-Host 'Fetching latest Deno release...'
$denoRelease = Invoke-RestMethod -Uri 'https://api.github.com/repos/denoland/deno/releases/latest'
$denoAsset = $denoRelease.assets | Where-Object { $_.name -eq 'deno-x86_64-pc-windows-msvc.zip' } | Select-Object -First 1
if (-not $denoAsset) { throw 'Could not find Deno Windows x64 asset' }
Invoke-WebRequest -Uri $denoAsset.browser_download_url -OutFile 'deno.zip'
Expand-Archive -Path 'deno.zip' -DestinationPath $outDir -Force
Remove-Item 'deno.zip'
Write-Host "Downloaded Deno: $($denoAsset.name)"

# --- cloudflared ---
Write-Host 'Fetching cloudflared...'
Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile "$outDir/cloudflared.exe"
Write-Host 'Downloaded cloudflared.exe'

Write-Host '--- Bundled binaries ---'
Get-ChildItem -Path $outDir | ForEach-Object { Write-Host $_.Name }
