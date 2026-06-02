# Unified Product UX Audit: Roofy Music

Scope: Roofy Music Desktop (`C:\roofy-music-projects\roofy-music`) and Roofy Music Mobile (`C:\roofy-music-projects\roofy-music-mobile`).

Source basis:
- Desktop `PRODUCT_UX_SPEC.md`, `desktop/src/renderer/**`, `desktop/src/shared/**`, `AGENTS.md`.
- Mobile `PRODUCT_UX_SPEC.md`, `app/src/main/kotlin/com/metrolist/music/**`, `app/src/main/res/**`, `AGENTS.md`.
- This is an audit and documentation pass. It does not prescribe feature deletion or implementation work.

## Executive Summary

Roofy Music already has strong product ingredients: a distinctive Retro Monochrome identity, serious playback features, local-first desktop power, mobile YouTube Music reach, library management, imports, downloads, listen-together, recognition, widgets, Android Auto, and desktop-mobile handoff. The issue is not lack of capability. The issue is product coherence.

Desktop and mobile currently feel like two different products that share a name and some retro styling. Desktop is a dense Feishin-derived library workstation with many hidden or disabled Roofy-specific features. Mobile is a MetroList-derived Android music client with a stronger retro surface treatment but a crowded settings and feature ecosystem. Both expose advanced functionality before the user has a clear mental model.

The major redesign should not flatten Roofy into a generic Spotify clone. It should mature the retro language into a premium consumer system: simple first, powerful second, technical only when explicitly requested.

Current quality assessment: promising alpha product, not yet production-polished consumer UX.

## Severity Model

| Severity | Meaning |
| --- | --- |
| Critical | Blocks core comprehension, discoverability, or reliable use of a major product area. |
| High | Creates repeated confusion, cross-platform mismatch, or visible lack of polish. |
| Medium | Weakens usability, accessibility, or consistency but does not block common flows. |
| Low | Refinement issue, documentation issue, or low-frequency polish item. |

## Highest-Priority Issues

| Issue | Location / Component | Severity | Why it matters | Recommended fix | Platform | Timing |
| --- | --- | --- | --- | --- | --- | --- |
| Product IA differs by platform | Desktop `sidebar.tsx`, mobile `Screens.kt`, `NavigationBuilder.kt` | Critical | Users cannot transfer knowledge between apps. Desktop centers local library/server; mobile centers YouTube Music and bottom tabs. | Define shared product pillars: Home, Search, Library, Now Playing, Settings, plus contextual Together/Devices/Imports. Adapt layout per platform. | Both | Now |
| Advanced features are scattered | Desktop Settings Advanced, `/imports`, `/party`, `/youtube-music`; mobile Settings, integration routes, player menus | Critical | Users see either too little because routes are hidden or too much because settings are sprawling. | Create a shared "Advanced and Integrations" model with progressive disclosure and plain labels. | Both | Now |
| Core player design is not unified | Desktop `player-bar.tsx`, Now Playing queue; mobile `MiniPlayer.kt`, `Player.kt`, `Queue.kt` | High | Playback is the emotional center of a music app. Different hierarchy and controls make Roofy feel fragmented. | Standardize player anatomy: artwork, title/artist, primary transport, progress, queue, devices, overflow. | Both | Now |
| Retro design is inconsistent | Desktop `retro-monochrome.ts`, `retro_overrides.css`; mobile `RetroTheme.kt`, `Theme.kt` | High | Desktop uses Inter and radius 4-8px; mobile uses full monospace and 0dp radius. The same aesthetic reads differently. | Create shared token rules with platform adaptation: square language, near-black surfaces, restrained mono accents, defined type roles. | Both | Now |
| Discoverability gaps | Desktop imports, party, offline, playlists disabled in sidebar; mobile Listen Together, recognition, integrations hub | High | Important differentiators look unfinished or hidden. | Promote features only when useful and route them predictably. If not ready, explain entry in Settings. | Both | Now |
| Dead or unreachable routes | Desktop `/explore`, `/playing`, `/servers`; mobile `ExploreScreen`, `settings/integrations` hub | High | Future contributors and users encounter inconsistent IA. | Remove, wire, or document as intentionally dormant. No orphaned UX surfaces. | Both | Now |
| Accessibility weak spots | Mobile 32-40dp controls, no indication, RTL disabled; desktop gray semantic colors, dense tables | High | The retro aesthetic can fail normal use in cars, sunlight, keyboards, and screen readers. | Set minimum contrast, target size, focus, hover, pressed, and screen-reader rules. | Both | Now |

