# Roofy Music Product UX Integration Plan

## 1. Executive Summary

Roofy Music has the right feature set for a strong consumer music product, but too many capabilities risk being exposed as technical tools: servers, import workers, source URLs, codecs, provider names, sync endpoints, tunnel status, and debug state. The product should instead feel like one clean music app where complex behavior is packaged into simple listening flows.

The core UX problem is not missing functionality. It is feature presentation. The desktop app is becoming a library/import/control center, and the mobile app is becoming the everyday portable player. Users should not experience those as two technical products. They should experience one app family:

- Find music.
- Play it.
- Save it.
- Keep it in one personal library.
- Continue listening anywhere.

Implementation should prioritize clear entry points, smart defaults, progressive disclosure, and consistent action names across mobile and desktop.

## 2. Product Philosophy

Roofy Music should feel like a music player first, a personal library second, and a technical system only when the user intentionally opens advanced settings.

Core principles:

- Use user language: "Save offline", "Add to my library", "Continue on this device", "Update song info".
- Hide implementation terms: yt-dlp, Navidrome, Subsonic, OpenSubsonic, cloudflared, RPC, worker, codec, extractor, source ID.
- Prefer action flows over configuration screens.
- Show one primary action per screen or surface.
- Put advanced controls under "More options" or "Advanced".
- Automate source selection, metadata lookup, format choice, retries, thumbnails, and sync timing.
- Make the same action names work on mobile and desktop, even when the UI component differs.

## 3. Recommended Navigation Structure

### Mobile

Use a bottom navigation model with four primary destinations:

- Home: listening shortcuts, recently played, recommendations, continue listening.
- Search: songs, albums, artists, playlists, videos, and library results in one place.
- Library: saved music, playlists, downloads, artists, albums, songs.
- Now Playing: full player entry point, queue, lyrics, devices.

The mini player stays persistent above bottom navigation.

Move infrequent controls to Settings and contextual menus. Do not make "Personal Library", "YouTube", "Downloads", and "Sync" top-level destinations. They are sources or states inside the same music experience.

### Desktop

Use a left sidebar with:

- Home
- Search
- Library
- Playlists
- Downloads
- Now Playing or Queue
- Settings

Desktop can expose richer tables, split views, context menus, and a right-side queue panel. It should still use the same primary actions as mobile.

### Information Architecture

Group the app into user-facing areas:

- Listen: Home, player, queue, lyrics, mini player, handoff, casting.
- Find: Search, YouTube Music discovery, recognition, mood search.
- Keep: Add to my library, imports, Spotify playlist import, watch lists.
- Organize: Library, playlists, tags, duplicate cleanup, metadata.
- Offline: downloads, smart downloads, storage rules, local files.
- Share and presence: Listen Together, Discord status, scrobbling.
- Settings: general preferences and optional integrations.
- Advanced: technical state, provider details, debug logs, server options.

## 4. Feature-by-Feature UX Transformation

### Personal Library

User-facing purpose: Listen to your own music library on every device.

Recommended location: Library, Home, Search, and Settings during setup. It should not appear as a raw "Subsonic" or "Navidrome" feature. The user-facing concept is "Personal Library".

Simplified flow:

1. User opens Library.
2. If not connected, show "Connect your personal library".
3. User scans the desktop QR code or enters a link manually.
4. Library appears alongside saved streaming music.
5. Search and playback use personal library results automatically.

UI abstraction:

- Show: Personal Library, Connect, Connected, Syncing, Available offline.
- Hide: Navidrome, Subsonic, server URL, port, API version, password, token.

Primary action: Play.

Secondary actions: Save offline, Add to playlist, Add to queue, View album, Update song info.

Advanced actions: Edit server, resync library, view connection details, disconnect.

States:

- Empty: "Connect your personal library to listen to your saved music here."
- Loading: "Loading your library..."
- Error: "Your personal library cannot be reached right now. Check that your desktop app is open or try again."
- Success: "Personal library connected."

Mobile/desktop consistency: Mobile uses a setup sheet and Library empty state. Desktop uses the Roofy Local setup page and Settings. Both use the same "Personal Library" label.

Final recommended UX: Implement Personal Library as a source behind the normal Library, Search, and Player surfaces. Only Settings should reveal connection management.

### Secure Pairing

User-facing purpose: Connect phone and desktop without network setup.

Recommended location: Desktop Settings > Devices and Mobile Settings > Personal Library.

Simplified flow:

1. User opens desktop Settings > Devices.
2. Desktop shows "Connect phone" with a QR code.
3. User scans QR on mobile.
4. Mobile confirms "Connected to this desktop".
5. Library sync starts automatically.

UI abstraction:

- Show: Connect phone, QR code, device name, connection status.
- Hide: tunnel provider, local port, generated credentials, callback URLs.

Primary action: Connect phone.

Secondary actions: Copy setup link, Rename device, Remove device.

Advanced actions: LAN-only mode, tunnel diagnostics, credential reset.

States:

- Empty: "Connect your phone to listen to this library anywhere."
- Loading: "Waiting for phone..."
- Error: "The pairing code expired. Generate a new code and scan again."
- Success: "Phone connected."

Mobile/desktop consistency: Desktop initiates pairing; mobile completes it. Both call the result "Connected devices".

Final recommended UX: Treat pairing as device connection, not server configuration. QR pairing is the default. Manual entry is secondary.

### Add To My Library

User-facing purpose: Keep a song permanently in your personal library.

Recommended location: Song context menu, player overflow menu, search results, recognition results, playlist tracks.

Simplified flow:

1. User finds a song.
2. User taps More > Add to my library.
3. App queues the import on desktop automatically.
4. User sees "Saving to your library..."
5. When finished, the song becomes a Personal Library track and can be saved offline.

UI abstraction:

- Show: Add to my library, Saving, Saved to library.
- Hide: input URL, yt-dlp, desktop import endpoint, job ID, output path.

