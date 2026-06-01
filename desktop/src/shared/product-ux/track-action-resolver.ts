import { ServerType, type Song } from '/@/shared/types/domain-types';
import {
    type AppTrack,
    type TrackAvailability,
    toAppTrack,
} from '/@/shared/types/music-source-types';

export type TrackItemState = 'inLibrary' | 'offline' | 'online' | 'saving';

export type TrackActionId =
    | 'addToLibrary'
    | 'addToPlaylist'
    | 'addToQueue'
    | 'play'
    | 'playNext'
    | 'saveOffline'
    | 'watchVideo';

/** Canonical menu order from product-ux-integration-plan.md */
export const TRACK_ACTION_ORDER: TrackActionId[] = [
    'play',
    'playNext',
    'addToQueue',
    'addToPlaylist',
    'saveOffline',
    'addToLibrary',
    'watchVideo',
];

export function getTrackItemState(track: AppTrack): TrackItemState {
    if (track.downloadStatus === 'queued' || track.downloadStatus === 'downloading') {
        return 'saving';
    }
    if (
        track.availability === 'downloaded' ||
        track.availability === 'local_imported' ||
        track.localPath
    ) {
        return track.localPath || track.availability === 'downloaded' ? 'offline' : 'inLibrary';
    }
    if (track.source === 'navidrome' || track.source === 'subsonic' || track.source === 'local') {
        return 'inLibrary';
    }
    return 'online';
}

function isYoutubeMusicSong(song: Song): boolean {
    return (
        song._serverType === ServerType.YOUTUBE_MUSIC && Boolean(song.youtubeMusic?.videoId)
    );
}

function isPersonalLibrarySong(song: Song): boolean {
    return (
        song._serverType === ServerType.NAVIDROME ||
        song._serverType === ServerType.SUBSONIC ||
        Boolean(song.path)
    );
}

export function resolveTrackActions(songs: Song[]): TrackActionId[] {
    if (!songs.length) return [];

    const youtubeOnly =
        songs.length > 0 && songs.every((song) => isYoutubeMusicSong(song));
    const personalLibraryOnly =
        songs.length > 0 && songs.every((song) => isPersonalLibrarySong(song));
    const anySaving = songs.some((song) => {
        const track = toAppTrack(song);
        return track && getTrackItemState(track) === 'saving';
    });

    const actions: TrackActionId[] = ['play', 'playNext', 'addToQueue', 'addToPlaylist'];

    if (anySaving) {
        return actions;
    }

    if (youtubeOnly) {
        actions.push('addToLibrary');
        if (songs.some((song) => song.youtubeMusic?.videoId)) {
            actions.push('watchVideo');
        }
        return actions;
    }

    if (personalLibraryOnly && songs.length === 1) {
        actions.push('saveOffline');
        return actions;
    }

    if (!personalLibraryOnly && songs.some((song) => isYoutubeMusicSong(song))) {
        actions.push('addToLibrary');
    }

    return actions;
}

export function shouldShowSaveOffline(songs: Song[]): boolean {
    return resolveTrackActions(songs).includes('saveOffline');
}

export function shouldShowAddToLibrary(songs: Song[]): boolean {
    return resolveTrackActions(songs).includes('addToLibrary');
}

export function getDownloadActionLabelKey(songs: Song[]): string {
    if (shouldShowAddToLibrary(songs) && !shouldShowSaveOffline(songs)) {
        return 'productUx.action.addToLibrary';
    }
    return 'productUx.action.saveOffline';
}

export function mapAvailabilityToItemState(
    availability: TrackAvailability,
): TrackItemState {
    switch (availability) {
        case 'downloading':
            return 'saving';
        case 'downloaded':
        case 'local_imported':
            return 'offline';
        case 'remote_only':
        case 'streamable':
        case 'resolving':
            return 'online';
        default:
            return 'online';
    }
}
