import type { Playlist, Song } from '/@/shared/types/domain-types';
import type {
    YoutubeMusicAuthStatus,
    YoutubeMusicHomeResponse,
    YoutubeMusicSearchResult,
} from '/@/shared/types/youtube-music-types';

import { ipcRenderer } from 'electron';

const status = (): Promise<YoutubeMusicAuthStatus> => ipcRenderer.invoke('youtube-music-status');
const connect = (): Promise<YoutubeMusicAuthStatus> => ipcRenderer.invoke('youtube-music-connect');
const disconnect = (): Promise<YoutubeMusicAuthStatus> =>
    ipcRenderer.invoke('youtube-music-disconnect');
const search = (query: string): Promise<YoutubeMusicSearchResult> =>
    ipcRenderer.invoke('youtube-music-search', query);
const home = (): Promise<YoutubeMusicHomeResponse> => ipcRenderer.invoke('youtube-music-home');
const getStreamUrl = (id: string): Promise<string> =>
    ipcRenderer.invoke('youtube-music-stream-url', id);
const getVideoStreamUrl = (id: string): Promise<string> =>
    ipcRenderer.invoke('youtube-music-video-stream-url', id);
const getLyrics = (id: string): Promise<null | string> =>
    ipcRenderer.invoke('youtube-music-lyrics', id);
const getAlbumSongs = (id: string): Promise<Song[]> =>
    ipcRenderer.invoke('youtube-music-album-songs', id);
const getPlaylistDetail = (id: string): Promise<Playlist> =>
    ipcRenderer.invoke('youtube-music-playlist-detail', id);
const getPlaylistSongs = (id: string): Promise<Song[]> =>
    ipcRenderer.invoke('youtube-music-playlist-songs', id);
const getAccountPlaylists = (): Promise<Playlist[]> =>
    ipcRenderer.invoke('youtube-music-account-playlists');
const getAccountPlaylistSongs = (id: string): Promise<Song[]> =>
    ipcRenderer.invoke('youtube-music-account-playlist-songs', id);
const getAccountSongs = (): Promise<Song[]> => ipcRenderer.invoke('youtube-music-account-songs');
const getSongDetail = (id: string): Promise<Song> =>
    ipcRenderer.invoke('youtube-music-song-detail', id);
const getSongList = (): Promise<Song[]> => ipcRenderer.invoke('youtube-music-song-list');

// Stream resolver
const resolveStream = (id: string, reason?: 'playback' | 'preload' | 'retry') =>
    ipcRenderer.invoke('stream:resolve', { id, reason });
const resolveVideoStream = (id: string, reason?: 'playback' | 'preload' | 'retry') =>
    ipcRenderer.invoke('stream:resolve-video', { id, reason });
const invalidateStream = (id: string) => ipcRenderer.invoke('stream:invalidate', id);

// Downloads
const downloadTrack = (args: {
    album?: string;
    artist: string;
    imageUrl?: string;
    saveVideo?: boolean;
    sourceTrackId: string;
    title: string;
    videoId: string;
}) => ipcRenderer.invoke('youtube-music:download', args);
const getDownloadStatus = (sourceTrackId: string) =>
    ipcRenderer.invoke('youtube-music:download-status', sourceTrackId);

// Imports
const importTrack = (args: {
    album?: string;
    artist: string;
    imageUrl?: string;
    saveVideo?: boolean;
    sourceTrackId: string;
    targetPlaylistIds?: string[];
    targetPlaylistNames?: string[];
    title: string;
    videoId: string;
}) => ipcRenderer.invoke('youtube-music:import-track', args);

const importPlaylist = (args: {
    createPlaylist?: boolean;
    playlistId: string;
    playlistName?: string;
    saveVideo?: boolean;
    targetPlaylistIds?: string[];
    targetPlaylistNames?: string[];
}) => ipcRenderer.invoke('youtube-music:import-playlist', args);

// Import job events
const onImportJobUpdated = (cb: (event: Electron.IpcRendererEvent, job: any) => void) => {
    ipcRenderer.on('roofy-import-job-updated', cb);
    return () => {
        ipcRenderer.removeListener('roofy-import-job-updated', cb);
    };
};

const onImportJobCompleted = (cb: (event: Electron.IpcRendererEvent, job: any) => void) => {
    ipcRenderer.on('roofy-import-job-completed', cb);
    return () => {
        ipcRenderer.removeListener('roofy-import-job-completed', cb);
    };
};

const onImportJobFailed = (cb: (event: Electron.IpcRendererEvent, job: any) => void) => {
    ipcRenderer.on('roofy-import-job-failed', cb);
    return () => {
        ipcRenderer.removeListener('roofy-import-job-failed', cb);
    };
};

export const youtubeMusic = {
    connect,
    disconnect,
    downloadTrack,
    getAccountPlaylists,
    getAccountPlaylistSongs,
    getAccountSongs,
    getAlbumSongs,
    getDownloadStatus,
    getLyrics,
    getPlaylistDetail,
    getPlaylistSongs,
    getSongDetail,
    getSongList,
    getStreamUrl,
    getVideoStreamUrl,
    home,
    importPlaylist,
    importTrack,
    invalidateStream,
    onImportJobCompleted,
    onImportJobFailed,
    onImportJobUpdated,
    resolveStream,
    resolveVideoStream,
    search,
    status,
};

export type YoutubeMusicPreload = typeof youtubeMusic;
