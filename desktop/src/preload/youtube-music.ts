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
const getLyrics = (id: string): Promise<null | string> =>
    ipcRenderer.invoke('youtube-music-lyrics', id);
const getAlbumSongs = (id: string): Promise<Song[]> =>
    ipcRenderer.invoke('youtube-music-album-songs', id);
const getPlaylistDetail = (id: string): Promise<Playlist> =>
    ipcRenderer.invoke('youtube-music-playlist-detail', id);
const getPlaylistSongs = (id: string): Promise<Song[]> =>
    ipcRenderer.invoke('youtube-music-playlist-songs', id);
const getSongList = (): Promise<Song[]> => ipcRenderer.invoke('youtube-music-song-list');

// Stream resolver
const resolveStream = (id: string, reason?: 'playback' | 'preload' | 'retry') =>
    ipcRenderer.invoke('stream:resolve', { id, reason });
const invalidateStream = (id: string) => ipcRenderer.invoke('stream:invalidate', id);

// Downloads
const downloadTrack = (args: {
    album?: string;
    artist: string;
    sourceTrackId: string;
    title: string;
    videoId: string;
}) => ipcRenderer.invoke('youtube-music:download', args);
const getDownloadStatus = (sourceTrackId: string) =>
    ipcRenderer.invoke('youtube-music:download-status', sourceTrackId);

export const youtubeMusic = {
    connect,
    disconnect,
    downloadTrack,
    getAlbumSongs,
    getDownloadStatus,
    getLyrics,
    getPlaylistDetail,
    getPlaylistSongs,
    getSongList,
    getStreamUrl,
    home,
    invalidateStream,
    resolveStream,
    search,
    status,
};

export type YoutubeMusicPreload = typeof youtubeMusic;