Primary action: Add to my library when the song is not owned.

Secondary actions: Save offline, Add to playlist, Add to queue.

Advanced actions: Choose import quality, view original source, retry import, remove source link.

States:

- Empty: Not applicable; action appears on eligible tracks.
- Loading: "Saving to your library..."
- Error: "This song could not be saved right now. Try another version or try again later."
- Success: "Saved to your library."

Mobile/desktop consistency: Same menu label on both platforms. Mobile shows progress in a bottom sheet or toast plus Downloads. Desktop shows progress in Downloads.

Final recommended UX: Make ownership a simple action on music items. Keep import mechanics in the background.

### Streaming And Instant Playback

User-facing purpose: Play songs immediately without saving them first.

Recommended location: Search results, Home recommendations, player, playlist screens.

Simplified flow:

1. User searches or browses.
2. User taps Play.
3. Song starts immediately.
4. App resolves the best source silently.
5. If the source fails, app retries or offers another version.

UI abstraction:

- Show: Play, Try another version, Save offline.
- Hide: stream URL, extractor, provider, cache invalidation, 403, token expiry.

Primary action: Play now.

Secondary actions: Add to queue, Save offline, Add to my library, Watch video.

Advanced actions: Open source, view technical details.

States:

- Empty: "Search for songs, albums, artists, or videos."
- Loading: "Starting playback..."
- Error: "This song cannot be played from this source right now. Try another version or save it again."
- Success: playback starts; no success toast needed.

Mobile/desktop consistency: Tap or click on a song row plays by default. Overflow contains secondary actions.

Final recommended UX: Playback is source-agnostic. The app chooses local files first, then personal library, then streaming.

### Downloads And Offline

User-facing purpose: Keep music available when there is no internet.

Recommended location: Library > Downloads, song/album/playlist context menus, Settings > Downloads & Offline.

Simplified flow:

1. User taps Save offline on a song, album, or playlist.
2. App downloads using default quality and Wi-Fi/storage rules.
3. Progress appears in Downloads.
4. Downloaded music shows an offline badge.

UI abstraction:

- Show: Save offline, Downloading, Available offline, Remove download.
- Hide: file path, chunk progress, worker count, format, temporary files.

Primary action: Save offline.

Secondary actions: Pause, Resume, Cancel, Remove download.

Advanced actions: Choose audio quality, choose video quality, redownload, view file location on desktop.

States:

- Empty: "Songs you save offline will appear here."
- Loading: "Saving offline..."
- Error: "This item could not be saved offline. Check your connection and try again."
- Success: "Available offline."

Mobile/desktop consistency: Mobile uses a compact Downloads list and storage summary. Desktop can show a richer queue table. Labels and states stay identical.

Final recommended UX: Offline is a user benefit, not a file management feature. Quality defaults should be automatic.

### Video Playback

User-facing purpose: Watch the music video when a track has one.

Recommended location: Player, search result context menu, song detail screen.

Simplified flow:

1. User plays or opens a song.
2. If video exists, show Watch video as a secondary action.
3. User taps Watch video.
4. Player switches to video mode.
5. User can return to audio mode.

UI abstraction:

- Show: Watch video, Audio only, Full screen.
- Hide: video ID, stream manifest, resolution ladder, provider API.

Primary action: Play audio.

Secondary actions: Watch video, Cast, Full screen.

Advanced actions: Choose video quality, open source URL.

States:

- Empty: "No video is available for this track."
- Loading: "Loading video..."
- Error: "This video cannot be played right now. Audio playback is still available."
- Success: video starts.

Mobile/desktop consistency: Mobile uses full-screen video and player controls. Desktop can use an embedded Now Playing video area.

Final recommended UX: Video is optional and secondary. Do not make videos compete with the core audio experience.

### Playlists

User-facing purpose: Save groups of songs for moods, events, and repeated listening.

Recommended location: Library > Playlists, playlist screens, song context menu.

Simplified flow:

1. User taps Add to playlist.
2. App shows recent playlists and "New playlist".
3. User chooses or creates a playlist.
4. Song is added.
5. Playlist syncs across connected devices.

UI abstraction:

- Show: playlist name, song count, cover collage, downloaded state.
- Hide: playlist IDs, source playlist mappings, sync conflict details.

Primary action: Play playlist.

Secondary actions: Shuffle, Save offline, Edit, Share/export, Add songs.

Advanced actions: Force sync, export file, view source mapping.

States:

- Empty: "Create a playlist for songs you want together."
- Loading: "Loading playlist..."
- Error: "This playlist could not be updated. Your changes will retry automatically."
- Success: "Added to playlist."

Mobile/desktop consistency: Same playlist actions. Mobile uses bottom sheets for add/edit; desktop uses dialogs and context menus.

Final recommended UX: Playlists are normal music objects, not sync objects. Sync is automatic and silent.

### Queue

User-facing purpose: Control what plays next.

Recommended location: Player and desktop right-side panel.

Simplified flow:

1. User opens Queue from the player.
2. User sees Now Playing and Up Next.
3. User reorders, removes, or adds songs.
4. Queue changes sync to the active playback device when handoff is used.

UI abstraction:

- Show: Now playing, Up next, Play next, Add to queue.
- Hide: queue IDs, media session payloads, source resolution status.

Primary action: Play next or reorder, depending on context.

Secondary actions: Remove, Save queue as playlist, Clear queue.

Advanced actions: View resolved source, export queue.

States:

- Empty: "Play something to start a queue."
- Loading: "Loading queue..."
- Error: "The queue could not be updated. Try again."
- Success: no toast unless saving as playlist.

Mobile/desktop consistency: Mobile queue is inside Now Playing. Desktop can keep it as a docked side panel.

Final recommended UX: Queue is lightweight and immediate. Avoid making it look like a technical playlist editor.

