import type { Song } from '/@/shared/types/domain-types';
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
const getPlaylistSongs = (id: string): Promise<Song[]> =>
    ipcRenderer.invoke('youtube-music-playlist-songs', id);
const getSongList = (): Promise<Song[]> => ipcRenderer.invoke('youtube-music-song-list');

export const youtubeMusic = {
    connect,
    disconnect,
    getAlbumSongs,
    getLyrics,
    getPlaylistSongs,
    getSongList,
    getStreamUrl,
    home,
    search,
    status,
};

export type YoutubeMusicPreload = typeof youtubeMusic;
