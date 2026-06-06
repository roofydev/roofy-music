import { describe, expect, it } from 'vitest';

import {
    getYoutubeMusicWatchUrl,
    resolveYoutubeMusicVideoId,
} from '/@/renderer/features/discord-rpc/discord-activity-utils';
import { QueueSong, ServerType } from '/@/shared/types/domain-types';

const createSong = (overrides: Partial<QueueSong> = {}): QueueSong =>
    ({
        _serverId: 'ytm',
        _serverType: ServerType.YOUTUBE_MUSIC,
        _uniqueId: 'ytm:dQw4w9WgXcQ',
        artistName: 'Artist',
        artists: [{ id: '1', name: 'Artist' }],
        name: 'Song',
        youtubeMusic: {
            videoId: 'dQw4w9WgXcQ',
            watchUrl: 'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
        },
        ...overrides,
    }) as QueueSong;

describe('resolveYoutubeMusicVideoId', () => {
    it('reads video ids from imported library filenames', () => {
        expect(
            resolveYoutubeMusicVideoId(
                createSong({
                    _serverType: ServerType.NAVIDROME,
                    path: 'Artist/Song Title [dQw4w9WgXcQ].mp3',
                    youtubeMusic: undefined,
                }),
            ),
        ).toBe('dQw4w9WgXcQ');
    });

    it('reads video ids from imported comment metadata', () => {
        expect(
            resolveYoutubeMusicVideoId(
                createSong({
                    _serverType: ServerType.NAVIDROME,
                    comment: 'Source: https://music.youtube.com/watch?v=dQw4w9WgXcQ',
                    youtubeMusic: undefined,
                }),
            ),
        ).toBe('dQw4w9WgXcQ');
    });
});

describe('getYoutubeMusicWatchUrl', () => {
    it('returns a music.youtube.com url for YouTube Music tracks', () => {
        expect(getYoutubeMusicWatchUrl(createSong())).toBe(
            'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
        );
    });

    it('normalizes youtube.com watch urls to music.youtube.com', () => {
        expect(
            getYoutubeMusicWatchUrl(
                createSong({
                    youtubeMusic: {
                        videoId: 'dQw4w9WgXcQ',
                        watchUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                    },
                }),
            ),
        ).toBe('https://music.youtube.com/watch?v=dQw4w9WgXcQ');
    });

    it('returns a watch url for imported library tracks', () => {
        expect(
            getYoutubeMusicWatchUrl(
                createSong({
                    _serverId: 'local',
                    _serverType: ServerType.NAVIDROME,
                    path: 'Artist/Song Title [dQw4w9WgXcQ].mp3',
                    youtubeMusic: undefined,
                }),
            ),
        ).toBe('https://music.youtube.com/watch?v=dQw4w9WgXcQ');
    });

    it('returns null when no video id is available', () => {
        expect(
            getYoutubeMusicWatchUrl(
                createSong({
                    _serverType: ServerType.NAVIDROME,
                    comment: null,
                    path: 'Artist/Song Title.mp3',
                    youtubeMusic: undefined,
                }),
            ),
        ).toBeNull();
    });
});
