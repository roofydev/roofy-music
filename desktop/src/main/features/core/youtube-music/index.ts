import { BrowserWindow, ipcMain, safeStorage, session } from 'electron';
import { createRequire } from 'module';
import vm from 'vm';

import { store } from '../settings';

import {
    Album,
    AlbumArtist,
    ExplicitStatus,
    Genre,
    LibraryItem,
    Playlist,
    RelatedArtist,
    ServerType,
    Song,
} from '/@/shared/types/domain-types';
import {
    YOUTUBE_MUSIC_SOURCE_ID,
    YOUTUBE_MUSIC_SOURCE_NAME,
    YoutubeMusicAuthStatus,
    YoutubeMusicHomeResponse,
    YoutubeMusicSearchResult,
} from '/@/shared/types/youtube-music-types';

const SESSION_KEY = 'youtubeMusic.session';
const SOURCE_URL = 'https://music.youtube.com';
const LOGIN_PARTITION = 'persist:roofy-youtube-music';
const REQUIRED_COOKIE_NAMES = new Set(['APISID', 'SAPISID', 'SID', 'SSID']);
const STREAM_CACHE_TTL_MS = 4 * 60 * 1000;
const VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;
const requireDependency = createRequire(__filename);

type StoredSession = {
    connectedAt: string;
    cookie: string;
    displayName: null | string;
};

type StreamCacheEntry = {
    expiresAt: number;
    url: string;
};

let innertubeInstance: any | null = null;
let innertubeCookie: null | string = null;
let youtubeRuntimeInstalled = false;
const streamCache = new Map<string, StreamCacheEntry>();

const nowIso = () => new Date().toISOString();

const decrypt = (encrypted: unknown): null | StoredSession => {
    if (typeof encrypted !== 'string') return null;

    try {
        const raw = safeStorage.isEncryptionAvailable()
            ? safeStorage.decryptString(Buffer.from(encrypted, 'hex'))
            : encrypted;
        return JSON.parse(raw) as StoredSession;
    } catch {
        return null;
    }
};

const encrypt = (value: StoredSession) => {
    const raw = JSON.stringify(value);
    if (!safeStorage.isEncryptionAvailable()) return raw;
    return safeStorage.encryptString(raw).toString('hex');
};

const getStoredSession = () => decrypt(store.get(SESSION_KEY));

const clearCachedClient = () => {
    innertubeCookie = null;
    innertubeInstance = null;
    streamCache.clear();
};

const loadYoutubei = async () => {
    try {
        const youtubei = requireDependency('youtubei.js');
        if (!youtubeRuntimeInstalled && youtubei.Platform?.shim) {
            youtubei.Platform.load({
                ...youtubei.Platform.shim,
                eval: async (data: { output: string }, args: Record<string, unknown>) =>
                    vm.runInNewContext(`(() => {\n${data.output}\n})()`, {
                        ...args,
                        URL,
                        URLSearchParams,
                    }),
            });
            youtubeRuntimeInstalled = true;
        }
        return youtubei;
    } catch (error) {
        throw new Error(
            `youtubei.js is not installed or could not be loaded: ${(error as Error).message}`,
        );
    }
};

const getInnertube = async () => {
    const stored = getStoredSession();
    const cookie = stored?.cookie || '';

    if (innertubeInstance && innertubeCookie === cookie) {
        return innertubeInstance;
    }

    const { Innertube, UniversalCache } = await loadYoutubei();
    innertubeInstance = await Innertube.create({
        cache: new UniversalCache(false),
        cookie,
        generate_session_locally: true,
    });
    innertubeCookie = cookie;
    return innertubeInstance;
};

const getCookieHeader = async () => {
    const cookies = await session.fromPartition(LOGIN_PARTITION).cookies.get({});
    const youtubeCookies = cookies.filter((cookie) =>
        ['.youtube.com', 'music.youtube.com', '.google.com', 'accounts.google.com'].some((domain) =>
            (cookie.domain || '').includes(domain),
        ),
    );

    return youtubeCookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
};

const hasRequiredCookies = (cookieHeader: string) => {
    for (const name of REQUIRED_COOKIE_NAMES) {
        if (!cookieHeader.includes(`${name}=`)) return false;
    }
    return true;
};

