# Desktop UX Implementation Changelog

Date: 2026-06-02

Scope: Roofy Music Desktop UX changes implemented from the unified audit, product UX integration plan, shared design system, and desktop UX/UI spec.

## Summary

This pass focused on desktop UX coherence without changing backend behavior. The work improves navigation discoverability, route recovery, player-bar hierarchy, track action labels, default library metadata, user-facing error copy, and Retro Monochrome state colors.

## Manual Check Order

Use this order for manual review:

1. Start the desktop app.
2. Check the left sidebar and command launcher.
3. Open `/local`, `/explore`, `/playing`, and `/servers`.
4. Check song, playlist-song, and queue context menus.
5. Check the player bar right-side controls.
6. Check album, song, and playlist library default metadata.
7. Trigger invalid-route and error-boundary recovery views if possible.
8. Check Settings sidebar customization.

## Navigation And IA

### Sidebar Defaults

Changed:
- Default sidebar now shows only core destinations: Home, Search, Now Playing, Songs, Albums, Artists, Playlists, and Settings.
- Existing settings migrate to the simplified defaults via settings version `42`.
- `Tracks` is user-facing as `Songs` in the sidebar while preserving the existing route/data model.
- `Artists` is the single default artist shortcut; the all-artist route remains optional as `All artists`.
- `Offline`, `Downloads`, `Favorites`, `Stats`, `Genres`, `Folders`, `Radio`, `Together`, `Online Music`, and individual playlist shortcuts are available in Settings but off by default.
- `Downloads` appears contextually when import/download jobs are queued, running, or failed.
- The hardcoded four-row Online section was removed; Online Music is now one optional shortcut to the existing online music page.

Files:
- `desktop/src/renderer/store/settings.store.ts`
- `desktop/src/renderer/features/sidebar/sidebar-nav-utils.ts`
- `desktop/src/renderer/features/sidebar/components/sidebar.tsx`
- `desktop/src/renderer/features/sidebar/components/collapsed-sidebar.tsx`
- `desktop/src/renderer/features/sidebar/components/mobile-sidebar.tsx`
- `desktop/src/renderer/features/settings/components/general/sidebar-reorder.tsx`
- `desktop/src/i18n/locales/en.json`

Manual checks:
- Fresh/default sidebar shows Home, Search, Now Playing, Songs, Albums, Artists, Playlists, and Settings.
- Existing settings profiles get the same simplified defaults after migration.
- Songs contains the Offline filter; `/library/songs?offline=1` still opens the offline-filtered view.
- Downloads opens `/imports` when manually enabled or when active/failed import jobs exist.
- Online Music appears as a single shortcut only when enabled in sidebar customization.
- Sidebar customization still includes Offline, Downloads, Together, Favorites, Stats, Genres, Folders, Radio, Online Music, and playlist shortcuts.

### Dormant Routes

Changed:
- `/explore` redirects to Home.
- `/playing` redirects to Now Playing.
- `/servers` redirects to Personal Library (`/local`).

Files:
- `desktop/src/renderer/router/app-router.tsx`

Manual checks:
- Navigate to `#/explore`; app lands on Home.
- Navigate to `#/playing`; app lands on Now Playing.
- Navigate to `#/servers`; app lands on Personal Library.
- These routes no longer show the invalid-route screen.

### Personal Library Route

Changed:
- `/local` now renders a Personal Library page.
- Removed spinner redirect into Settings Advanced.
- The page reuses the existing LocalTab/Personal Library surface.

Files:
- `desktop/src/renderer/features/local-first/routes/local-first-route.tsx`

Manual checks:
- Navigate to `#/local`.
- Confirm the page title is Personal Library & devices.
- Confirm the local library controls render without a redirect.
- Confirm advanced/server details remain inside the Personal Library surface rather than being the first visible concept.

### Sidebar Command Launcher

Changed:
- Sidebar launcher placeholder changed from `Search` to `Search or run command`.
- Added accessible label: `Open search and command palette`.
- Command palette server command group label changed to `Personal Library commands`.

Files:
- `desktop/src/renderer/features/sidebar/components/action-bar.tsx`
- `desktop/src/i18n/locales/en.json`

Manual checks:
- Sidebar top input reads `Search or run command`.
- Clicking it opens the command palette.
- Pressing Enter or Space while focused opens the command palette.
- Command palette uses Personal Library wording instead of Server commands.

## Player And Track Actions

### Context Menu Action Labels

Changed:
- Track context menus now use `Play next`.
- Track context menus now use `Add to queue`.
- YouTube playlist action now uses `Add to playlist` instead of hardcoded `Import to playlist`.
- Shared product action keys include `playNext`, `addToQueue`, and `addToPlaylist`.

Files:
- `desktop/src/shared/product-ux/action-label-keys.ts`
- `desktop/src/renderer/features/context-menu/actions/play-action.tsx`
- `desktop/src/renderer/features/context-menu/actions/play-next-action.tsx`
- `desktop/src/renderer/features/context-menu/actions/add-to-queue-action.tsx`
- `desktop/src/renderer/features/context-menu/actions/add-to-playlist-action.tsx`
- `desktop/src/i18n/locales/en.json`