## Category Audit

### Navigation

Desktop:
- Strength: mature sidebar, command palette, back/forward, resizable shell.
- Problem: default sidebar disables or hides major product areas like imports, offline, playlists, and party. Search looks like an input but opens command palette.
- Problem: `/local` is a spinner redirect into Settings Advanced, which contradicts the "Roofy Local" mental model.

Mobile:
- Strength: simple top-level bottom nav and landscape rail.
- Problem: Listen Together is route-level but not a primary nav item; recognition is partly hidden behind long-press; integrations hub exists but is not reachable.
- Problem: top bar actions are concentrated on Home and do not map cleanly to the app-wide model.

Unified direction:
- Desktop navigation should use a left rail/sidebar because the screen supports dense library browsing.
- Mobile navigation should remain bottom-first.
- Both must share the same conceptual sections and naming.
- Advanced destination routing must be explicit and documented.

### Player

Desktop:
- Powerful player bar, full-screen player, visualizers, side queue, volume, queue controls, and player engine settings.
- Risk: too many secondary controls compete with playback if visible together.

Mobile:
- Mature mini player and expanded bottom-sheet player with queue and lyrics.
- Risk: player as a sheet can hide queue/lyrics hierarchy; technical playback errors are available but must remain progressively disclosed.

Unified direction:
- Primary transport controls must be visually dominant and stable.
- Queue, devices, lyrics, video, equalizer, and source/debug controls must be secondary.
- Technical source information belongs in overflow, details, or Settings.

### Search

Desktop:
- Route-based search by item type and global command palette.
- Problem: the sidebar search field is read-only but visually resembles an editable search input.

Mobile:
- Unified search input handles plain queries and YouTube URLs; local search appears above online search when typing.
- Problem: local vs online split can feel arbitrary to normal users.

Unified direction:
- Search should be one clear action: "Search music".
- Platform-specific refinements are allowed: desktop may keep command palette, but the field must communicate that it opens search/navigation. Mobile may show local/online result groups, but labels must be plain.

### Library

Desktop:
- Strongest area: tables, grids, filters, sorting, detail pages, infinite lists, configurable display.
- Problem: density and customization can overwhelm first-time users.

Mobile:
- Library tabs cover mix, playlists, songs, albums, artists, podcasts.
- Problem: tab reset behavior and many playlist/cache routes need clearer hierarchy.

Unified direction:
- Library should be the same mental model: Songs, Albums, Artists, Playlists, Downloads/Offline, Imports where applicable.
- Desktop can use dense tables. Mobile should use compact lists and tabs.
- Technical columns such as codec, bit depth, path, sample rate should be advanced table configuration, not default consumer UI.

### Downloads / Offline / Imports

Desktop:
- Imports route exists but is not in default sidebar; local import settings are buried.
- Offline filter exists but default sidebar item is disabled.

Mobile:
- Downloads, cached playlist, storage, updater, desktop import, and personal library are separate surfaces.

Unified direction:
- Users need one understandable place for "Saved and Downloads".
- Import jobs should show a persistent status entry while active.
- Legal/personal import framing stays, but avoid developer labels like `yt-dlp` in primary UI.

### Queue

Desktop:
- Side queue and Now Playing route are powerful.
- Risk: queue can feel like another list workstation rather than a lightweight playback companion.

Mobile:
- Queue is a player sub-page.
- Risk: hidden behind sheet state and menus.

Unified direction:
- Queue should expose play order, remove/reorder, save as playlist, clear, and source status.
- Keep advanced queue diagnostics out of the default view.

### Settings

Desktop:
- Settings covers general, playback, downloads, appearance, Discord, devices, advanced/local/hotkeys.
- Problem: Local engine, remote control, downloads, and imports overlap semantically.

Mobile:
- Settings hub is broad: appearance, content, AI, player, storage, privacy, backup, integrations, updater, Android Auto, account, equalizer.
- Problem: power-user controls can dominate before normal users understand the product.

Unified direction:
- Settings should use consistent groups: Account, Playback, Library and Downloads, Appearance, Devices and Integrations, Privacy, Advanced.
- Advanced is for technical, debugging, importer binaries, source endpoints, cache controls, and experimental toggles.

### Visual Design

Strengths:
- Near-black surfaces, gray borders, scanline/CRT direction, monospace on mobile, retro panels.
- Desktop has strong layout density and shared component wrappers.

Problems:
- Desktop and mobile do not share typography or radius rules.
- Semantic colors in desktop retro theme are gray, making errors/warnings/success hard to distinguish.
- Mobile touch targets and no-indication clickables weaken feedback.
- Decorative retro marks can drift into noise if applied everywhere.