const status = async (): Promise<YoutubeMusicAuthStatus> => {
    let dependencyAvailable = true;
    try {
        await loadYoutubei();
    } catch {
        dependencyAvailable = false;
    }

    const stored = getStoredSession();
    return {
        connected: Boolean(stored?.cookie),
        connectedAt: stored?.connectedAt || null,
        dependencyAvailable,
        displayName: stored?.displayName || null,
        sourceId: YOUTUBE_MUSIC_SOURCE_ID,
    };
};

const connect = async (): Promise<YoutubeMusicAuthStatus> => {
    await loadYoutubei();

    const loginSession = session.fromPartition(LOGIN_PARTITION);
    const loginWindow = new BrowserWindow({
        autoHideMenuBar: true,
        height: 760,
        title: 'Connect YouTube Music',
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            partition: LOGIN_PARTITION,
            sandbox: true,
        },
        width: 980,
    });

    return new Promise((resolve, reject) => {
        let completed = false;
        const timers: { interval?: NodeJS.Timeout; timeout?: NodeJS.Timeout } = {};

        const finish = async () => {
            if (completed) return;
            const cookie = await getCookieHeader();
            if (!hasRequiredCookies(cookie)) return;

            completed = true;
            if (timers.interval) clearInterval(timers.interval);
            if (timers.timeout) clearTimeout(timers.timeout);

            const stored: StoredSession = {
                connectedAt: nowIso(),
                cookie,
                displayName: YOUTUBE_MUSIC_SOURCE_NAME,
            };
            store.set(SESSION_KEY, encrypt(stored));
            clearCachedClient();
            loginWindow.close();
            resolve(status());
        };

        timers.interval = setInterval(() => {
            finish().catch((error) => {
                completed = true;
                reject(error);
            });
        }, 1000);

        timers.timeout = setTimeout(
            () => {
                if (completed) return;
                completed = true;
                if (timers.interval) clearInterval(timers.interval);
                loginWindow.close();
                reject(new Error('YouTube Music login timed out.'));
            },
            10 * 60 * 1000,
        );

        loginWindow.on('closed', () => {
            if (completed) return;
            completed = true;
            if (timers.interval) clearInterval(timers.interval);
            if (timers.timeout) clearTimeout(timers.timeout);
            reject(new Error('YouTube Music login was cancelled.'));
        });

        loginSession.webRequest.onCompleted({ urls: ['https://music.youtube.com/*'] }, () => {
            finish().catch((error) => {
                completed = true;
                reject(error);
            });
        });

        loginWindow.loadURL(SOURCE_URL).catch(reject);
    });
};

const disconnect = async (): Promise<YoutubeMusicAuthStatus> => {
    store.delete(SESSION_KEY);
    clearCachedClient();
    await session.fromPartition(LOGIN_PARTITION).clearStorageData({
        storages: ['cookies', 'localstorage'],
    });
    return status();
};

const textValue = (value: any): string => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value.text === 'string') return value.text;
    if (Array.isArray(value.runs)) return value.runs.map((run) => run.text).join('');
    if (typeof value.toString === 'function') return value.toString();
    return '';
};

const bestThumbnail = (value: any): null | string => {
    const thumbnails = value?.thumbnails || value?.thumbnail || value;
    if (!Array.isArray(thumbnails) || thumbnails.length === 0) return null;
    return thumbnails[thumbnails.length - 1]?.url || null;
};

const relatedArtist = (artist: any, fallback = 'Unknown Artist'): RelatedArtist => {
    const name = typeof artist === 'string' ? artist : artist?.name || fallback;
    return {
        id: artist?.channel_id || artist?.id || name,
        imageId: null,
        imageUrl: null,
        name,
        userFavorite: false,
        userRating: null,
    };
};

const emptyGenre = (name = 'YouTube Music'): Genre => ({
    _itemType: LibraryItem.GENRE,
    _serverId: YOUTUBE_MUSIC_SOURCE_ID,
    _serverType: ServerType.YOUTUBE_MUSIC,
    albumCount: null,
    id: `ytm-genre-${name}`,
    imageId: null,
    imageUrl: null,
    name,
    songCount: null,
});

