import { getMainWindow } from '/@/main/index';
import { store } from '../settings';

export type PlaylistStreamEntry = {
    addedAt: string;
    album?: string;
    artist?: string;
    id: string;
    imageUrl?: string;
    playlistId: string;
    sourceTrackId?: string;
    title: string;
    videoId: string;
};

const PLAYLIST_STREAM_ENTRIES_KEY = 'roofy.playlistStreamEntries';

const loadEntries = (): PlaylistStreamEntry[] => {
    const saved = store.get(PLAYLIST_STREAM_ENTRIES_KEY) as PlaylistStreamEntry[] | undefined;
    return Array.isArray(saved) ? saved : [];
};

let playlistStreamEntries = loadEntries();

const persistEntries = () => {
    store.set(PLAYLIST_STREAM_ENTRIES_KEY, playlistStreamEntries.slice(0, 5000));
};

const notifyPlaylistStreamEntriesUpdated = (playlistId?: string) => {
    try {
        getMainWindow()?.webContents.send('roofy-playlist-stream-entries-updated', playlistId || '');
    } catch {
        // ignore
    }
};

export const getPlaylistStreamEntries = (playlistId?: string) => {
    if (!playlistId) return playlistStreamEntries;
    return playlistStreamEntries.filter((entry) => entry.playlistId === playlistId);
};

export const addPlaylistStreamEntry = (entry: Omit<PlaylistStreamEntry, 'addedAt' | 'id'> & { id?: string }) => {
    const videoId = entry.videoId.trim();
    const playlistId = entry.playlistId.trim();
    if (!videoId || !playlistId) return null;

    const existing = playlistStreamEntries.find(
        (item) => item.playlistId === playlistId && item.videoId === videoId,
    );
    if (existing) {
        existing.title = entry.title || existing.title;
        existing.artist = entry.artist || existing.artist;
        existing.album = entry.album || existing.album;
        existing.imageUrl = entry.imageUrl || existing.imageUrl;
        existing.sourceTrackId = entry.sourceTrackId || existing.sourceTrackId;
        persistEntries();
        notifyPlaylistStreamEntriesUpdated(playlistId);
        return existing;
    }

    const created: PlaylistStreamEntry = {
        addedAt: new Date().toISOString(),
        album: entry.album,
        artist: entry.artist,
        id: entry.id || `${playlistId}:${videoId}`,
        imageUrl: entry.imageUrl,
        playlistId,
        sourceTrackId: entry.sourceTrackId,
        title: entry.title || 'YouTube track',
        videoId,
    };

    playlistStreamEntries.unshift(created);
    persistEntries();
    notifyPlaylistStreamEntriesUpdated(playlistId);
    return created;
};

export const removePlaylistStreamEntry = (playlistId: string, videoId: string) => {
    const before = playlistStreamEntries.length;
    playlistStreamEntries = playlistStreamEntries.filter(
        (entry) => !(entry.playlistId === playlistId && entry.videoId === videoId),
    );
    if (playlistStreamEntries.length === before) return false;
    persistEntries();
    notifyPlaylistStreamEntriesUpdated(playlistId);
    return true;
};

export const removePlaylistStreamEntriesForVideo = (videoId: string, playlistIds: string[]) => {
    let removed = false;
    for (const playlistId of playlistIds) {
        if (removePlaylistStreamEntry(playlistId, videoId)) {
            removed = true;
        }
    }
    return removed;
};

export const addPlaylistStreamEntriesForImportJob = (args: {
    album?: string;
    artist?: string;
    imageUrl?: string;
    playlistIds: string[];
    sourceTrackId?: string;
    title?: string;
    videoId?: string;
}) => {
    const videoId = args.videoId?.trim();
    if (!videoId || args.playlistIds.length === 0) return [];

    return args.playlistIds
        .map((playlistId) =>
            addPlaylistStreamEntry({
                album: args.album,
                artist: args.artist,
                imageUrl: args.imageUrl,
                playlistId,
                sourceTrackId: args.sourceTrackId,
                title: args.title || 'YouTube track',
                videoId,
            }),
        )
        .filter((entry): entry is PlaylistStreamEntry => Boolean(entry));
};
