export type MusicSource =
    | 'local'
    | 'navidrome'
    | 'soundcloud'
    | 'spotify'
    | 'subsonic'
    | 'jellyfin'
    | 'youtube_music'
    | 'radio';

export type TrackAvailability =
    | 'remote_only'
    | 'resolving'
    | 'streamable'
    | 'downloading'
    | 'downloaded'
    | 'local_imported'
    | 'unavailable';

export interface AppTrack {
    id: string;
    source: MusicSource;
    sourceId: string;

    title: string;
    artistName?: string;
    albumTitle?: string;
    durationMs?: number;
    artworkUrl?: string;

    availability: TrackAvailability;

    // Local file fields
    localPath?: string;
    navidromeId?: string;

    // YouTube Music fields
    youtubeVideoId?: string;
    youtubePlaylistId?: string;
    youtubeBrowseId?: string;

    // Stream cache fields
    streamUrl?: string;
    streamUrlExpiresAt?: number;
    streamMimeType?: string;
    streamBitrate?: number;
    streamCodec?: string;

    // Download fields
    downloadedLocalTrackId?: string;
    downloadedAt?: string;
    downloadStatus?: 'none' | 'queued' | 'downloading' | 'downloaded' | 'failed';

    // Shared metadata
    explicit?: boolean;
    favorite?: boolean;
    playCount?: number;
    lastPlayedAt?: string;
}

export interface PlayableMedia {
    trackId: string;
    source: MusicSource;
    url?: string;
    localPath?: string;
    mimeType?: string;
    codec?: string;
    bitrate?: number;
    expiresAt?: number;
    headers?: Record<string, string>;
    resolvedAt: number;
}

export interface StreamResolver {
    resolve(track: AppTrack, reason: 'playback' | 'preload' | 'retry'): Promise<PlayableMedia>;
    invalidate(trackId: string): void;
}

export interface DownloadJob {
    id: string;
    sourceTrackId: string;
    status: 'queued' | 'downloading' | 'completed' | 'failed' | 'cancelled';
    progress: number;
    outputPath?: string;
    error?: string;
    createdAt: string;
    updatedAt: string;
}

export interface SourceLink {
    id: string;
    fromTrackId: string;
    toTrackId: string;
    relationship: 'downloaded_as' | 'matched_to' | 'same_recording';
    createdAt: string;
}

export interface QueueItem {
    queueId: string;
    trackId: string;
    source: MusicSource;
    sourceId: string;
    snapshot: AppTrack;
    addedAt: string;
    resolvedMedia?: PlayableMedia;
}

export interface PlayEvent {
    id: string;
    trackId: string;
    source: MusicSource;
    sourceId: string;
    playedAt: string;
    durationPlayedMs: number;
    completed: boolean;
}

export type SourceAwareErrorCode =
    | 'YT_STREAM_403'
    | 'YT_STREAM_EXPIRED'
    | 'YT_AUTH_REQUIRED'
    | 'YT_RATE_LIMITED'
    | 'YT_VIDEO_UNAVAILABLE'
    | 'YT_REGION_BLOCKED'
    | 'LOCAL_FILE_MISSING'
    | 'NAVIDROME_OFFLINE'
    | 'DOWNLOAD_FAILED';

export interface SourceAwareError {
    code: SourceAwareErrorCode;
    message: string;
    trackId?: string;
    source?: MusicSource;
    retryable: boolean;
}

export function toAppTrack(song: any): AppTrack | null {
    if (!song?.id) return null;

    const serverType = song._serverType as string;
    let source: MusicSource = 'local';

    switch (serverType) {
        case 'navidrome':
            source = 'navidrome';
            break;
        case 'subsonic':
            source = 'subsonic';
            break;
        case 'jellyfin':
            source = 'jellyfin';
            break;
        case 'youtube_music':
            source = 'youtube_music';
            break;
        default:
            source = 'local';
    }

    const sourceId = song.id.startsWith('ytm:') ? song.id.slice(4) : song.id;

    return {
        id: `${source}:${sourceId}`,
        source,
        sourceId,
        title: song.name || 'Untitled',
        artistName: song.artistName,
        albumTitle: song.album || undefined,
        durationMs: typeof song.duration === 'number' ? song.duration : undefined,
        artworkUrl: song.imageUrl || undefined,
        availability: source === 'youtube_music' ? 'remote_only' : 'local_imported',
        localPath: song.path || undefined,
        navidromeId: source === 'navidrome' ? sourceId : undefined,
        youtubeVideoId: song.youtubeMusic?.videoId,
        youtubePlaylistId: song.youtubeMusic?.playlistId,
        youtubeBrowseId: song.youtubeMusic?.albumBrowseId || song.youtubeMusic?.browseId,
        favorite: song.userFavorite,
        playCount: typeof song.playCount === 'number' ? song.playCount : undefined,
        lastPlayedAt: song.lastPlayedAt || undefined,
    };
}

export function getSongIdFromAppTrack(track: AppTrack): string {
    if (track.source === 'youtube_music' && track.youtubeVideoId) {
        return `ytm:${track.youtubeVideoId}`;
    }
    return track.sourceId;
}