const itemArtists = (item: any): RelatedArtist[] => {
    const artists = item?.artists || item?.authors || (item?.author ? [item.author] : []);
    const normalized = Array.isArray(artists) ? artists.map((artist) => relatedArtist(artist)) : [];
    return normalized.length ? normalized : [relatedArtist(null)];
};

const songFromItem = (item: any): null | Song => {
    const videoId =
        item?.video_id ||
        item?.videoId ||
        item?.endpoint?.payload?.videoId ||
        item?.navigation_endpoint?.payload?.videoId ||
        item?.basic_info?.id ||
        item?.id;
    if (!videoId || !VIDEO_ID_REGEX.test(videoId)) return null;

    const artists = itemArtists(item);
    const name = textValue(item?.title || item?.name || item?.basic_info?.title) || 'Untitled';
    const albumName = item?.album?.name || null;
    const durationSeconds = item?.duration?.seconds || item?.basic_info?.duration || 0;
    const createdAt = nowIso();
    const imageUrl = bestThumbnail(item?.thumbnail || item?.basic_info?.thumbnail);

    return {
        _itemType: LibraryItem.SONG,
        _serverId: YOUTUBE_MUSIC_SOURCE_ID,
        _serverType: ServerType.YOUTUBE_MUSIC,
        album: albumName,
        albumArtistName: artists[0]?.name || 'Unknown Artist',
        albumArtists: artists,
        albumId: item?.album?.id || '',
        artistName: artists.map((artist) => artist.name).join(', '),
        artists,
        bitDepth: null,
        bitRate: 0,
        bpm: null,
        channels: null,
        comment: null,
        compilation: null,
        container: null,
        createdAt,
        discNumber: 0,
        discSubtitle: null,
        duration: durationSeconds * 1000,
        explicitStatus: ExplicitStatus.CLEAN,
        gain: null,
        genres: [emptyGenre()],
        id: `ytm:${videoId}`,
        imageId: null,
        imageUrl,
        lastPlayedAt: null,
        lyrics: null,
        mbzRecordingId: null,
        mbzTrackId: null,
        name,
        participants: null,
        path: null,
        peak: null,
        playCount: 0,
        releaseDate: null,
        releaseYear: null,
        sampleRate: null,
        size: 0,
        sortName: name,
        tags: null,
        trackNumber: 0,
        trackSubtitle: null,
        updatedAt: createdAt,
        userFavorite: false,
        userRating: null,
        youtubeMusic: {
            albumBrowseId: item?.album?.id,
            mediaType: item?.item_type === 'video' ? 'video' : 'song',
            videoId,
            watchUrl: `https://music.youtube.com/watch?v=${videoId}`,
        },
    };
};

const albumFromItem = (item: any): Album | null => {
    const id = item?.id || item?.endpoint?.payload?.browseId;
    if (!id) return null;

    const name = textValue(item?.title || item?.name) || 'Untitled Album';
    const artists = itemArtists(item);
    const createdAt = nowIso();

    return {
        _itemType: LibraryItem.ALBUM,
        _serverId: YOUTUBE_MUSIC_SOURCE_ID,
        _serverType: ServerType.YOUTUBE_MUSIC,
        albumArtistName: artists[0]?.name || 'Unknown Artist',
        albumArtists: artists,
        artists,
        comment: null,
        createdAt,
        duration: null,
        explicitStatus: null,
        genres: [emptyGenre()],
        id: `ytm-album:${id}`,
        imageId: null,
        imageUrl: bestThumbnail(item?.thumbnail),
        isCompilation: null,
        lastPlayedAt: null,
        mbzId: null,
        mbzReleaseGroupId: null,
        name,
        originalDate: null,
        originalYear: Number(item?.year) || 0,
        participants: null,
        playCount: null,
        recordLabels: [],
        releaseDate: null,
        releaseType: null,
        releaseTypes: [],
        releaseYear: Number(item?.year) || null,
        size: null,
        songCount: null,
        sortName: name,
        tags: null,
        updatedAt: createdAt,
        userFavorite: false,
        userRating: null,
        version: null,
    };
};