### Search

User-facing purpose: Find music from every available source in one place.

Recommended location: Top-level mobile tab and desktop sidebar item.

Simplified flow:

1. User types a query.
2. Results appear grouped by Top results, Songs, Albums, Artists, Playlists, Videos.
3. Personal Library matches appear first when confidence is high.
4. User taps a result to play or opens More for secondary actions.

UI abstraction:

- Show: result type, source only when helpful as "In your library" or "Online".
- Hide: provider names, API source, IDs, matching scores.

Primary action: Play top result or open selected result.

Secondary actions: Add to queue, Add to my library, Save offline, Watch video.

Advanced actions: filter by source, refresh metadata.

States:

- Empty: "Search songs, artists, albums, playlists, or videos."
- Loading: "Searching..."
- Error: "Search is not available right now. Check your connection and try again."
- Success: results shown.

Mobile/desktop consistency: Same result grouping. Desktop can use keyboard shortcuts and denser rows.

Final recommended UX: Search is unified. Source-specific search should be an advanced filter, not separate tabs by default.

### Mini Player And Full Player

User-facing purpose: Keep playback controls always within reach.

Recommended location: Persistent bottom mini player on mobile; bottom bar or compact floating player on desktop; full player from tap/click.

Simplified flow:

1. User starts playback.
2. Mini player appears with art, title, artist, play/pause, skip.
3. User opens full player for lyrics, queue, devices, video, and more actions.

UI abstraction:

- Show: current song, controls, progress, device status.
- Hide: playback engine, resolved URL, codec, buffer internals.

Primary action: Play/pause.

Secondary actions: Skip, like, open queue, lyrics, devices.

Advanced actions: playback diagnostics.

States:

- Empty: no mini player until playback starts; desktop may show "Nothing playing" in Now Playing.
- Loading: skeleton artwork and "Starting..."
- Error: "Playback stopped. Try again or choose another version."
- Success: normal player state.

Mobile/desktop consistency: Same control order and icons. Desktop can add keyboard and media key support.

Final recommended UX: Player is the anchor of the app. Keep it clean; move rare controls into More.

### Playback Handoff

User-facing purpose: Continue listening on another device.

Recommended location: Player device button and Settings > Devices.

Simplified flow:

1. User opens device picker from the player.
2. App shows available devices.
3. User chooses phone, desktop, or this device.
4. Queue and position move to the selected device.

UI abstraction:

- Show: device names, current device, continue here.
- Hide: remote manifest, handoff JSON, connection channel.

Primary action: Continue on selected device.

Secondary actions: Rename device, remove device.

Advanced actions: device diagnostics, connection logs.

States:

- Empty: "No other devices are connected."
- Loading: "Connecting..."
- Error: "Could not continue on that device. Make sure Roofy Music is open there."
- Success: "Playing on Desktop" or "Playing on Phone."

Mobile/desktop consistency: Use the same device icon and "Devices" label. Mobile uses a bottom sheet. Desktop uses a popover.

Final recommended UX: Present handoff like a device picker, not remote control infrastructure.

### Metadata Enrichment

User-facing purpose: Make songs look correct with clean titles, artists, albums, and artwork.

Recommended location: Desktop Library item More menu, import completion flow, Settings > Library maintenance.

Simplified flow:

1. App updates song info automatically after import.
2. If confidence is low, user sees "Review song info".
3. User accepts suggested title, artist, album, artwork.
4. Library updates.

UI abstraction:

- Show: current info, suggested info, artwork choices.
- Hide: MusicBrainz, AcoustID, ffprobe, provider scores, raw tags.

Primary action: Update song info.

Secondary actions: Edit manually, Choose artwork, Skip.

Advanced actions: choose metadata provider, view raw tags, fingerprint again.

States:

- Empty: "Select songs to update their info."
- Loading: "Finding song info..."
- Error: "Song info could not be updated. You can edit it manually."
- Success: "Song info updated."

Mobile/desktop consistency: Desktop owns full editing. Mobile can show refreshed metadata but should not expose complex tag editing initially.

Final recommended UX: Metadata cleanup should be automatic after import, with manual review only when needed.

### Tag Editor

User-facing purpose: Fix song details when the app gets them wrong.

Recommended location: Desktop Library > More > Edit song info. Mobile should initially be view-only or offer simple rename only if needed.

Simplified flow:

1. User opens Edit song info.
2. User edits title, artist, album, track number, year, genre, artwork.
3. User saves.
4. App updates the library and syncs display metadata.

UI abstraction:

- Show: human-readable metadata fields.
- Hide: embedded tag formats, file write strategy, file path by default.

Primary action: Save changes.

Secondary actions: Update automatically, Reset, Choose artwork.

Advanced actions: batch edit, find/replace, raw tag view, file path.

States:

- Empty: "Choose a song to edit."
- Loading: "Loading song info..."
- Error: "Changes could not be saved. The file may be unavailable."
- Success: "Song info saved."

Mobile/desktop consistency: Same field names if mobile editing is added later.

Final recommended UX: Keep editing scoped and friendly. Batch operations belong under Advanced or desktop power-user workflows.

### Import Format And Quality

User-facing purpose: Control audio quality only when the user cares.

Recommended location: Settings > Downloads & Offline > Quality, with per-import Advanced options.

Simplified flow:

1. Default imports use "Best balance" automatically.
2. User can set a global quality preference.
3. Advanced users can override quality on a specific import.

UI abstraction:

- Show: Best balance, Smaller files, Highest quality.
- Hide: FLAC, Opus, MP3, bitrate, codec, container unless Advanced is open.

Primary action: Use recommended quality.

Secondary actions: Smaller files, Highest quality.

Advanced actions: exact format, bitrate, re-encode existing files.

States:

- Empty: Not applicable.
- Loading: "Preparing import..."
- Error: "This quality is not available for the selected item. Roofy Music will use the best available version."
- Success: no toast needed.

