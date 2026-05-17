# Legal And Policy Notes

Roofy Music is a local library manager with optional import support. It must not be positioned as a public piracy product or a tool for bypassing paid access.

## Safe Product Framing

- User-owned local music library.
- User-initiated imports from URLs the user provides.
- Intended for public-domain, Creative Commons, personally owned, or otherwise authorized content.
- No hosted catalog.
- No public sharing.
- No automated scraping defaults.

## Required UX Copy

Downloader surfaces should include concise copy like:

> Only import media you have the right to download or use. You are responsible for respecting copyright, site terms, and local law.

## Avoid

- "Download any song."
- "Free Spotify."
- "Bypass premium."
- Built-in lists of copyrighted music sources.
- Cookie extraction flows as a default feature.

## Implementation Guardrails

- Keep imports explicit and user initiated.
- Store original URL for provenance and duplicate detection.
- Prefer conservative defaults: audio-only, no playlist unless user opts in.
- Make cancellation obvious.
- Show errors honestly.
