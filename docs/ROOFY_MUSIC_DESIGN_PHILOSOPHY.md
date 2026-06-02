# Roofy Music Design Philosophy

This document defines the permanent UX and product-quality rules for Roofy Music across desktop and mobile. It is a design reference for human contributors and AI agents.

## Product Principles

1. Roofy Music is one product across devices.
2. Music comes first: playback, discovery, library, search, and saved music are the core.
3. The product is powerful, but the default experience must be simple.
4. Retro Monochrome is the identity. It must be refined, intentional, readable, and premium.
5. Technical capabilities stay available without becoming the first thing users see.
6. No telemetry. Downloader/import behavior remains user-directed and lawful/personal in framing.

## User Experience Principles

- A first-time user should understand the app structure without reading documentation.
- Every visible control must have a clear job.
- Primary actions must be obvious; secondary actions must be findable; advanced actions must be contained.
- Avoid exposing implementation terms in primary UI: `yt-dlp`, `InnerTube`, `Navidrome sidecar`, codec details, cache internals, stream URLs, and debug codes belong in Advanced, details, or technical disclosure.
- Preserve feature depth, but use progressive disclosure.
- Avoid duplicate entry points unless they serve different contexts clearly.
- A screen should have one primary purpose. If it has several, split it or group it into tabs/sections.

## Unified Product Pillars

Use these concepts consistently across platforms:

| Pillar | Purpose |
| --- | --- |
| Home | A calm starting point for recent, recommended, and high-value content. |
| Search | Find songs, albums, artists, playlists, URLs, and commands where appropriate. |
| Library | User-owned or saved music: songs, albums, artists, playlists, downloads/offline. |
| Now Playing | Playback, queue, lyrics, devices, and current media context. |
| Settings | Preferences, account, devices, integrations, privacy, and advanced tools. |
| Together | Social listening or party mode, surfaced contextually or as a product pillar when mature. |

Desktop may present these as a sidebar. Mobile may present them as bottom navigation, top actions, and sheets. Labels and meaning must remain consistent.

## Retro Monochrome Visual Principles

- Near-black is the base. Use surface layers deliberately, not randomly.
- Borders are structure, not decoration. Use them to clarify groups and interaction boundaries.
- Radius stays minimal. Desktop may use small radii for native platform fit; mobile may remain square. Avoid pill-heavy UI except for chips or segmented controls.
- Monospace is a brand accent and can be used broadly on mobile, but readability wins. Desktop may use a clean system font with monospace accents.
- CRT/scanline/noise effects must be subtle. They should never reduce text legibility or make the app feel like a novelty skin.
- Accent color is rare. Use it for selected state, warning, or important feedback. Do not introduce generic gradients or colorful SaaS palettes.
- Avoid decorative clutter. Retro can be expressed through rhythm, type, borders, scanlines, and interaction states.

## Navigation Principles

- Primary navigation should contain only product pillars.
- Rare flows belong in Settings, overflow menus, or contextual surfaces.
- Hidden routes are product debt unless clearly documented as dormant.
- Desktop can expose more navigation density than mobile, but defaults should still be consumer-readable.
- Mobile should keep primary navigation stable and minimize top-bar action overload.
- Re-tapping an active tab should either do nothing or scroll to top. It should not switch to another tab or reset context unexpectedly.

## Interaction Principles

- Controls must communicate state: default, hover, pressed, focused, selected, disabled, loading.
- Icon-only controls require tooltips on desktop and content descriptions on mobile.
- Destructive actions require confirmation unless trivially reversible.
- Drag, reorder, and multi-select should be available in power contexts but not required for core use.
- Do not rely only on long-press for discoverability.
- Keyboard shortcuts are enhancements, not primary discoverability.
- Motion should be short, stable, and purposeful. Avoid bouncing, layout jumps, or excessive animated decoration.

## Player Principles

The player is the product center. It must feel stable and premium.

