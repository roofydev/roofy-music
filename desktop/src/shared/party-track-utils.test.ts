import { describe, expect, it } from 'vitest';

import {
    extractYoutubeVideoId,
    partyTrackPrefersVideo,
    youtubeVideoIdFromSong,
} from './party-track-utils';

describe('extractYoutubeVideoId', () => {
    it.each([
        ['dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
        ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10', 'dQw4w9WgXcQ'],
        ['https://music.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
        ['https://youtu.be/dQw4w9WgXcQ?si=test', 'dQw4w9WgXcQ'],
        ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
        ['https://www.youtube.com/live/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ])('extracts %s', (value, expected) => {
        expect(extractYoutubeVideoId(value)).toBe(expected);
    });

    it('rejects video-like parameters from unrelated hosts', () => {
        expect(extractYoutubeVideoId('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    });
});

describe('youtubeVideoIdFromSong', () => {
    it('prefers explicit YouTube metadata', () => {
        expect(
            youtubeVideoIdFromSong({
                id: 'local-id',
                youtubeMusic: { videoId: 'dQw4w9WgXcQ' },
            }),
        ).toBe('dQw4w9WgXcQ');
    });
});

describe('partyTrackPrefersVideo', () => {
    it('prefers video for direct links and video metadata only', () => {
        expect(partyTrackPrefersVideo(undefined, true)).toBe(true);
        expect(partyTrackPrefersVideo({ youtubeMusic: { mediaType: 'video' } })).toBe(true);
        expect(partyTrackPrefersVideo({ youtubeMusic: { mediaType: 'song' } })).toBe(false);
    });
});