const artistFromItem = (item: any): AlbumArtist | null => {
    const id = item?.id || item?.endpoint?.payload?.browseId;
    if (!id) return null;
    const name = textValue(item?.title || item?.name) || 'Unknown Artist';
    return {
        _itemType: LibraryItem.ALBUM_ARTIST,
        _serverId: YOUTUBE_MUSIC_SOURCE_ID,
        _serverType: ServerType.YOUTUBE_MUSIC,
        albumCount: null,
        biography: null,
        duration: null,
        genres: [emptyGenre()],
        id: `ytm-artist:${id}`,
        imageId: null,
        imageUrl: bestThumbnail(item?.thumbnail),
        lastPlayedAt: null,
        mbz: null,
        name,
        playCount: null,
        similarArtists: null,
        songCount: null,
        userFavorite: false,
        userRating: null,
    };
};

const playlistFromItem = (item: any): null | Playlist => {
    const id = item?.id || item?.playlist_id || item?.endpoint?.payload?.browseId;
    if (!id) return null;
    const name = textValue(item?.title || item?.name) || 'Untitled Playlist';
    return {
        _itemType: LibraryItem.PLAYLIST,
        _serverId: YOUTUBE_MUSIC_SOURCE_ID,
        _serverType: ServerType.YOUTUBE_MUSIC,
        description: null,
        duration: null,
        genres: [emptyGenre()],
        id: `ytm-playlist:${id}`,
        imageId: null,
        imageUrl: bestThumbnail(item?.thumbnail),
        name,
        owner: item?.author?.name || null,
        ownerId: item?.author?.channel_id || null,
        public: null,
        size: null,
        songCount: null,
        sourceReadOnly: true,
        youtubeMusic: {
            browseId: id,
            playlistId: id,
        },
    };
};

const shelfItems = (shelf: any) => {
    if (Array.isArray(shelf)) return shelf;
    return Array.isArray(shelf?.contents) ? shelf.contents : [];
};

const youtubeMusicHomeSection = (
    id: string,
    title: string,
    itemType: LibraryItem.ALBUM | LibraryItem.PLAYLIST | LibraryItem.SONG,
    items: Array<Album | Playlist | Song>,
): YoutubeMusicHomeResponse['sections'][number] => ({
    id,
    items,
    itemType,
    sourceLabel: YOUTUBE_MUSIC_SOURCE_NAME,
    title,
});

const search = async (query: string): Promise<YoutubeMusicSearchResult> => {
    if (!query.trim()) {
        return { albumArtists: [], albums: [], playlists: [], songs: [] };
    }

    const yt = await getInnertube();
    const [songsResult, albumsResult, artistsResult, playlistsResult] = await Promise.all([
        yt.music.search(query, { type: 'song' }).catch(() => null),
        yt.music.search(query, { type: 'album' }).catch(() => null),
        yt.music.search(query, { type: 'artist' }).catch(() => null),
        yt.music.search(query, { type: 'playlist' }).catch(() => null),
    ]);

    return {
        albumArtists: shelfItems(artistsResult?.artists).map(artistFromItem).filter(Boolean),
        albums: shelfItems(albumsResult?.albums).map(albumFromItem).filter(Boolean),
        playlists: shelfItems(playlistsResult?.playlists).map(playlistFromItem).filter(Boolean),
        songs: shelfItems(songsResult?.songs).map(songFromItem).filter(Boolean),
    };
};

const home = async (): Promise<YoutubeMusicHomeResponse> => {
    const yt = await getInnertube();
    const feed = await yt.music.getHomeFeed();
    const sections = (Array.isArray(feed?.sections) ? feed.sections : [])
        .map((section: any, index: number) => {
            const title = textValue(section?.header?.title) || `Shelf ${index + 1}`;
            const contents = Array.isArray(section?.contents) ? section.contents : [];
            const songs = contents.map(songFromItem).filter(Boolean).slice(0, 12);
            if (songs.length > 0) {
                return youtubeMusicHomeSection(
                    `ytm-home-${index}-songs`,
                    title,
                    LibraryItem.SONG,
                    songs,
                );
            }

            const playlists = contents.map(playlistFromItem).filter(Boolean).slice(0, 12);
            if (playlists.length > 0) {
                return youtubeMusicHomeSection(
                    `ytm-home-${index}-playlists`,
                    title,
                    LibraryItem.PLAYLIST,
                    playlists,
                );
            }

            const albums = contents.map(albumFromItem).filter(Boolean).slice(0, 12);
            if (albums.length > 0) {
                return youtubeMusicHomeSection(
                    `ytm-home-${index}-albums`,
                    title,
                    LibraryItem.ALBUM,
                    albums,
                );
            }

            return null;
        })
        .filter(Boolean)
        .slice(0, 8);

    return { sections };
};