Mobile/desktop consistency: Same presets. Desktop can expose exact formats in Advanced.

Final recommended UX: Quality should be preset-based by default. Exact codec selection is advanced.

### Spotify Playlist Import

User-facing purpose: Bring playlists from another music app into Roofy Music.

Recommended location: Desktop Library or Settings > Import music.

Simplified flow:

1. User chooses Import playlist.
2. User pastes a Spotify playlist link or connects account if needed.
3. App previews matched songs.
4. User starts import.
5. Songs are saved to the personal library and playlist is created.

UI abstraction:

- Show: Import playlist, matched songs, missing songs, saved playlist.
- Hide: OAuth details, spotdl, match algorithms, raw service IDs.

Primary action: Import playlist.

Secondary actions: Review matches, skip unavailable songs, save playlist only.

Advanced actions: keep in sync, provider settings, view match details.

States:

- Empty: "Paste a playlist link to bring it into your library."
- Loading: "Matching songs..."
- Error: "This playlist could not be imported. Check the link or try again later."
- Success: "Playlist imported."

Mobile/desktop consistency: Desktop should run the heavy import. Mobile can offer "Send to desktop" later.

Final recommended UX: Frame this as playlist migration, not source downloading.

### Sync Library State

User-facing purpose: Keep favorites, playlists, history, ratings, and downloads consistent.

Recommended location: Hidden background automation with status in Settings > Personal Library.

Simplified flow:

1. User connects devices.
2. App syncs state automatically.
3. If conflicts occur, app chooses the newest safe change.
4. User sees only a simple sync status.

UI abstraction:

- Show: Synced, Syncing, Last synced, Sync issue.
- Hide: syncAll, sync endpoints, conflict payloads, IDs, source mapping.

Primary action: Sync now, only in Settings.

Secondary actions: View recent sync activity.

Advanced actions: reset sync state, force full resync, export sync log.

States:

- Empty: "Connect a device to keep your library in sync."
- Loading: "Syncing..."
- Error: "Some changes could not sync. Roofy Music will try again automatically."
- Success: "Library is up to date."

Mobile/desktop consistency: Same status labels. Mobile should avoid sync dashboards.

Final recommended UX: Sync should be invisible unless something needs attention.

### Recognition To Import

User-facing purpose: Identify a song playing nearby and save it.

Recommended location: Search screen action, mobile quick action, recognition result screen.

Simplified flow:

1. User taps Identify song.
2. App listens and shows result.
3. User can Play, Add to my library, or Save offline.
4. If Add to my library is chosen, desktop import runs automatically.

UI abstraction:

- Show: Identify song, result, confidence only as "Best match" if needed.
- Hide: ShazamKit, fingerprints, recognition provider, raw response.

Primary action: Play result.

Secondary actions: Add to my library, Add to playlist, Search result.

Advanced actions: view recognition details.

States:

- Empty: "Tap to identify music playing nearby."
- Loading: "Listening..."
- Error: "No match found. Try again when the song is clearer."
- Success: recognized song result.

Mobile/desktop consistency: Recognition is mobile-first. Desktop can support search by pasted link or file instead.

Final recommended UX: Recognition should be a quick discovery flow that leads naturally into playing or saving.

### Cast

User-facing purpose: Play music on speakers or a TV.

Recommended location: Player device button.

Simplified flow:

1. User taps Devices.
2. App shows available speakers and TVs.
3. User selects one.
4. Playback continues on that device.

UI abstraction:

- Show: device name, connected state.
- Hide: Chromecast, DLNA, GMS flavor, protocol errors.

Primary action: Play on selected device.

Secondary actions: Disconnect, volume control.

Advanced actions: device diagnostics.

States:

- Empty: "No nearby devices found."
- Loading: "Looking for devices..."
- Error: "Could not connect to that device. Make sure it is on the same network."
- Success: "Playing on Living Room TV."

Mobile/desktop consistency: Use the same Devices surface as handoff. Separate device types visually, not as separate features.

Final recommended UX: Merge Cast and Roofy Connect into one "Devices" picker.

### Lyrics And Karaoke

User-facing purpose: Read or sing along with the music.

Recommended location: Full player tab/section.

Simplified flow:

1. User opens full player.
2. Lyrics appear automatically when available.
3. Synced lyrics follow playback.
4. More options offer translation or romanization when available.

UI abstraction:

- Show: Lyrics, synced line highlight, translation toggle.
- Hide: lyrics provider names, fetch errors, raw LRC unless Advanced is open.

Primary action: Show lyrics.

Secondary actions: Translate, Report wrong lyrics, Full screen lyrics.

Advanced actions: choose provider, paste custom lyrics, view raw synced lyrics.

States:

- Empty: "Lyrics are not available for this song."
- Loading: "Finding lyrics..."
- Error: "Lyrics could not be loaded right now."
- Success: lyrics displayed.

Mobile/desktop consistency: Mobile prioritizes full-screen lyrics. Desktop can use a right panel or Now Playing section.

Final recommended UX: Lyrics should feel automatic and content-first. Provider mechanics stay hidden.

### Equalizer And Audio Quality

User-facing purpose: Tune how music sounds.

Recommended location: Player More menu and Settings > Playback.

Simplified flow:

1. User opens Playback settings.
2. User chooses a preset such as Balanced, Bass boost, Vocal, Night.
3. Advanced users open Equalizer for detailed controls.

UI abstraction:

- Show: presets, normalization, crossfade, gapless, sleep timer.
- Hide: DSP chain, audio session IDs, platform-specific implementation.

Primary action: Choose preset.

Secondary actions: Equalizer, Reset, Sleep timer.

Advanced actions: tempo, pitch, skip silence, exact ReplayGain settings.

States:

