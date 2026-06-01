/** YouTube watch URLs use an 11-character video id (Spotify track ids are longer). */
export const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export const isYoutubeVideoId = (value?: null | string): value is string =>
    Boolean(value && YOUTUBE_VIDEO_ID_PATTERN.test(value.trim()));

export const extractYoutubeVideoId = (input?: null | string): string | undefined => {
    if (!input) return undefined;

    const trimmed = input.trim().replace(/^ytm:/, '');
    const bracketMatch = /\[([A-Za-z0-9_-]{11})\](?:\.[^.]+)?$/.exec(trimmed);
    if (bracketMatch?.[1] && isYoutubeVideoId(bracketMatch[1])) return bracketMatch[1];

    if (isYoutubeVideoId(trimmed)) return trimmed;

    try {
        const url = new URL(trimmed);
        const fromQuery = url.searchParams.get('v');
        if (isYoutubeVideoId(fromQuery)) return fromQuery;
        if (url.hostname === 'youtu.be') {
            const fromPath = url.pathname.replace(/^\//, '').split('/')[0];
            if (isYoutubeVideoId(fromPath)) return fromPath;
        }
        const embedMatch = /\/embed\/([A-Za-z0-9_-]{11})/.exec(url.pathname);
        if (embedMatch?.[1] && isYoutubeVideoId(embedMatch[1])) return embedMatch[1];
    } catch {
        // Not a URL.
    }

    return undefined;
};

export const isYoutubeWatchUrl = (input?: null | string) => Boolean(extractYoutubeVideoId(input));
