import { describe, expect, it } from 'vitest';

import { ServerType, type Song } from '/@/shared/types/domain-types';

import {
    getDownloadActionLabelKey,
    resolveTrackActions,
    shouldShowAddToLibrary,
} from './track-action-resolver';

const youtubeSong = {
    _serverType: ServerType.YOUTUBE_MUSIC,
    id: 'ytm:abc123',
    name: 'Test',
    youtubeMusic: { videoId: 'abc123' },
} as Song;

const librarySong = {
    _serverType: ServerType.NAVIDROME,
    id: 'song-1',
    name: 'Owned',
    path: '/music/song.mp3',
} as Song;

describe('track-action-resolver', () => {
    it('offers add to library for YouTube Music tracks', () => {
        expect(resolveTrackActions([youtubeSong])).toContain('addToLibrary');
        expect(shouldShowAddToLibrary([youtubeSong])).toBe(true);
        expect(getDownloadActionLabelKey([youtubeSong])).toBe('productUx.action.addToLibrary');
    });

    it('offers save offline for personal library tracks', () => {
        expect(resolveTrackActions([librarySong])).toContain('saveOffline');
        expect(getDownloadActionLabelKey([librarySong])).toBe('productUx.action.saveOffline');
    });
});