Manual checks:
- Right-click a song row.
- Confirm the top actions read Play, Play next, Add to queue, Add to playlist.
- Confirm Play submenu uses Play, Play next, Add to queue for normal playback placement.
- Confirm queue behavior is unchanged: Play next inserts next; Add to queue appends.

### Queue Context Menu

Changed:
- Queue context menus only show Save offline / Add to my library if valid for selected tracks.
- Queue context menus only show Watch video if valid for selected tracks.
- Queue context menu keeps Add to playlist before save/watch actions.

Files:
- `desktop/src/renderer/features/context-menu/menus/queue-context-menu.tsx`

Manual checks:
- Right-click a normal library queue item.
- Confirm unavailable online-only actions are hidden.
- Right-click a YouTube/online queue item.
- Confirm Add to my library and Watch video appear only when supported.

### Player Bar Hierarchy

Changed:
- Primary player-bar companion row is now Devices, Together, Queue, Volume.
- Rating, video, Auto-DJ, sleep timer, lyrics, and favorite are secondary row actions.
- Technical player engine/config shortcut removed from player bar.
- Player engine/config remains available in Settings.

Files:
- `desktop/src/renderer/features/player/components/right-controls.tsx`
- `desktop/src/renderer/features/player/components/right-controls.module.css`

Manual checks:
- Play or queue a song.
- Confirm primary right-side controls are Devices, Together, Queue, and Volume.
- Confirm rating/video/Auto-DJ/sleep/lyrics/favorite are less dominant.
- Confirm no player-engine/settings icon is visible in the player bar.
- Confirm Settings still exposes playback/player engine controls.

## Library Defaults

### Technical Metadata Cleanup

Changed:
- Default album grid/detail metadata no longer foregrounds bitrate, BPM, or codec.
- Default song grid/detail metadata no longer foregrounds bitrate, BPM, or codec.
- Default playlist-song grid/detail metadata no longer foregrounds bitrate, BPM, or codec.
- Existing table registry still keeps technical columns available in table configuration.

Files:
- `desktop/src/renderer/store/settings.store.ts`

Manual checks:
- Open Albums in default grid mode.
- Open Songs in default grid/detail mode.
- Open a playlist song list in default grid/detail mode.
- Confirm bitrate, BPM, and codec are not shown as default visible metadata.
- Open table column configuration and confirm technical columns are still available when deliberately enabled.

## Empty, Error, And Recovery States

### Invalid Route

Changed:
- Invalid route screen now uses friendly copy.
- Shows `This page is not available`.
- Shows Back and Home recovery actions.
- Raw route path is muted instead of the primary message.

Files:
- `desktop/src/renderer/features/action-required/routes/invalid-route.tsx`
- `desktop/src/i18n/locales/en.json`

Manual checks:
- Navigate to an unknown hash route, such as `#/does-not-exist`.
- Confirm friendly title and description are shown.
- Confirm Back works.
- Confirm Home returns to Home.

### Error Boundaries

Changed:
- Page error boundary no longer shows raw exception text as primary copy.
- Root/router error boundary no longer shows raw exception text as primary copy.
- Both use plain recovery copy: `Something stopped working`.
- Development stack traces remain development-only.
- Primary recovery button now says `Try again`.

Files:
- `desktop/src/renderer/features/shared/components/page-error-boundary.tsx`
- `desktop/src/renderer/features/shared/components/router-error-boundary.tsx`
- `desktop/src/i18n/locales/en.json`

Manual checks:
- If you can trigger a page-level error, confirm user-facing recovery copy appears.
- Confirm technical stack traces appear only in development.
- Confirm Try again and Refresh actions are present.

## Visual System

### Retro Monochrome Semantic Colors

Changed:
- Error state is now distinct red.
- Warning state is now distinct warm yellow.
- Success state is now distinct green.
- Info remains muted neutral.

Files:
- `desktop/src/shared/themes/retro-monochrome/retro-monochrome.ts`

Manual checks:
- Trigger or inspect error/warning/success states in Retro Monochrome.
- Confirm states are distinguishable and not gray-only.
- Confirm the palette still reads restrained against near-black surfaces.

## Documentation Updates

Changed:
- Desktop UX spec now includes implementation progress for the shell pass and follow-up pass.

Files:
- `docs/DESKTOP_UX_UI_SPEC.md`
- `docs/DESKTOP_UX_IMPLEMENTATION_CHANGELOG.md`

Manual checks:
- Confirm `DESKTOP_UX_UI_SPEC.md` includes the 2026-06-02 implementation progress section.
- Use this changelog as the manual verification checklist.

## Validation Already Run

Passed:
- Focused ESLint on touched TypeScript/TSX files.
- Stylelint on changed CSS module.
- `en.json` parse check.
- Touched-path whitespace check.

Known validation limitation:
- Full web typecheck still fails on existing unrelated TypeScript issues outside this UX pass.
- `pnpm run typecheck:web` previously hit a pnpm non-interactive module purge prompt, so direct local `tsc.cmd` was used.

## Known Unrelated Working Tree State

Observed but not changed as part of this changelog:
- `AGENTS.md` is modified.
- Several UX docs are currently untracked in `docs/`.
- `PRODUCT_UX_SPEC.md` is currently untracked at repo root.

Do not treat those as UX implementation regressions unless they changed in your own review branch.