Required anatomy:
- Current artwork.
- Title and artist.
- Primary transport: previous, play/pause, next.
- Progress and duration.
- Queue access.
- Devices/output access when available.
- Overflow for more actions.

Secondary player actions:
- Lyrics, equalizer, video, sleep timer, radio, add to playlist, share, details.

Advanced player actions:
- Source diagnostics, stream/client information, cache recovery, player engine/debug settings.

## Search and Results Principles

- Search should be one clear user action.
- Group results with plain labels: Songs, Albums, Artists, Playlists, Local, Online.
- URL parsing should feel helpful, not technical.
- Empty search states should suggest useful actions.
- Desktop command palette can coexist with search, but must be labeled as command/search if it launches commands.
- Search history and privacy controls belong in Settings, not in the default search surface.

## Settings and Advanced Feature Principles

Use this decision rule:

| Question | If yes | If no |
| --- | --- | --- |
| Is it needed for playing, searching, or browsing music today? | Main UI or primary screen. | Consider Settings or overflow. |
| Is it used often by normal users? | Keep visible but secondary. | Put in Settings. |
| Is it technical or diagnostic? | Advanced. | Use plain label and contextual placement. |
| Is it destructive or risky? | Confirmation and clear copy. | Standard action. |
| Is it platform-specific? | Platform settings section. | Shared location. |

Recommended settings groups:
- Account.
- Playback.
- Library and Downloads.
- Appearance.
- Devices and Integrations.
- Privacy.
- Advanced.
- About.

## Accessibility Standards

- Mobile target size: 48dp minimum for primary touch controls.
- Desktop target size: 44px preferred for primary controls, 32px minimum only for dense table/icon affordances with hover/focus.
- All interactive controls need visible focus.
- Text contrast should pass WCAG AA for normal text.
- Semantic state colors must be distinguishable by more than brightness when possible.
- Error messages must be user-facing first, technical details second.
- Avoid decorative punctuation in screen-reader labels.
- Do not use all-uppercase long labels.
- Support keyboard navigation for desktop lists, dialogs, menus, and player controls.

## Copywriting and Labeling Standards

- Use human task labels: "Downloads", "Saved music", "Import music", "Listen together".
- Avoid implementation labels in primary UI.
- Use verbs for actions: Play, Save, Download, Import, Connect, Retry.
- Use nouns for destinations: Home, Search, Library, Settings.
- Error copy should say what happened and what the user can try.
- Keep retro flavor restrained. Do not let terminal jokes or symbols replace clarity.

## Empty, Loading, and Error States

Empty states:
- Explain what is missing.
- Offer one useful next action.
- Avoid blaming the user.

Loading states:
- Use skeletons for lists and carousels.
- Avoid full-screen spinners after initial app startup unless unavoidable.
- Keep player state stable during loading.

Error states:
- Show friendly copy first.
- Provide Retry when meaningful.
- Hide technical details behind disclosure.
- Persist critical playback errors near the player, not as transient toast only.

## Desktop vs Mobile Consistency

Consistent:
- Naming.
- Player anatomy.
- Library categories.
- Settings groups.
- Visual tokens.
- Empty/loading/error language.
- Advanced feature placement rules.

Allowed to differ:
- Desktop may use sidebars, tables, hover menus, command palette, keyboard shortcuts, and resizable panels.
- Mobile may use bottom navigation, sheets, tabs, touch-first lists, Android Auto settings, widgets, and system intents.
- Desktop can expose denser library controls. Mobile should favor progressive disclosure.

## Product-Quality Review Checklist

Before shipping UI/UX work:
- Is the purpose obvious?
- Is the primary action visually clear?
- Did we avoid adding main-UI clutter?
- Does the same concept use the same name on desktop and mobile?
- Does it preserve Retro Monochrome without sacrificing readability?
- Are focus, pressed, loading, disabled, and error states defined?
- Are advanced/technical details contained?
- Are empty and error states friendly?
- Did documentation and `AGENTS.md` stay accurate?