const getPlaylistSongs = async (id: string): Promise<Song[]> => {
    const playlistId = id.replace(/^ytm-playlist:/, '');
    const yt = await getInnertube();
    const playlist = await yt.music.getPlaylist(playlistId);

    return shelfItems(playlist?.contents).map(songFromItem).filter(Boolean).slice(0, 100);
};

const getAlbumSongs = async (id: string): Promise<Song[]> => {
    const albumId = id.replace(/^ytm-album:/, '');
    const yt = await getInnertube();
    const album = await yt.music.getAlbum(albumId);

    return shelfItems(album?.contents).map(songFromItem).filter(Boolean).slice(0, 100);
};

const getFallbackSongs = async (): Promise<Song[]> => {
    const yt = await getInnertube();
    const feed = await yt.music.getHomeFeed();
    const playlists = (Array.isArray(feed?.sections) ? feed.sections : [])
        .flatMap((section: any) => (Array.isArray(section?.contents) ? section.contents : []))
        .map(playlistFromItem)
        .filter(Boolean)
        .slice(0, 3);

    const results = await Promise.all(
        playlists.map((playlist) => getPlaylistSongs(playlist.id).catch(() => [])),
    );

    return results
        .flat()
        .filter((song, index, songs) => songs.findIndex((item) => item.id === song.id) === index)
        .slice(0, 50);
};

const getSongList = async (): Promise<Song[]> => {
    const homeResponse = await home();
    const songs = homeResponse.sections
        .filter((section) => section.itemType === LibraryItem.SONG)
        .flatMap((section) => section.items as Song[]);

    if (songs.length > 0) return songs;
    return getFallbackSongs();
};

const getStreamUrl = async (id: string): Promise<string> => {
    const videoId = id.startsWith('ytm:') ? id.slice(4) : id;
    const cached = streamCache.get(videoId);
    if (cached && cached.expiresAt > Date.now()) return cached.url;

    const yt = await getInnertube();
    const info = await yt.music.getInfo(videoId).catch(() => yt.getBasicInfo(videoId));
    const format = info.chooseFormat
        ? info.chooseFormat({ quality: 'best', type: 'audio' })
        : info.streaming_data?.adaptive_formats?.find((candidate: any) =>
              String(candidate?.mime_type || candidate?.mimeType || '').includes('audio'),
          );
    const url = format?.url || (await format?.decipher?.(yt.session.player));

    if (!url) {
        throw new Error('Could not resolve a YouTube Music stream URL.');
    }

    streamCache.set(videoId, {
        expiresAt: Date.now() + STREAM_CACHE_TTL_MS,
        url,
    });
    return url;
};

const getLyrics = async (id: string) => {
    const videoId = id.startsWith('ytm:') ? id.slice(4) : id;
    const yt = await getInnertube();
    const lyrics = await yt.music.getLyrics(videoId);
    return textValue(lyrics?.description) || textValue(lyrics?.contents) || null;
};

ipcMain.handle('youtube-music-status', () => status());
ipcMain.handle('youtube-music-connect', () => connect());
ipcMain.handle('youtube-music-disconnect', () => disconnect());
ipcMain.handle('youtube-music-search', (_event, query: string) => search(query));
ipcMain.handle('youtube-music-home', () => home());
ipcMain.handle('youtube-music-album-songs', (_event, id: string) => getAlbumSongs(id));
ipcMain.handle('youtube-music-playlist-songs', (_event, id: string) => getPlaylistSongs(id));
ipcMain.handle('youtube-music-song-list', () => getSongList());
ipcMain.handle('youtube-music-stream-url', (_event, id: string) => getStreamUrl(id));
ipcMain.handle('youtube-music-lyrics', (_event, id: string) => getLyrics(id));

export const youtubeMusic = {
    getAlbumSongs,
    getLyrics,
    getPlaylistSongs,
    getSongList,
    getStreamUrl,
    home,
    search,
    status,
};
