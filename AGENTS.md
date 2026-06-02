# AGENTS.md

## Product Intent

Roofy Music Desktop is the desktop half of a unified Roofy Music product. It is a local-first personal music application forked from Feishin. It manages local audio libraries, plays through a desktop-style UI, supports local Navidrome/compatible servers, and optionally performs user-directed imports with local `yt-dlp` and `ffmpeg` tooling.

The desktop app must feel like the same product as Roofy Music Mobile: premium, intuitive, Retro Monochrome, music-first, and powerful without exposing technical complexity by default.

Do not add telemetry. Do not add remote services unless optional and user-controlled. Do not frame the app as a piracy tool.

## Required UX Documents

Before any UI, UX, navigation, styling, settings, player, search, library, imports, or route work, read:

- `PRODUCT_UX_SPEC.md`
- `docs/UX_AUDIT_UNIFIED_ROOFY_MUSIC.md`
- `docs/ROOFY_MUSIC_DESIGN_PHILOSOPHY.md`
- `docs/SHARED_DESIGN_SYSTEM.md`
- `docs/DESKTOP_UX_UI_SPEC.md`

If you change UI behavior or information architecture, update the relevant doc in the same change.

## Product Quality Bar

Treat Roofy Music as a consumer music app with Apple/Google-level polish:

- Main UI must be clear to non-technical users.
- Playback, search, library, downloads, and settings must be easy to understand.
- Advanced functionality stays available but belongs in Settings, Advanced, overflow menus, or contextual flows.
- Do not add visible complexity without a strong user-facing reason.
- Do not create orphaned routes, hidden screens, or one-off components.
- Every new UI state needs default, hover, pressed, focused, disabled, loading, empty, and error behavior where relevant.

## Retro Monochrome Direction

Preserve the Retro Monochrome aesthetic, but keep it mature:

- Near-black surfaces, restrained gray borders, minimal radius, crisp spacing.
- Retro/CRT effects should be subtle and must not reduce readability.
- Avoid generic gradients, colorful SaaS styling, or broad color palettes.
- Use accents sparingly and consistently.
- Desktop may use a clean UI font with monospace accents, but must remain visually aligned with mobile.

## Unified Desktop/Mobile Rules

Use consistent product language across repos:

- Home
- Search
- Library
- Now Playing
- Settings
- Downloads
- Imports
- Listen Together / Together
- Devices and Integrations
- Advanced

Desktop can use a sidebar, tables, hover controls, command palette, keyboard shortcuts, and resizable panels. Mobile can use bottom nav, sheets, touch lists, Android Auto, widgets, and system intents. Do not force identical layouts, but keep labels, mental models, and player anatomy aligned.

## Current Architecture

- `desktop/` is the real desktop product app.
- `desktop/src/renderer/app.tsx` is the renderer entry.
- `desktop/src/renderer/router/` owns routes.
- `desktop/src/renderer/layouts/` owns desktop/mobile shell layout.
- `desktop/src/renderer/features/sidebar/` owns sidebar navigation.
- `desktop/src/renderer/components/item-list/` owns dense library tables and grids.
- `desktop/src/renderer/features/player/` and `features/now-playing/` own playback and queue UX.
- `desktop/src/renderer/features/settings/` owns settings.
- `desktop/src/shared/themes/retro-monochrome/` owns the Retro Monochrome desktop theme.
- `desktop/src/main/features/core/local-first/` owns the Navidrome sidecar and importer.
- `src/server/` is an early scratch MVP kept only as reference until removed.
- `upstream-feishin/` and `upstream-navidrome/` are ignored reference clones.

## Known UX Debt

Documented in `docs/UX_AUDIT_UNIFIED_ROOFY_MUSIC.md` and `docs/DESKTOP_UX_UI_SPEC.md`:

- `/local` redirects to Settings Advanced instead of a real Local dashboard.
- Imports/download queue is not in default sidebar.
- Party and offline routes are hidden/disabled by default.
- Some route constants are unused (`/explore`, `/playing`, `/servers`).
- Sidebar search looks editable but opens command palette.
- Retro semantic colors need clearer error/warning/success distinction.
- Dense table defaults can expose too much power-user detail.

Do not paper over these with more routes or more buttons. Resolve through information architecture and progressive disclosure.

## UI Change Rules

- Prefer existing shared components in `desktop/src/shared/components/**` and feature-level patterns.
- Do not add one-off visual styles unless they become documented design-system variants.
- Do not put technical importer, binary, path, source, or engine controls in primary UI.
- Major features need a discoverable route or a documented reason to remain Advanced/Beta.
- Command palette is not a replacement for primary navigation.
- Icon-only controls need tooltips and keyboard focus.
- Empty states must explain the state and offer one useful next action.
- Error states must be friendly first and technical second.

## External Tools

The engine may call local executables if available:

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

