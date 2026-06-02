# Shared Design System: Roofy Music

This document defines the cross-platform design system for Roofy Music. It keeps the Retro Monochrome aesthetic while making it systematic, accessible, and production-ready.

## Core Tokens

### Color

| Role | Value guidance | Usage |
| --- | --- | --- |
| Background | `#050505` to `#080808` | App root, navigation base. |
| Surface 1 | `#0B0B0B` | Cards, lists, panels. |
| Surface 2 | `#101010` | Selected or elevated panels. |
| Surface 3 | `#151515` | Highest local emphasis. |
| Border strong | `#B8B8B8` | Active focus, selected key controls. |
| Border default | `#7A7A7A` | Standard panel and input borders. |
| Border muted | `#3F3F3F` | Dividers and disabled structure. |
| Text primary | `#F1F1F1` | Important labels, titles, active controls. |
| Text secondary | `#D0D0D0` | Body and list text. |
| Text muted | `#A0A0A0` minimum | Metadata. Avoid lower contrast for small text. |
| Text disabled | `#707070` | Disabled or unavailable controls only. |
| Accent magenta | sparse | Special brand highlight, not broad UI fill. |
| Accent yellow/warning | sparse | Warnings, important notices. |
| Error | distinguishable from text | Playback/network/import failures. |
| Success | distinguishable from text | Import complete, saved, connected. |

Rules:
- Do not introduce broad gradients.
- Do not use one-note purple, beige, blue, or brown palettes.
- Do not rely on gray-only differences for error/warning/success when the message is important.

### Typography

Recommended roles:

| Role | Desktop | Mobile |
| --- | --- | --- |
| Display | 28-32px, weight 700 | 24-28sp, weight 700 |
| Title | 20-24px | 18-22sp |
| Section | 15-17px, weight 650 | 15-17sp, weight 650 |
| Body | 14px | 14sp |
| Metadata | 12-13px | 12-13sp |
| Control | 12-14px, weight 650 | 12-14sp, weight 650 |
| Code/technical | monospace only | monospace only |

Rules:
- Mobile may use monospace more broadly, but long text must remain readable.
- Desktop should use a clean UI font with monospace accents unless the redesign intentionally changes the full desktop type system.
- Avoid uppercase for long labels.
- No negative letter spacing.

### Spacing

Use an 8px/dp rhythm:
- 4: tight internal gaps.
- 8: default icon/text gap.
- 12: compact list horizontal padding.
- 16: default page/list padding.
- 24: section gap.
- 32: major region gap.
- 48: screen-level separation or touch target.

### Radius and Borders

- Mobile retro controls may use 0dp radius.
- Desktop may use 4px radius for platform polish, but avoid rounded pill-heavy surfaces.
- Cards should be 0-8px radius only.
- Standard border: 1px/dp.
- Use double borders rarely for selected nav/player emphasis.

## Components

### Buttons

Variants:
- Primary: one per local context, used for Play, Retry, Connect, Import.
- Secondary: bordered neutral button.
- Ghost/icon: low emphasis toolbar actions.
- Destructive: clear label, confirmation when needed.

Rules:
- Desktop buttons: visible hover, focus ring, pressed inset/background.
- Mobile buttons: 48dp touch target for primary actions.
- Icon-only buttons require tooltip/content description.

### Inputs and Search

Search input:
- Always clearly editable, or clearly a command/search launcher.
- Placeholder should be task-based: "Search music", "Search songs, artists, albums".
- Include clear action when text is present.

Text inputs:
- Bordered surface, visible focus, readable labels.
- Technical inputs go in Advanced or setup flows.

### Cards and List Rows

Cards:
- Use for album/playlist/grid items and repeated media objects.
- No nested cards.
- Artwork, title, subtitle, and primary hover action should be stable.

Rows:
- Desktop dense rows may be 40px, but row hover and keyboard focus must be obvious.
- Mobile rows should preserve 48dp touch target.
- Metadata columns like codec/path/bitrate are advanced table options.

### Navigation

Desktop:
- Sidebar sections are allowed but must map to product pillars.
- Disabled navigation items should not appear unless there is clear "coming soon" affordance.
- Command palette should not be the only entry point for a major feature.

Mobile:
- Bottom nav should contain stable top-level destinations.
- Long-press can be a shortcut, not the only visible route.
- Landscape rail should mirror bottom nav.

### Player Controls

Required:
- Stable artwork/title/artist region.
- Primary transport cluster.
- Progress.
- Queue.
- Devices/output where available.
- Overflow.

State rules:
- Loading media should not collapse layout.
- Error state appears in player context and offers Retry.
- Technical playback details behind disclosure.

### Dialogs, Modals, Sheets

- One clear title.
- One primary action and one cancel/close path.
- Destructive actions use explicit copy.
- Mobile sheets should not become settings pages. If content is complex, route to a full screen.
- Desktop modals must trap focus and support Escape.

### Toasts and Notifications

- Use toasts for non-blocking feedback only.
- Critical errors require inline state or dialog.
- Keep copy plain.
- Include action when useful: Retry, Open downloads, View details.

### Tabs and Segmented Controls

- Use tabs for peer views within one destination.
- Active tab click must not reset to a different tab.
- Use segmented controls for mode switches with 2-4 choices.

### Progress, Sliders, and Seek Bars

- Progress bars: determinate when possible.
- Player seek bars must have accessible position and duration.
- Sliders need visible thumb or equivalent focus marker.
- Do not use decorative squiggles where precision matters unless the state remains clear.

## States

| State | Requirement |
| --- | --- |
| Default | Clear boundary and purpose. |
| Hover | Desktop only; visible background or border change. |
| Pressed | Immediate tactile feedback. |
| Focused | Strong visible ring/border. |
| Selected | Stronger than hover; not only text color. |
| Disabled | Reduced but still legible. |
| Loading | Skeleton or stable spinner, no layout jump. |
| Error | Friendly message, recovery action, technical disclosure if needed. |
| Empty | Explain and offer next action. |

## Good and Bad Usage

Good:
- "Downloads" as a sidebar item when downloads exist.
- Player overflow containing "Audio settings" and "View details".
- Search results grouped as Songs, Albums, Artists, Playlists.
- Advanced settings containing importer binary paths and cache diagnostics.

Bad:
- Showing `yt-dlp` or raw stream status in the main player.
- Hiding Party or Imports only behind command palette.
- Using gray-only toast colors for error/success.
- Adding another custom button style for a one-off screen.
- Putting UI cards inside other cards.

## Platform Adaptation

Desktop:
- Dense tables, hover controls, command palette, keyboard shortcuts, and resizable panels are appropriate.
- Default views still need consumer-readable labels and simple hierarchy.

Mobile:
- Touch-first lists, bottom sheets, bottom navigation, Android Auto, widgets, and system intents are appropriate.
- Avoid exposing dense technical controls without a settings route.

