import { spawnSync } from 'child_process';
import { existsSync } from 'fs';

const MUSICBRAINZ_API = 'https://musicbrainz.org/ws/2';
const COVER_ART_ARCHIVE = 'https://coverartarchive.org';
const USER_AGENT = 'RoofyMusic/1.0 (local-first-metadata-enrichment)';

const MIN_REQUEST_INTERVAL_MS = 1100;
let lastRequestAt = 0;

export type ProbedAudioTags = {
    album?: string;
    albumArtist?: string;
    artist?: string;
    title?: string;
};

export type MetadataEnrichmentInput = {
    album?: string;
    albumArtist?: string;
    artist?: string;
    artworkUrl?: string;
    isrc?: string;
    releaseDate?: string;
    title: string;
};

export type MetadataEnrichmentResult = {
    album?: string;
    albumArtist?: string;
    artist?: string;
    artworkUrl?: string;
    isrc?: string;
    mbzRecordingId?: string;
    releaseDate?: string;
    source: 'musicbrainz' | 'probe-only' | 'unchanged';
    title?: string;
};

type MusicBrainzRecordingSearch = {
    recordings?: Array<{
        id?: string;
        isrcs?: string[];
        releases?: Array<{
            date?: string;
            id?: string;
            title?: string;
        }>;
        title?: string;
        'artist-credit'?: Array<{
            artist?: { name?: string };
            name?: string;
        }>;
    }>;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForRateLimit = async () => {
    const elapsed = Date.now() - lastRequestAt;
    if (elapsed < MIN_REQUEST_INTERVAL_MS) {
        await sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
    }
    lastRequestAt = Date.now();
};

const escapeLucene = (value: string) =>
    value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').trim();

const musicBrainzGet = async <T>(path: string): Promise<T | null> => {
    await waitForRateLimit();
    const response = await fetch(`${MUSICBRAINZ_API}${path}`, {
        headers: {
            Accept: 'application/json',
            'User-Agent': USER_AGENT,
        },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
};

export const probeAudioTags = (ffprobePath: string, filePath: string): ProbedAudioTags => {
    if (!existsSync(filePath)) return {};

    const result = spawnSync(
        ffprobePath,
        ['-v', 'quiet', '-print_format', 'json', '-show_format', filePath],
        { encoding: 'utf8', timeout: 30_000, windowsHide: true },
    );

    if (result.status !== 0 || !result.stdout) return {};

    try {
        const parsed = JSON.parse(result.stdout) as {
            format?: { tags?: Record<string, string> };
        };
        const tags = parsed.format?.tags || {};
        const readTag = (...keys: string[]) => {
            for (const key of keys) {
                const direct = tags[key];
                if (direct?.trim()) return direct.trim();
                const lower = tags[key.toLowerCase()];
                if (lower?.trim()) return lower.trim();
            }
            return undefined;
        };

        return {
            title: readTag('title', 'TITLE', 'Title'),
            artist: readTag('artist', 'ARTIST', 'Artist'),
            album: readTag('album', 'ALBUM', 'Album'),
            albumArtist: readTag('album_artist', 'ALBUMARTIST', 'album artist'),
        };
    } catch {
        return {};
    }
};

type MusicBrainzRelease = NonNullable<
    NonNullable<MusicBrainzRecordingSearch['recordings']>[number]['releases']
>[number];

const pickRelease = (releases?: MusicBrainzRelease[]) => {
    if (!releases?.length) return undefined;
    return (
        releases.find((release) => release.id && release.date) ||
        releases.find((release) => release.id) ||
        releases[0]
    );
};

const coverArtUrlForRelease = async (releaseId?: string) => {
    if (!releaseId) return undefined;
    await waitForRateLimit();
    const response = await fetch(`${COVER_ART_ARCHIVE}/release/${releaseId}`, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    });
    if (!response.ok) return undefined;

    const data = (await response.json()) as {
        images?: Array<{ front?: boolean; image?: string; thumbnails?: Record<string, string> }>;
    };
    const front =
        data.images?.find((image) => image.front) ||
        data.images?.find((image) => image.image || image.thumbnails);
    if (!front) return undefined;

    return (
        front.thumbnails?.['500'] ||
        front.thumbnails?.large ||
        front.thumbnails?.small ||
        front.image ||
        `${COVER_ART_ARCHIVE}/release/${releaseId}/front-500`
    );
};

const searchRecording = async (artist: string, title: string) => {
    const query = [
        `recording:"${escapeLucene(title)}"`,
        artist ? `artist:"${escapeLucene(artist)}"` : '',
    ]
        .filter(Boolean)
        .join(' AND ');

    const data = await musicBrainzGet<MusicBrainzRecordingSearch>(
        `/recording?query=${encodeURIComponent(query)}&fmt=json&limit=1`,
    );
    const recording = data?.recordings?.[0];
    if (!recording?.id) return null;

    const release = pickRelease(recording.releases);
    const artistName =
        recording['artist-credit']
            ?.map((credit) => credit.name || credit.artist?.name)
            .filter(Boolean)
            .join(', ') || artist;

    return {
        album: release?.title,
        artist: artistName,
        artworkUrl: await coverArtUrlForRelease(release?.id),
        isrc: recording.isrcs?.[0],
        mbzRecordingId: recording.id,
        releaseDate: release?.date,
        title: recording.title || title,
    };
};

export const enrichTrackMetadata = async (
    input: MetadataEnrichmentInput,
): Promise<MetadataEnrichmentResult> => {
    const title = input.title?.trim();
    if (!title) {
        return { source: 'unchanged', title: input.title };
    }

    const artist = (input.artist || input.albumArtist || 'Unknown Artist').trim();
    const match = await searchRecording(artist, title);
    if (!match) {
        return {
            album: input.album,
            albumArtist: input.albumArtist,
            artist: input.artist,
            artworkUrl: input.artworkUrl,
            isrc: input.isrc,
            releaseDate: input.releaseDate,
            source: 'unchanged',
            title: input.title,
        };
    }

    return {
        album: match.album || input.album,
        albumArtist: input.albumArtist || match.artist,
        artist: match.artist || input.artist,
        artworkUrl: match.artworkUrl || input.artworkUrl,
        isrc: match.isrc || input.isrc,
        mbzRecordingId: match.mbzRecordingId,
        releaseDate: match.releaseDate || input.releaseDate,
        source: 'musicbrainz',
        title: match.title || input.title,
    };
};

export const enrichAudioFileMetadata = async (
    ffprobePath: string,
    filePath: string,
    seed?: Partial<MetadataEnrichmentInput>,
): Promise<MetadataEnrichmentResult> => {
    const probed = probeAudioTags(ffprobePath, filePath);
    const merged: MetadataEnrichmentInput = {
        album: seed?.album || probed.album,
        albumArtist: seed?.albumArtist || probed.albumArtist,
        artist: seed?.artist || probed.artist || probed.albumArtist,
        artworkUrl: seed?.artworkUrl,
        isrc: seed?.isrc,
        releaseDate: seed?.releaseDate,
        title: seed?.title || probed.title || 'Unknown Title',
    };

    const enriched = await enrichTrackMetadata(merged);
    if (enriched.source === 'musicbrainz') return enriched;

    if (probed.title || probed.artist) {
        return {
            ...enriched,
            album: merged.album,
            albumArtist: merged.albumArtist,
            artist: merged.artist,
            source: 'probe-only',
            title: merged.title,
        };
    }

    return enriched;
};
