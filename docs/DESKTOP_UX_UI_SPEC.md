# Desktop UX/UI Specification: Roofy Music

Repository: `C:\roofy-music-projects\roofy-music`

This document supplements `PRODUCT_UX_SPEC.md` and is the working spec for redesigning the desktop app as part of one Roofy Music product.

## Current Desktop App Structure

Primary implementation:
- Renderer entry: `desktop/src/renderer/app.tsx`.
- Routing: `desktop/src/renderer/router/app-router.tsx`, `routes.ts`.
- Shells: `layouts/responsive-layout.tsx`, `layouts/default-layout.tsx`, `layouts/mobile-layout/mobile-layout.tsx`.
- Desktop chrome: `layouts/default-layout/left-sidebar.tsx`, `right-sidebar.tsx`, `player-bar.tsx`, `retro-top-bar.tsx`, `retro-status-bar.tsx`.
- Navigation: `features/sidebar/components/sidebar.tsx`, `settings.store.ts` sidebar settings.
- Library lists: `components/item-list/**`, `components/item-card/**`, `features/shared/components/library-*`.
- Settings: `features/settings/**`.
- Player and queue: `features/player/**`, `features/now-playing/**`.
- Retro theme: `desktop/src/shared/themes/retro-monochrome/**`.
- Product UX utilities: `desktop/src/shared/product-ux/**`, `ProductUxEmptyState`.

## Current Main Screens

| Screen / Route | Purpose | Current quality | Redesign direction |
| --- | --- | --- | --- |
| Home `/` | Local and YouTube Music carousels | Useful but source hierarchy can feel mixed. | Make Home a calm dashboard: Continue listening, Recently added, Downloads/Imports status, then discovery. |
| Library lists `/library/*` | Albums, songs, artists, genres, folders | Powerful and mature, but dense. | Keep density for desktop, simplify default columns and move technical columns to table config. |
| Search `/search/:itemType` | Search by library entity type | Functional, fragmented by type. | Unify search landing with type filters; command palette remains separate but clearly labeled. |
| Now Playing `/now-playing` | Queue and playback context | Strong power-user route. | Make it a premium player/queue page, not just another table. |
| Player bar | Persistent playback | Central but control hierarchy needs discipline. | Group transport as primary; queue/devices/visualizer/engine in secondary cluster or overflow. |
| Settings `/settings` | Preferences and advanced configuration | Very broad. | Re-group into Account, Playback, Library and Downloads, Appearance, Devices and Integrations, Privacy, Advanced. |
| Imports `/imports` | Download/import queue | Important but hidden. | Add visible navigation when jobs exist; otherwise Settings or Library/Saved entry. |
| YouTube Music `/youtube-music` | Online source | Electron-only and separate. | Label as Online Music or YouTube Music consistently with mobile search/source model. |
| Party `/party` | Listen-together desktop mode | Hidden by default. | Either surface as Together or mark as beta under Advanced/Integrations. |
| Action Required/Login | Server setup | Functional but technical. | First-run experience should explain local-first setup in plain language. |
| Remote PWA `desktop/src/remote` | Remote control | Useful but obscure. | Link from Devices and Integrations, not only Advanced. |

## Current User Flows

### First launch / local server setup

Current:
- `AppOutlet` and `AuthenticationOutlet` gate server state.
- `ActionRequiredRoute` and `LoginRoute` handle missing server or network problems.
- `/local` redirects to Settings Advanced with a spinner.

Problems:
- Local-first setup is the product foundation but feels like an implementation detail.
- The route named Local does not have a product-level dashboard.

Required direction:
- Create a plain first-run flow: Choose music folder, start local library, import optional music, open library.
- Reserve server details, paths, and logs for Advanced.

### Play from library

Current:
- Library list rows and cards support play, double-click, context menus, drag/reorder, favorites, ratings.

Problems:
- Many controls compete in dense rows.
- Normal users may not know whether click selects, opens, plays, or expands.

Required direction:
- Establish row interaction rules: single click opens/selects depending context, double-click plays on desktop, explicit play button on hover/focus.
- Keep rating and advanced actions off by default unless enabled.

### Import/download

Current:
- Imports route exists but is not in default sidebar.
- Download/local settings exist across Downloads and Advanced.

Problems:
- Users who import audio need status and recovery.
- The product story is buried.

Required direction:
- Add a visible Imports/Downloads status entry when active.
- Use "Import music" and "Downloads" labels in primary UI.
- Keep `yt-dlp`, `ffmpeg`, binary paths, and logs in Advanced.

### Command palette

Current:
- Sidebar action bar search opens command palette.

Problems:
- It looks like a search field, but it is a launcher.

Required direction:
- Rename placeholder to "Search or run command" or make it a real search field.
- Command palette must not be the only path to a major feature.

## Desktop-Specific Interaction Rules

- Use hover controls for secondary row actions, but ensure keyboard focus reveals the same actions.
- Support keyboard shortcuts, but provide visible menu alternatives.
- Dense table mode is allowed for desktop. Default mode should still be understandable.
- Resizable sidebars should preserve minimum usable widths.
- Right-click menus are power-user affordances; do not hide primary actions exclusively there.
- Use tooltips for icon-only controls.