- Empty: default preset selected.
- Loading: no visible state unless applying takes time.
- Error: "This audio setting is not available on this device."
- Success: setting applied inline.

Mobile/desktop consistency: Preset names should match. Desktop may expose more detailed controls.

Final recommended UX: Put common listening controls first; keep expert DSP controls progressive.

### Scrobbling And Listening Stats

User-facing purpose: Save listening history to stats services and power personal recap.

Recommended location: Settings > Connected services and Library/Stats surfaces.

Simplified flow:

1. User opens Settings > Connected services.
2. User connects Last.fm or ListenBrainz.
3. App records plays automatically.
4. User sees status and can disconnect.

UI abstraction:

- Show: Connect Last.fm, Connect ListenBrainz, Listening stats.
- Hide: API calls, scrobble payloads, retry queues.

Primary action: Connect service.

Secondary actions: Disconnect, Sync now.

Advanced actions: view scrobble log, retry failed scrobbles.

States:

- Empty: "Connect a stats service to save your listening history."
- Loading: "Connecting..."
- Error: "Could not connect to this service. Check your account and try again."
- Success: "Listening history is connected."

Mobile/desktop consistency: Same labels. Mobile can focus on Last.fm if that is the current mature path.

Final recommended UX: Scrobbling is optional and user-controlled. It should not look like telemetry.

### Discord Status

User-facing purpose: Show friends what you are listening to.

Recommended location: Settings > Discord status.

Simplified flow:

1. User opens Discord status.
2. User turns on "Show what I am listening to".
3. App connects in the background.
4. User can choose privacy options.

UI abstraction:

- Show: On/off, show song title, show album art, privacy note.
- Hide: RPC, client ID, socket connection, rich presence payload.

Primary action: Turn on Discord status.

Secondary actions: privacy toggles.

Advanced actions: reconnect, view connection details.

States:

- Empty: feature off by default.
- Loading: "Connecting to Discord..."
- Error: "Discord status could not connect. Open Discord and try again."
- Success: "Discord status is on."

Mobile/desktop consistency: Use the same setting name. Platform availability can be shown as simple availability text.

Final recommended UX: Rename Discord RPC to Discord status everywhere.

### Smart Downloads

User-facing purpose: Keep favorite music offline automatically.

Recommended location: Settings > Downloads & Offline and Library > Downloads.

Simplified flow:

1. User turns on Smart downloads.
2. User chooses a storage limit.
3. App automatically saves liked and recently played music on Wi-Fi.
4. App removes old automatic downloads when space is needed.

UI abstraction:

- Show: Smart downloads, storage limit, Wi-Fi only.
- Hide: cache eviction algorithm, file cache, worker state.

Primary action: Turn on Smart downloads.

Secondary actions: storage limit, Wi-Fi only, clear automatic downloads.

Advanced actions: include/exclude playlists, exact retention rules.

States:

- Empty: "Turn on Smart downloads to keep favorites available offline."
- Loading: "Choosing songs to save..."
- Error: "Smart downloads paused because storage is low."
- Success: "Smart downloads is keeping music offline."

Mobile/desktop consistency: Mobile is primary. Desktop can use similar rules for library caching only if needed.

Final recommended UX: Smart downloads should be a simple promise with a storage budget, not a rule builder.

### Local Files On Mobile

User-facing purpose: Play audio files already on the phone.

Recommended location: Library > Local files and Settings > Library.

Simplified flow:

1. User opens Library > Local files.
2. App asks permission to scan a folder or device music.
3. Songs appear in Library.
4. User plays them like any other track.

UI abstraction:

- Show: Local files, choose folder, scan complete.
- Hide: SAF, MediaStore, content URIs, permissions internals.

Primary action: Add local files.

Secondary actions: rescan, remove folder.

Advanced actions: view folder path, include hidden files.

States:

- Empty: "Add music files from this device."
- Loading: "Scanning local files..."
- Error: "Roofy Music cannot access that folder. Choose another folder or update permission."
- Success: "Local files added."

Mobile/desktop consistency: Desktop local files are the personal library. Mobile local files should appear in the same Library model.

Final recommended UX: Local files are just another part of Library, not a separate player mode.

### Watch Lists And Auto Import

User-facing purpose: Automatically save new music from followed playlists, channels, or artists.

Recommended location: Desktop Library > Import music > Watch list.

Simplified flow:

1. User opens Watch list.
2. User adds a playlist, channel, podcast, or artist source.
3. App previews what will be watched.
4. New matching items are saved to the library automatically.

UI abstraction:

- Show: Watch list, new items found, auto-save on/off.
- Hide: polling schedule, source parser, extraction details.

Primary action: Add watch list.

Secondary actions: pause, remove, import now.

Advanced actions: schedule, filters, source URL details.

States:

- Empty: "Add a playlist or channel to save new music automatically."
- Loading: "Checking for new music..."
- Error: "This watch list could not be checked. Roofy Music will try again later."
- Success: "Watch list updated."

Mobile/desktop consistency: Desktop owns automation. Mobile can show status and allow pause/resume later.

Final recommended UX: This is a power feature. Keep it out of the default Library until users choose Import music.

### Duplicate Cleanup

User-facing purpose: Find and remove duplicate songs.

Recommended location: Desktop Library maintenance.

Simplified flow:

1. User opens Library maintenance.
2. App shows duplicate groups with recommended keep choice.
3. User reviews and confirms.
4. App removes duplicates or moves them to trash.

UI abstraction:

- Show: Duplicate songs, recommended copy, keep/remove.
- Hide: acoustic fingerprint, sourceUrl match, file hash.

Primary action: Review duplicates.

Secondary actions: Keep all, Remove selected, Merge metadata.

Advanced actions: match sensitivity, fingerprint details.

States:

- Empty: "No duplicates found."
- Loading: "Checking for duplicates..."
- Error: "Duplicate check could not finish."
- Success: "Duplicates cleaned up."

