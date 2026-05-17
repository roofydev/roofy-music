# Android Feasibility Notes

## Recommended Android Shape

Build Android as a native Kotlin/Compose app using Media3/ExoPlayer, Room, and MediaStore/Storage Access Framework. Treat desktop as the heavy library/import manager, and Android as an offline player plus sync client.

## On-device yt-dlp

On-device yt-dlp is technically feasible with libraries such as `youtubedl-android`, which bundle yt-dlp/Python and can include ffmpeg. It should be optional because it increases APK size, complicates updates, and raises store-policy risk.

## Playback

Use:

- Media3 ExoPlayer for playback.
- MediaSessionService or MediaLibraryService for background playback.
- Foreground service notification for ongoing playback.
- Android Auto support only after core playback is stable.

## Downloads

Use user-initiated jobs with visible progress and cancellation. Long imports should run through WorkManager with foreground info or through a dedicated foreground service.

## Storage

Preferred modes:

1. App-owned offline storage for synced files.
2. User-selected music folder through Storage Access Framework.
3. MediaStore indexing for files that should appear to other media apps.

## Main Blockers

- Scoped storage and SAF complexity.
- Background execution limits.
- Battery and thermal cost of conversion.
- yt-dlp extractor update cadence.
- ffmpeg binary size and codec licensing.
- Play Store review and policy risk.
