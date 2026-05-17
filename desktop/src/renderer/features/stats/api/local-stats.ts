import { get, set } from 'idb-keyval';

import { QueueSong, ServerType } from '/@/shared/types/domain-types';

const STATS_KEY = 'roofy-local-listening-stats-v1';
const STATS_EVENT = 'roofy-local-stats-updated';

export type StatsRange = 'allTime' | number;

export type StatsSong = {
    album: null | string;
    artistName: string;
    artists: { id: string; name: string }[];
    duration: number;
    firstPlayedAt: string;
    genres: { id: string; name: string }[];
    id: string;
    imageId: null | string;
    imageUrl: null | string;
    lastPlayedAt: string;
    name: string;
    playCount: number;
    serverId: string;
    serverType: ServerType;
    totalListenMs: number;
};

export type StatsData = {
    songs: Record<string, StatsSong>;
    version: 1;
    years: Record<string, Record<string, StatsSong>>;
};

export type StatsRankedItem = {
    id: string;
    name: string;
    playCount: number;
    totalListenMs: number;
};

export type StatsSnapshot = {
    availableYears: number[];
    range: StatsRange;
    songsPlayed: number;
    topArtists: StatsRankedItem[];
    topGenres: StatsRankedItem[];
    topSongs: StatsSong[];
    totalListenMs: number;
    totalPlays: number;
};

const emptyStatsData = (): StatsData => ({ songs: {}, version: 1, years: {} });

const getSongKey = (song: Pick<QueueSong, '_serverId' | 'id'>) => `${song._serverId}:${song.id}`;

const cloneStatsSong = (song: StatsSong): StatsSong => ({
    ...song,
    artists: song.artists.map((artist) => ({ ...artist })),
    genres: song.genres.map((genre) => ({ ...genre })),
});

const makeStatsSong = (song: QueueSong, now: string): StatsSong => ({
    album: song.album,
    artistName: song.artistName,
    artists: song.artists.map((artist) => ({ id: artist.id, name: artist.name })),
    duration: song.duration,
    firstPlayedAt: now,
    genres: song.genres.map((genre) => ({ id: genre.id, name: genre.name })),
    id: song.id,
    imageId: song.imageId,
    imageUrl: song.imageUrl,
    lastPlayedAt: now,
    name: song.name,
    playCount: 0,
    serverId: song._serverId,
    serverType: song._serverType,
    totalListenMs: 0,
});

const updateEntry = (
    entry: StatsSong | undefined,
    song: QueueSong,
    now: string,
    listenedMs: number,
    playIncrement: number,
) => {
    const next = entry ? cloneStatsSong(entry) : makeStatsSong(song, now);

    next.album = song.album;
    next.artistName = song.artistName;
    next.artists = song.artists.map((artist) => ({ id: artist.id, name: artist.name }));
    next.duration = song.duration;
    next.genres = song.genres.map((genre) => ({ id: genre.id, name: genre.name }));
    next.imageId = song.imageId;
    next.imageUrl = song.imageUrl;
    next.lastPlayedAt = now;
    next.name = song.name;
    next.playCount += playIncrement;
    next.totalListenMs += Math.max(0, Math.round(listenedMs));

    return next;
};

export const loadStatsData = async (): Promise<StatsData> => {
    const value = await get<StatsData>(STATS_KEY);
    if (!value || value.version !== 1) {
        return emptyStatsData();
    }
    return value;
};

let writeQueue = Promise.resolve();

export const recordSongStats = (
    song: QueueSong,
    options: { listenedMs: number; playIncrement?: number },
) => {
    if (!song.id || song._serverId === '' || (options.listenedMs <= 0 && !options.playIncrement)) {
        return writeQueue;
    }

    writeQueue = writeQueue.then(async () => {
        const data = await loadStatsData();
        const now = new Date().toISOString();
        const year = String(new Date(now).getFullYear());
        const key = getSongKey(song);
        const playIncrement = options.playIncrement ?? 0;

        data.songs[key] = updateEntry(
            data.songs[key],
            song,
            now,
            options.listenedMs,
            playIncrement,
        );
        data.years[year] = data.years[year] ?? {};
        data.years[year][key] = updateEntry(
            data.years[year][key],
            song,
            now,
            options.listenedMs,
            playIncrement,
        );

        await set(STATS_KEY, data);
        window.dispatchEvent(new CustomEvent(STATS_EVENT));
    });

    return writeQueue;
};

const aggregateRankedItems = (
    songs: StatsSong[],
    getItems: (song: StatsSong) => { id: string; name: string }[],
) => {
    const map = new Map<string, StatsRankedItem>();

    for (const song of songs) {
        const items = getItems(song);
        for (const item of items) {
            const key = item.id || item.name;
            if (!key || !item.name) continue;
            const current = map.get(key) ?? {
                id: key,
                name: item.name,
                playCount: 0,
                totalListenMs: 0,
            };
            current.playCount += song.playCount;
            current.totalListenMs += song.totalListenMs;
            map.set(key, current);
        }
    }

    return [...map.values()].sort(
        (a, b) => b.playCount - a.playCount || b.totalListenMs - a.totalListenMs,
    );
};

export const getStatsSnapshot = async (range: StatsRange): Promise<StatsSnapshot> => {
    const data = await loadStatsData();
    const records = range === 'allTime' ? data.songs : (data.years[String(range)] ?? {});
    const songs = Object.values(records);
    const topSongs = songs
        .filter((song) => song.playCount > 0 || song.totalListenMs > 0)
        .sort((a, b) => b.playCount - a.playCount || b.totalListenMs - a.totalListenMs);

    return {
        availableYears: Object.keys(data.years)
            .map(Number)
            .filter(Boolean)
            .sort((a, b) => b - a),
        range,
        songsPlayed: topSongs.length,
        topArtists: aggregateRankedItems(topSongs, (song) =>
            song.artists.length
                ? song.artists
                : [{ id: song.artistName || 'unknown-artist', name: song.artistName || 'Unknown' }],
        ),
        topGenres: aggregateRankedItems(topSongs, (song) => song.genres),
        topSongs,
        totalListenMs: topSongs.reduce((total, song) => total + song.totalListenMs, 0),
        totalPlays: topSongs.reduce((total, song) => total + song.playCount, 0),
    };
};

export const subscribeStatsUpdates = (callback: () => void) => {
    window.addEventListener(STATS_EVENT, callback);
    return () => window.removeEventListener(STATS_EVENT, callback);
};