## Layout Recommendations

- Keep the three-zone desktop shell: sidebar, content, player/queue.
- Do not add more global bars unless they carry persistent status.
- Retro top/status bars should be subtle and should not steal vertical space from library content.
- Right queue should feel attached to player state, not a separate administrative panel.
- Use page headers consistently through `PageHeader` and `LibraryHeaderBar`.

## Component-Level Recommendations

| Component | Issue | Recommendation |
| --- | --- | --- |
| `Sidebar` | Disabled key routes hide product value. | Revisit defaults for Playlists, Offline, Imports, Party. |
| `ActionBar` search | Read-only but looks editable. | Change affordance or make inline search real. |
| `ItemTableList` | Very configurable, high complexity. | Define consumer default columns and advanced table config. |
| `ItemCardControls` | Play/favorite/rating/more can overcrowd cards. | Show play and more by default; rating/favorite based on context. |
| `PlayerBar` | Multiple secondary controls may compete. | Primary transport center, secondary cluster right, source/debug overflow. |
| `Settings` tabs | Local/downloads/devices overlap. | Re-group around user tasks. |
| `ProductUxEmptyState` | Good start. | Standardize all empty states to include next action. |

## What Must Stay Consistent With Mobile

- Product terms: Home, Search, Library, Now Playing, Settings, Downloads, Listen Together/Together.
- Player anatomy and playback error handling model.
- Retro Monochrome token roles.
- Settings group names.
- Advanced-feature placement rules.
- User-facing copy style.

## What May Differ From Mobile

- Sidebar instead of bottom navigation.
- Tables and grids with column configuration.
- Hover states, right-click menus, command palette, keyboard shortcuts.
- Multi-window/native desktop affordances.
- Full route for Now Playing and side queue.

## Known Desktop UX Debt

| Issue | Severity | Fix path |
| --- | --- | --- |
| `/local` redirects to Settings Advanced | Critical | Dedicated Local dashboard or rename links/docs. |
| Imports not in default sidebar | High | Add discoverable entry/status. |
| Party disabled in default sidebar | High | Surface as Together beta or document hidden status. |
| Offline sidebar disabled | High | Enable when downloads exist. |
| Unused routes `/explore`, `/playing`, `/servers` | Medium | Remove, wire, or document. |
| Semantic retro colors are gray-only | Medium | Define error/warning/success colors. |
| Invalid route shows raw path | Low | Friendly message with safe next action. |

## Implementation Progress

2026-06-02 desktop shell pass:
- Default sidebar settings now expose Playlists, Offline, Downloads, and Together.
- Existing settings migrate to the same sidebar defaults on version 41.
- Offline now renders in the Library group instead of being filtered out of the sidebar.
- Party is labeled Together and rendered as a top-level contextual route.
- Sidebar launcher copy now says "Search or run command" to distinguish it from route search.
- `/local` now renders a Personal Library page instead of a spinner redirect into Settings.
- Invalid routes now show friendly recovery copy with Back and Home actions.
- Retro Monochrome state colors now use distinct error, warning, and success colors.

2026-06-02 follow-up desktop UX pass:
- Dormant `/explore`, `/playing`, and `/servers` paths now redirect to Home, Now Playing, and Personal Library.
- Song context menu labels now use "Play next" and "Add to queue" while preserving queue behavior.
- Queue context menus only show Save offline / Watch video when those actions are valid for the selected tracks.
- Player bar right controls now separate primary playback companions (Devices, Together, Queue, Volume) from secondary actions.
- The technical player engine shortcut was removed from the player bar; engine setup remains in Settings.
- Album, song, and playlist default grid/detail metadata no longer foreground bitrate, BPM, or codec.
- Page and app error boundaries now show plain recovery copy instead of raw error messages.

2026-06-02 sidebar simplification pass:
- Default sidebar now prioritizes core destinations: Home, Search, Now Playing, Songs, Albums, Artists, Playlists, and Settings.
- Offline is treated as a Songs filter/optional shortcut rather than a default destination.
- Downloads is contextual by default: it appears when queued/running/failed import jobs need attention, and can still be enabled manually.
- Online Music is a single optional shortcut instead of a hardcoded four-item Online section.
- The sidebar playlist tree stays on by default; Together, Favorites, Stats, Genres, Folders, Radio, and secondary artist views are available in Settings but off by default.
- Existing settings migrate to the simplified sidebar defaults on version 42.

## Implementation Notes

- Changes to shell/nav should start in `settings.store.ts`, `features/sidebar`, and `layouts/default-layout`.
- Changes to library density should start in `components/item-list/**` and feature list headers.
- Changes to retro tokens should start in `desktop/src/shared/themes/retro-monochrome/retro-monochrome.ts` and `retro_overrides.css`.
- Changes to settings IA should update `features/settings/**`, `PRODUCT_UX_SPEC.md`, and this document.
