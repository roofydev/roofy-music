import type { Song } from '/@/shared/types/domain-types';

/** Song is available for offline playback (saved file on disk). */
export function isOfflineAvailableSong(song: Song): boolean {
    if (song.path?.trim()) {
        return true;
    }

    return Boolean(song.youtubeMusic?.videoFilePath?.trim());
}

export function filterOfflineSongs(songs: Song[]): Song[] {
    return songs.filter(isOfflineAvailableSong);
}