Mobile/desktop consistency: Desktop only at first. Mobile should not expose file cleanup.

Final recommended UX: Treat cleanup as guided maintenance, not a raw duplicate report.

### Backup And Export

User-facing purpose: Keep a copy of music, playlists, and library data.

Recommended location: Desktop Settings > Library > Backup and export.

Simplified flow:

1. User opens Backup and export.
2. User chooses Export library or Backup now.
3. App suggests a destination.
4. App saves files, playlists, and metadata.

UI abstraction:

- Show: Backup now, Export playlists, Restore backup.
- Hide: database schema, file manifest, internal IDs.

Primary action: Backup now.

Secondary actions: Export playlists, Restore backup, choose folder.

Advanced actions: include logs, export database, verify checksum.

States:

- Empty: "Create a backup to protect your library."
- Loading: "Creating backup..."
- Error: "Backup could not be completed. Check the destination and try again."
- Success: "Backup created."

Mobile/desktop consistency: Desktop owns full backups. Mobile can export playlists or app settings later.

Final recommended UX: Backup should reinforce local-first trust without exposing internals.

### Listen Together

User-facing purpose: Listen to the same music with other people.

Recommended location: Player More menu and Home promotional card only after the core player is stable.

Simplified flow:

1. User starts music.
2. User taps Listen together.
3. App creates a session link.
4. Friends join and share the queue.
5. Optional voice chat stays secondary.

UI abstraction:

- Show: Start session, invite link, listeners, shared queue.
- Hide: WebRTC, voice signaling, tunnel, session protocol.

Primary action: Start session.

Secondary actions: invite, end session, allow guests to add songs.

Advanced actions: voice settings, connection diagnostics.

States:

- Empty: "Start a session to listen with friends."
- Loading: "Starting session..."
- Error: "Could not start the session. Check your connection and try again."
- Success: "Session started."

Mobile/desktop consistency: Same session concepts. Mobile uses sheets; desktop uses a side panel.

Final recommended UX: Keep Listen Together as a social listening flow, not a party networking feature.

### Roofy Wrapped And Stats

User-facing purpose: See personal listening highlights.

Recommended location: Home seasonal card and Library > Stats.

Simplified flow:

1. App collects local listening history.
2. User opens Wrapped/Stats.
3. App shows top songs, artists, albums, genres, and listening time.
4. User can share a summary image.

UI abstraction:

- Show: listening highlights, time listened, top music.
- Hide: database queries, scrobble source, event IDs.

Primary action: View recap.

Secondary actions: share, filter by year/device/source.

Advanced actions: export history.

States:

- Empty: "Listen for a while to build your recap."
- Loading: "Building your recap..."
- Error: "Your recap could not be loaded right now."
- Success: recap displayed.

Mobile/desktop consistency: Mobile can lead with visual stories. Desktop can offer richer stats tables.

Final recommended UX: Stats should be delightful and private by default.

### Smart Radio And Auto-DJ

User-facing purpose: Start endless music from a song, artist, or mood.

Recommended location: Song/artist context menu, Home, Search.

Simplified flow:

1. User chooses Start radio from a song or artist.
2. App creates an endless queue.
3. User can like, skip, or save songs.
4. Queue adapts silently.

UI abstraction:

- Show: Start radio, playing similar songs, tune options.
- Hide: recommendation algorithm, similarity score, model/provider.

Primary action: Start radio.

Secondary actions: more like this, less like this, save queue as playlist.

Advanced actions: source preference, mood weights.

States:

- Empty: "Start radio from a song or artist."
- Loading: "Building radio..."
- Error: "Radio could not be started from this item."
- Success: queue starts.

Mobile/desktop consistency: Same "Start radio" label.

Final recommended UX: Radio should be a one-click listening flow, not a recommendation configuration screen.

### Mood And Natural Language Search

User-facing purpose: Find music by mood, activity, or plain language.

Recommended location: Search, behind normal search suggestions.

Simplified flow:

1. User types "upbeat songs for running".
2. Search returns songs, playlists, or radio suggestions.
3. User plays or saves results.

UI abstraction:

- Show: mood suggestions and playable results.
- Hide: NLP provider, prompt, embeddings, confidence scores.

Primary action: Play top mix or result.

Secondary actions: refine, save as playlist.

Advanced actions: opt-in smart search provider.

States:

- Empty: normal Search empty state.
- Loading: "Finding music..."
- Error: "Smart search is not available. Try a simpler search."
- Success: results displayed.

Mobile/desktop consistency: Same search box behavior. Desktop can show more filters.

Final recommended UX: Smart search enhances normal search. Do not make it a separate technical feature.

### Visualizer And CRT Theme

User-facing purpose: Make Now Playing feel alive and distinctive.

Recommended location: Full player and Appearance settings.

Simplified flow:

1. User opens full player.
2. Visualizer appears as an optional Now Playing mode.
3. User can choose simple visual themes.

UI abstraction:

- Show: Visualizer, theme choices, reduce motion.
- Hide: shader settings, audio analyzer internals, frame timing.

Primary action: Open visualizer.

Secondary actions: change theme, full screen.

Advanced actions: intensity, debug rendering stats.

States:

- Empty: "Play a song to start the visualizer."
- Loading: "Starting visualizer..."
- Error: "Visualizer is not available on this device."
- Success: visualizer runs.

Mobile/desktop consistency: Same visual language, adjusted for screen size and performance. Respect reduce-motion settings.

Final recommended UX: The visualizer should reinforce the brand, but never obscure playback controls.

### OpenSubsonic Documentation And Headless Mode

User-facing purpose: Let advanced users run Roofy as a personal music server.

Recommended location: Advanced settings and developer documentation.

Simplified flow:

1. User opens Advanced > Personal server.
2. User enables server mode or reads setup docs.
3. App displays connection info and warnings.

UI abstraction:

- Show to normal users: none by default.
- Show to advanced users: server mode, access URL, docs link.
- Hide from normal users: OpenSubsonic naming and API docs.

Primary action: Enable personal server.

Secondary actions: view docs, copy server address.

Advanced actions: bind address, port, auth, logs.

States:

- Empty: "Server mode is off."
- Loading: "Starting server..."
- Error: "Server mode could not start. Check the port and try again."
- Success: "Server mode is on."

Mobile/desktop consistency: Desktop-only management. Mobile only connects.

Final recommended UX: Keep this as an advanced capability. It should not appear in normal onboarding.

### Web Remote UI

User-facing purpose: Control playback from another device browser.

Recommended location: Desktop Settings > Devices > Web remote.

Simplified flow:

1. User opens Web remote.
2. App shows QR/link.
3. User opens the link on another device.
4. Remote controls playback.

UI abstraction:

- Show: Web remote, QR code, connected browser.
- Hide: manifest, remote protocol, local port.

Primary action: Open web remote.

Secondary actions: copy link, stop remote access.

Advanced actions: access logs, allowed devices.

States:

- Empty: "Use a browser to control playback from another device."
- Loading: "Starting web remote..."
- Error: "Web remote could not start."
- Success: "Web remote is ready."

Mobile/desktop consistency: Desktop hosts. Mobile browser can consume it; native mobile app should use Devices instead.

Final recommended UX: This is a convenience feature under Devices, not a main navigation item.

### Plugin System

User-facing purpose: Extend Roofy with optional providers and tools.

Recommended location: Advanced settings only until there is a curated consumer-safe plugin catalog.

Simplified flow:

1. Advanced user opens Plugins.
2. User installs or enables a plugin.
3. Plugin capability appears in the relevant normal area only if it has a polished UI.

UI abstraction:

- Show: plugin name, purpose, enable/disable, permissions.
- Hide: implementation hooks, package paths, provider classes.

Primary action: Enable plugin.

Secondary actions: disable, update, remove.

Advanced actions: install from file, view logs.

States:

- Empty: "No plugins installed."
- Loading: "Loading plugins..."
- Error: "This plugin could not be loaded."
- Success: "Plugin enabled."

Mobile/desktop consistency: Desktop first. Mobile plugins should be deferred unless there is a clear sandbox and UX model.

Final recommended UX: Do not expose plugins as a normal-user feature until the catalog and safety model are mature.

## 5. What To Hide From Normal Users

Hide these by default across the app:

- File paths, folder paths, temp paths, cache paths.
- Raw URLs, source URLs, video IDs, track IDs, playlist IDs.
- Navidrome, Subsonic, OpenSubsonic, yt-dlp, ffmpeg, ffprobe, spotdl, cloudflared.
- Codec, container, bitrate, stream manifest, extractor, provider selection.
- API tokens, generated credentials, ports, localhost addresses.
- Download workers, job IDs, queue payloads, retry counters.
- RPC, WebRTC, signaling, tunnel, media session payloads.
- Debug logs, stack traces, HTTP status codes, provider error codes.
- Metadata provider scores, raw tags, fingerprint data.
- Sync conflict payloads and source mappings.

These may appear only in Advanced, Developer, diagnostics, or explicit "View technical details" surfaces.

## 6. What To Automate

The app should decide these without asking normal users:

- Whether to play local, personal library, or streaming source.
- Best audio format for imports and offline saves.
- Best video quality for current connection and device.
- Metadata lookup, album art, and thumbnail selection.
- Library scan after import.
- Retry behavior after expired streams or temporary source errors.
- Sync timing for favorites, playlists, ratings, and history.
- Fallback source selection when a track cannot play.
- Offline storage cleanup for smart downloads.
- Signed-in browser/session usage for supported imports.
- Whether a search result should show "In your library".
- Device connection refresh.

Expose user controls only for preferences: quality preset, Wi-Fi-only downloads, storage limit, privacy, and advanced overrides.

## 7. Mobile Vs Desktop Behavior

Keep names, icons, and action hierarchy consistent:

- Play
- Add to queue
- Play next
- Add to playlist
- Add to my library
- Save offline
- Watch video
- Start radio
- Continue on device
- Show lyrics
- More

Mobile patterns:

- Bottom navigation.
- Bottom sheets for actions and setup.
- Persistent mini player above navigation.
- Full-screen player for lyrics, video, queue, and visualizer.
- Short, friendly status messages.

Desktop patterns:

- Left sidebar navigation.
- Context menus and keyboard shortcuts.
- Richer table/list views.
- Right-side queue or details panels.
- Dialogs for import, metadata editing, and maintenance.

Consistency rule: platform UI can differ, but the mental model and labels cannot.

## 8. Settings Cleanup Plan

Settings should be organized into six groups.

### General

- Language.
- Startup behavior.
- Library folder summary on desktop.
- Notifications.
- Device name.

### Playback

- Audio quality preset.
- Normalization.
- Crossfade.
- Gapless playback.
- Sleep timer.
- Equalizer presets.
- Advanced equalizer link.

### Downloads & Offline

- Save offline quality preset.
- Wi-Fi-only downloads.
- Storage limit.
- Smart downloads.
- Clear downloads.
- Import quality advanced link.

### Appearance

- Theme.
- Material You or system theme.
- Player layout.
- Visualizer.
- Reduce motion.

### Discord Status

- Show what I am listening to.
- Privacy options.
- Connect/disconnect.

### Advanced

- Personal server details.
- Manual server URL.
- LAN-only/tunnel options.
- Provider selection.
- Exact codec/format.
- Logs and diagnostics.
- Force resync.
- Reset credentials.
- Plugin management.
- Developer/debug info.

Move existing technical settings into Advanced. If a setting asks the user to understand implementation details, it does not belong in General, Playback, or Downloads.

## 9. Implementation Priorities