Unified direction:
- Retro Monochrome should be systematic, not a collection of black panels.
- Use color sparingly: white/gray for structure, one warm warning accent, one magenta/yellow accent only for special states.
- Make focused, hover, pressed, disabled, and loading states explicit.

### Component Consistency

Desktop:
- Mantine wrappers and item-list components are extensive but dense.

Mobile:
- Mix of Material3 components and custom retro components.

Unified direction:
- Define canonical component roles: Button, IconButton, ListRow, Card, SearchInput, Tabs, Dialog, Toast, PlayerControl.
- Components may differ in implementation, but their visual anatomy and state model must match.

### Mobile-Specific UX

Key risks:
- 32dp retro buttons are below Android touch target expectations.
- `android:supportsRtl="false"` limits language support.
- Bottom sheet player and keyboard focus can fight during search.
- Android Auto needs real-device testing against release or unknown-source requirements.

Mobile priorities:
- Touch target pass.
- Player/search/back behavior pass.
- Settings reduction and integration hub cleanup.
- Android Auto browse/launcher verification.

### Desktop-Specific UX

Key risks:
- Too much power visible by default.
- Hidden Roofy-specific features make the product story unclear.
- Command palette can become a shortcut for developers rather than a discoverable user tool.
- Sidebar disabled items conflict with current product vision.

Desktop priorities:
- Navigation IA cleanup.
- Imports/offline/local dashboard clarification.
- Player bar hierarchy.
- Table defaults and advanced table configuration.

### Accessibility

Required standards:
- Minimum 44px desktop clickable target where practical; 48dp mobile touch target.
- Visible focus on every interactive control.
- Text contrast must pass WCAG AA for normal text unless decorative.
- Error and warning states must not rely on subtle gray differences alone.
- Screen-reader labels should not include decorative terminal punctuation unless needed.
- Motion must be subtle and avoid layout jumps.

### Documentation and Agent-Readiness

Both repos previously had short `AGENTS.md` files with product direction but not enough UI/UX guardrails. Future agents need explicit rules:
- Read these docs before UI work.
- Do not add primary UI controls without IA justification.
- Move technical controls to Settings or Advanced unless core to the immediate task.
- Update platform specs after changing UI behavior.

## Redesign Roadmap

### Phase 1: Documentation and Alignment

- Finalize this unified audit.
- Finalize `ROOFY_MUSIC_DESIGN_PHILOSOPHY.md`.
- Finalize `SHARED_DESIGN_SYSTEM.md`.
- Update both `AGENTS.md` files.
- Confirm source of truth for shared docs across repos.
- Decide shared product pillars and naming.

### Phase 2: Core Experience Cleanup

- Desktop: fix sidebar defaults and clarify `/local`, imports, offline, party, and playlists.
- Mobile: resolve Listen Together, recognition, integrations hub, account duplication, and dead screens.
- Align player anatomy and queue behavior.
- Align search labels and result grouping.
- Restructure Settings into shared groups.

### Phase 3: Visual System Polish

- Normalize typography roles across desktop and mobile.
- Apply shared spacing and border rules.
- Define component states.
- Add proper empty, loading, and error states.
- Tune CRT/scanline effects so they support atmosphere without reducing readability.

### Phase 4: Advanced Features and Settings Cleanup

- Move rare technical controls into Advanced.
- Add progressive disclosure for importer, local engine, source diagnostics, cache, player engine, and developer-style settings.
- Keep powerful flows, but reduce default visual noise.

### Phase 5: Final Production-Quality Pass

- Run accessibility pass on contrast, targets, keyboard, TalkBack/screen reader, focus, car use.
- Test desktop responsive behavior and mobile landscape.
- Run Android Auto and desktop remote/handoff checks.
- Create regression checklist for player, search, library, downloads, settings, and integrations.

## Acceptance Criteria for a Successful Rework

- A normal user can explain the app structure after five minutes: Home, Search, Library, Player, Settings.
- Desktop and mobile use the same labels for the same product concepts.
- Player controls feel like the same product adapted to each form factor.
- Retro Monochrome reads as premium, not unfinished or low-contrast.
- Advanced features remain available but do not clutter the main UI.
- Every major route has a clear entry point or is removed/documented as dormant.
- Empty, loading, and error states are friendly and non-technical by default.
- All primary controls have accessible target size, visible focus, and clear state feedback.
- New UI changes update the relevant platform spec and design-system notes.

