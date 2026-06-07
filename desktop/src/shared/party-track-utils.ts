interface PartySongLike {
    id?: null | string;
    youtubeMusic?: {
        mediaType?: 'song' | 'unknown' | 'video';
        videoId?: string;
        watchUrl?: string;
    };
}

export const YOUTUBE_VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

const YOUTUBE_HOSTS = new Set([
    'm.youtube.com',
    'music.youtube.com',
    'www.youtube.com',
    'youtu.be',
    'youtube.com',
]);

export const extractYoutubeVideoId = (value: null | string | undefined): null | string => {
    const trimmed = value?.trim();
    if (!trimmed) return null;
    if (YOUTUBE_VIDEO_ID_REGEX.test(trimmed)) return trimmed;

    try {
        const url = new URL(trimmed);
        const hostname = url.hostname.toLowerCase();
        if (!YOUTUBE_HOSTS.has(hostname)) return null;

        const fromParam = url.searchParams.get('v');
        if (fromParam && YOUTUBE_VIDEO_ID_REGEX.test(fromParam)) return fromParam;

        const pathMatch = url.pathname.match(
            /^\/(?:embed|live|shorts|watch)\/([A-Za-z0-9_-]{11})(?:\/|$)/,
        );
        if (pathMatch) return pathMatch[1];

        if (hostname === 'youtu.be') {
            const shortId = url.pathname.split('/').filter(Boolean)[0];
            if (shortId && YOUTUBE_VIDEO_ID_REGEX.test(shortId)) return shortId;
        }
    } catch {
        return null;
    }

    return null;
};

export const youtubeVideoIdFromSong = (song: null | PartySongLike | undefined): null | string => {
    const candidate =
        song?.youtubeMusic?.videoId ||
        extractYoutubeVideoId(song?.youtubeMusic?.watchUrl) ||
        (song?.id?.startsWith('ytm:') ? song.id.slice(4) : undefined) ||
        extractYoutubeVideoId(song?.id);

    return candidate && YOUTUBE_VIDEO_ID_REGEX.test(candidate) ? candidate : null;
};

export const partyTrackPrefersVideo = (
    song: null | PartySongLike | undefined,
    directVideoRequest = false,
) => directVideoRequest || song?.youtubeMusic?.mediaType === 'video';