### Priority 1: Rename And Reposition

What changes:

- Rename technical features in UI strings.
- Move source/server/config controls out of primary screens.
- Standardize action labels.

Why:

- This immediately makes the app feel less technical without changing backend behavior.

Engineer tasks:

- Add a shared action label map for mobile and desktop.
- Audit menus for technical terms.
- Replace "RPC" with "Discord status".
- Replace "Subsonic/Navidrome" in normal UI with "Personal Library".
- Replace "download" for user-owned music actions with "Save offline" where the goal is offline listening.

### Priority 2: Unify Search, Library, And Player Actions

What changes:

- Every track row uses the same action model.
- Primary click/tap plays.
- More menu contains Add to queue, Save offline, Add to my library, Add to playlist, Watch video.

Why:

- Users learn one interaction pattern across the product.

Engineer tasks:

- Create a shared track action resolver based on item state.
- Use state labels: online, in library, saving, offline.
- Ensure mobile bottom sheets and desktop context menus contain the same actions in the same order.

### Priority 3: Build Devices As One Surface

What changes:

- Pairing, handoff, cast, and web remote live under Devices.

Why:

- Users think in devices, not protocols.

Engineer tasks:

- Add player Devices button.
- Merge available phones, desktops, speakers, TVs, and web remotes into one picker.
- Keep setup and diagnostics in Settings > Devices / Advanced.

### Priority 4: Make Imports A Guided Flow

What changes:

- Link imports, Spotify playlist import, recognition import, and Add to my library share the same save pipeline language.

Why:

- The user intent is always "keep this music", regardless of source.

Engineer tasks:

- Standardize states: matching, saving, saved, needs review, failed.
- Use one Downloads/Imports progress surface.
- Show quality and format only behind More options.

### Priority 5: Clean Settings

What changes:

- Rebuild Settings into General, Playback, Downloads & Offline, Appearance, Discord status, Advanced.

Why:

- Settings becomes predictable and stops being a dumping ground for backend controls.

Engineer tasks:

- Move debug/provider/server/log controls into Advanced.
- Add short descriptions only where they prevent mistakes.
- Keep destructive actions confirmable.

### Priority 6: Humanize Error Handling

What changes:

- Convert technical errors into user-facing messages with recovery actions.

Why:

- Normal users should know what to do next, not what subsystem failed.

Engineer tasks:

- Add error mapping per domain: playback, search, library, import, sync, devices.
- Log technical details silently.
- Provide "Try again", "Try another version", "Open settings", or "View details" when useful.

## 10. Suggested Renaming

| Technical or internal term | User-facing name |
|---|---|
| Navidrome / Subsonic source | Personal Library |
| OpenSubsonic server | Personal server |
| yt-dlp stream | Instant playback |
| yt-dlp download | Add to my library or Save offline |
| download worker | Background save |
| local cache | Offline songs |
| metadata sync | Update song info |
| syncAll | Sync library |
| RPC / Discord RPC | Discord status |
| cloudflared tunnel | Secure connection |
| remote manifest | Device connection |
| handoff JSON | Continue on device |
| ffmpeg / codec settings | Audio quality |
| source URL | Original link |
| provider | Source |
| extractor failed | This item cannot be played from this source right now |
| import job | Saving item |
| scrobble | Listening history |
| SAF / MediaStore | Local files |

## 11. Feature Prioritization

Core user-facing features:

- Home
- Search
- Player
- Mini player
- Queue
- Library
- Personal Library
- Playlists
- Add to my library
- Save offline
- Downloads
- Lyrics
- Playback handoff / Devices

Secondary user-facing features:

- Video playback
- Cast
- Recognition
- Spotify playlist import
- Metadata update
- Tag editor
- Equalizer presets
- Smart downloads
- Local files
- Listen Together
- Wrapped / Stats
- Smart radio
- Visualizer

Background automation:

- Source selection
- Stream resolution and retry
- Metadata fetching
- Cover art selection
- Library scans
- Sync favorites/playlists/history/ratings
- Smart download selection
- Duplicate candidate detection
- Import queue processing
- Scrobble retry

Advanced features:

- Manual server setup
- LAN-only/tunnel controls
- Exact format/codec selection
- Batch tag editing
- Re-encode tools
- Duplicate cleanup sensitivity
- Backup/export details
- Watch list schedules
- Provider selection
- Plugin management
- Headless/server mode
- OpenSubsonic documentation
- Web remote hosting

Debug/developer-only features:

- Logs
- Stack traces
- Internal IDs
- API responses
- RPC payloads
- WebRTC diagnostics
- Tunnel diagnostics
- Worker state
- Cache internals
- Raw metadata and fingerprints
- Test endpoints

## 12. Final Checklist For Engineers

- Every screen has one obvious primary action.
- Track actions appear in this order: Play, Play next, Add to queue, Add to playlist, Save offline, Add to my library, Watch video, More.
- Normal UI never displays raw provider names, IDs, ports, file paths, codecs, logs, or backend error codes.
- "Personal Library" is the user-facing name for owned/server-backed music.
- "Devices" is the shared surface for pairing, handoff, cast, and web remote.
- "Save offline" is used when the outcome is offline playback.
- "Add to my library" is used when the outcome is permanent ownership in the personal library.
- Metadata and artwork are updated automatically unless user review is needed.
- Imports use presets by default: Best balance, Smaller files, Highest quality.
- Sync runs silently and shows only simple status unless there is a user-actionable issue.
- Technical details are available only through Advanced or View technical details.
- Error messages explain the user impact and next step.
- Mobile uses bottom sheets; desktop uses menus, panels, and dialogs, with identical labels.
- Settings are grouped into General, Playback, Downloads & Offline, Appearance, Discord status, Advanced.
- Destructive actions require confirmation; non-destructive retries do not.
- The app never asks the user to configure something it can infer safely.
