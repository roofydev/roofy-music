import {
    InternalControllerEndpoint,
    LibraryItem,
    SearchResponse,
    ServerInfo,
    Song,
} from '/@/shared/types/domain-types';

const readonlyError = (endpoint: string) =>
    new Error(`YouTube Music endpoint ${endpoint} is read-only or not supported.`);

export const YoutubeMusicController: Partial<InternalControllerEndpoint> = {
    authenticate: async () => {
        const status = await window.api.youtubeMusic.connect();
        return {
            credential: status.sourceId,
            userId: status.sourceId,
            username: status.displayName || 'YouTube Music',
        };
    },
    createFavorite: async () => {
        throw readonlyError('createFavorite');
    },
    deleteFavorite: async () => {
        throw readonlyError('deleteFavorite');
    },
    getAlbumList: async () => ({ items: [], startIndex: 0, totalRecordCount: 0 }),
    getAlbumListCount: async () => 0,
    getArtistList: async () => ({ items: [], startIndex: 0, totalRecordCount: 0 }),
    getArtistListCount: async () => 0,
    getDownloadUrl: ({ query }) => {
        const videoId = query.id.startsWith('ytm:') ? query.id.slice(4) : query.id;
        return `https://music.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    },
    getImageRequest: ({ query }) => ({
        cacheKey: `youtube-music:${query.id}`,
        url: query.id,
    }),
    getImageUrl: ({ query }) => query.id,
    getLyrics: async ({ query }) => {
        return (await window.api.youtubeMusic.getLyrics(query.songId)) || '';
    },
    getPlaylistDetail: async ({ query }) => window.api.youtubeMusic.getPlaylistDetail(query.id),
    getPlaylistList: async () => ({ items: [], startIndex: 0, totalRecordCount: 0 }),
    getPlaylistListCount: async () => 0,
    getPlaylistSongList: async ({ query }) => {
        const songs = await window.api.youtubeMusic.getPlaylistSongs(query.id);
        return { items: songs, startIndex: 0, totalRecordCount: songs.length };
    },
    getRandomSongList: async () => {
        const songs = await window.api.youtubeMusic.getSongList();
        return { items: songs, startIndex: 0, totalRecordCount: songs.length };
    },
    getRoles: async () => [],
    getServerInfo: async (): Promise<ServerInfo> => ({
        features: {},
        version: 'youtube-music',
    }),
    getSimilarSongs: async ({ query }) => {
        const result = await window.api.youtubeMusic.search(query.songId);
        return result.songs;
    },
    getSongDetail: async ({ query }) => window.api.youtubeMusic.getSongDetail(query.id),
    getSongList: async ({ query }) => {
        const result = query.albumIds?.length
            ? await Promise.all(
                  query.albumIds.map((id) => window.api.youtubeMusic.getAlbumSongs(id)),
              ).then((songs) => ({ songs: songs.flat() }))
            : query.searchTerm
              ? await window.api.youtubeMusic.search(query.searchTerm)
              : await window.api.youtubeMusic.getSongList().then((songs) => ({ songs }));
        const songs = (result.songs as Song[]).filter(
            (item) => item._itemType === LibraryItem.SONG,
        );
        return {
            items: songs.slice(
                query.startIndex,
                query.limit ? query.startIndex + query.limit : undefined,
            ),
            startIndex: query.startIndex,
            totalRecordCount: songs.length,
        };
    },
    getSongListCount: async ({ query }) => {
        if (!query.searchTerm) return 0;
        const result = await window.api.youtubeMusic.search(query.searchTerm);
        return result.songs.length;
    },
    getStreamUrl: async ({ query }) => window.api.youtubeMusic.getStreamUrl(query.id),
    getStructuredLyrics: async ({ query }) => {
        const lyrics = await window.api.youtubeMusic.getLyrics(query.songId);
        if (!lyrics) return [];
        return [
            {
                artist: 'YouTube Music',
                lang: 'und',
                lyrics,
                name: 'YouTube Music',
                remote: true,
                source: 'YouTube Music',
                synced: false,
            },
        ];
    },
    getTopSongs: async ({ query }) => {
        const result = await window.api.youtubeMusic.search(query.artist || query.artistId);
        return { items: result.songs, startIndex: 0, totalRecordCount: result.songs.length };
    },
    getUserInfo: async () => ({
        id: 'youtube-music',
        isAdmin: false,
        name: 'YouTube Music',
    }),
    scrobble: async () => null,
    search: async ({ query }): Promise<SearchResponse> => {
        const result = await window.api.youtubeMusic.search(query.query || '');
        return {
            albumArtists: result.albumArtists.slice(
                query.albumArtistStartIndex || 0,
                query.albumArtistLimit
                    ? (query.albumArtistStartIndex || 0) + query.albumArtistLimit
                    : undefined,
            ),
            albums: result.albums.slice(
                query.albumStartIndex || 0,
                query.albumLimit ? (query.albumStartIndex || 0) + query.albumLimit : undefined,
            ),
            songs: result.songs.slice(
                query.songStartIndex || 0,
                query.songLimit ? (query.songStartIndex || 0) + query.songLimit : undefined,
            ),
        };
    },
};
