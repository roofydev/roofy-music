import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { enrichTrackMetadata } from './metadata-enrichment';

describe('enrichTrackMetadata', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('returns unchanged when title is empty', async () => {
        const result = await enrichTrackMetadata({ title: '   ', artist: 'Artist' });
        expect(result.source).toBe('unchanged');
    });

    it('returns unchanged when MusicBrainz has no match', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ recordings: [] }),
            }),
        );

        const promise = enrichTrackMetadata({
            title: 'Unknown Track XYZ',
            artist: 'Nobody',
            album: 'Original',
        });
        await vi.runAllTimersAsync();
        const result = await promise;

        expect(result.source).toBe('unchanged');
        expect(result.album).toBe('Original');
    });

    it('merges MusicBrainz match into metadata', async () => {
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({
                        recordings: [
                            {
                                id: 'rec-1',
                                title: 'Matched Title',
                                isrcs: ['USRC123'],
                                'artist-credit': [{ name: 'Matched Artist' }],
                                releases: [
                                    {
                                        id: 'rel-1',
                                        title: 'Matched Album',
                                        date: '2020',
                                    },
                                ],
                            },
                        ],
                    }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({
                        images: [
                            {
                                front: true,
                                thumbnails: { '500': 'https://cover.example/front-500.jpg' },
                            },
                        ],
                    }),
                }),
        );

        const promise = enrichTrackMetadata({
            title: 'Sparse Title',
            artist: 'Sparse Artist',
        });
        await vi.runAllTimersAsync();
        const result = await promise;

        expect(result.source).toBe('musicbrainz');
        expect(result.title).toBe('Matched Title');
        expect(result.artist).toBe('Matched Artist');
        expect(result.album).toBe('Matched Album');
        expect(result.isrc).toBe('USRC123');
        expect(result.artworkUrl).toBe('https://cover.example/front-500.jpg');
        expect(result.mbzRecordingId).toBe('rec-1');
    });

    it('escapes quotes in Lucene search queries', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ recordings: [] }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const promise = enrichTrackMetadata({
            title: 'Say "Hello"',
            artist: 'O\'Neill',
        });
        await vi.runAllTimersAsync();
        await promise;

        const recordingUrl = String(fetchMock.mock.calls[0]?.[0]);
        expect(recordingUrl).toContain(encodeURIComponent('recording:"Say \\"Hello\\""'));
        expect(recordingUrl).toContain(encodeURIComponent('artist:"O\'Neill"'));
    });
});
