import type { Album, AlbumArtist, LibraryItem, Playlist, Song } from './domain-types';

export const YOUTUBE_MUSIC_SOURCE_ID = 'roofy-youtube-music';
export const YOUTUBE_MUSIC_SOURCE_NAME = 'YouTube Music';

export type YoutubeMusicAuthStatus = {
    avatarUrl: null | string;
    connected: boolean;
    connectedAt: null | string;
    dependencyAvailable: boolean;
    displayName: null | string;
    error?: string;
    sourceId: string;
};

export type YoutubeMusicHomeResponse = {
    sections: YoutubeMusicHomeSection[];
};

export type YoutubeMusicHomeSection = {
    id: string;
    items: Array<Album | Playlist | Song>;
    itemType: LibraryItem.ALBUM | LibraryItem.PLAYLIST | LibraryItem.SONG;
    sourceLabel: 'YouTube Music';
    title: string;
};

export type YoutubeMusicSearchResult = {
    albumArtists: AlbumArtist[];
    albums: Album[];
    playlists: Playlist[];
    songs: Song[];
};

export type YoutubeMusicSourceMetadata = {
    albumBrowseId?: string;
    browseId?: string;
    mediaType?: 'album' | 'artist' | 'playlist' | 'song' | 'unknown' | 'video';
    playlistId?: string;
    videoId?: string;
    watchUrl?: string;
};

export const YOUTUBE_MUSIC_ENTITY_PREFIXES = [
    'ytm:',
    'ytm-album:',
    'ytm-artist:',
    'ytm-playlist:',
    'ytm-genre-',
];

export function isYoutubeMusicEntityId(id: string | null | undefined): boolean {
    if (!id) return false;
    return YOUTUBE_MUSIC_ENTITY_PREFIXES.some((prefix) => id.startsWith(prefix));
}
