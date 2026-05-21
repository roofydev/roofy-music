import { useQuery } from '@tanstack/react-query';
import isElectron from 'is-electron';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

import styles from './youtube-music-route.module.css';

import { AnimatedPage } from '/@/renderer/features/shared/components/animated-page';
import { LibraryContainer } from '/@/renderer/features/shared/components/library-container';
import { youtubeMusicAuthStatusQueryKey } from '/@/renderer/features/youtube-music/components/youtube-music-account-button';
import { queryClient } from '/@/renderer/lib/react-query';
import { addToQueueByData, useImportJobActions } from '/@/renderer/store';
import { Badge } from '/@/shared/components/badge/badge';
import { Button } from '/@/shared/components/button/button';
import { Group } from '/@/shared/components/group/group';
import { Icon } from '/@/shared/components/icon/icon';
import { Image } from '/@/shared/components/image/image';
import { Spinner } from '/@/shared/components/spinner/spinner';
import { Stack } from '/@/shared/components/stack/stack';
import { Table } from '/@/shared/components/table/table';
import { TextInput } from '/@/shared/components/text-input/text-input';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';
import { useDebouncedValue } from '/@/shared/hooks/use-debounced-value';
import { LibraryItem, Playlist, Song } from '/@/shared/types/domain-types';
import { Play } from '/@/shared/types/types';
import { YoutubeMusicAuthStatus } from '/@/shared/types/youtube-music-types';

type YtmView = 'browse' | 'login' | 'playlists' | 'search' | 'songs';

const VALID_VIEWS = new Set<YtmView>(['browse', 'login', 'playlists', 'search', 'songs']);

const YoutubeMusicRoute = () => {
    const [status, setStatus] = useState<null | YoutubeMusicAuthStatus>(null);
    const [query, setQuery] = useState('');
    const [debouncedQuery] = useDebouncedValue(query.trim(), 300);
    const [searchParams, setSearchParams] = useSearchParams();
    const { setJob } = useImportJobActions();
    const viewParam = searchParams.get('view') as null | YtmView;
    const activePlaylistId = searchParams.get('playlist');
    const activeView: YtmView = viewParam && VALID_VIEWS.has(viewParam) ? viewParam : 'browse';

    useEffect(() => {
        if (!isElectron() || !window.api?.youtubeMusic) return;
        window.api.youtubeMusic
            .status()
            .then((nextStatus) => {
                setStatus(nextStatus);
                queryClient.setQueryData(youtubeMusicAuthStatusQueryKey, nextStatus);
            })
            .catch((error) => toast.error({ message: (error as Error).message }));
    }, []);

    const isConnected = Boolean(status?.connected);

    const homeQuery = useQuery({
        enabled: isConnected && activeView === 'browse',
        queryFn: () => window.api.youtubeMusic.home(),
        queryKey: ['youtube-music', 'home'],
    });

    const searchQuery = useQuery({
        enabled: isConnected && Boolean(debouncedQuery) && activeView === 'search',
        queryFn: () => window.api.youtubeMusic.search(debouncedQuery || ''),
        queryKey: ['youtube-music', 'search', debouncedQuery],
    });

    const accountSongsQuery = useQuery({
        enabled: isConnected && activeView === 'songs',
        queryFn: () =>
            window.api.youtubeMusic.getAccountSongs
                ? window.api.youtubeMusic.getAccountSongs()
                : window.api.youtubeMusic.getSongList(),
        queryKey: ['youtube-music', 'account-songs'],
    });

    const accountPlaylistsQuery = useQuery({
        enabled: isConnected && activeView === 'playlists',
        queryFn: () => window.api.youtubeMusic.getAccountPlaylists(),
        queryKey: ['youtube-music', 'account-playlists'],
        retry: 1,
    });

    const accountPlaylistDetailQuery = useQuery({
        enabled: isConnected && activeView === 'playlists' && Boolean(activePlaylistId),
        queryFn: () => window.api.youtubeMusic.getPlaylistDetail(activePlaylistId || ''),
        queryKey: ['youtube-music', 'account-playlist-detail', activePlaylistId],
        retry: 1,
    });

    const accountPlaylistSongsQuery = useQuery({
        enabled: isConnected && activeView === 'playlists' && Boolean(activePlaylistId),
        queryFn: () => window.api.youtubeMusic.getAccountPlaylistSongs(activePlaylistId || ''),
        queryKey: ['youtube-music', 'account-playlist-songs', activePlaylistId],
        retry: 1,
    });

    const recommendedSongs = useMemo(
        () =>
            homeQuery.data?.sections
                .filter((section) => section.itemType === LibraryItem.SONG)
                .flatMap((section) => section.items as Song[]) || [],
        [homeQuery.data?.sections],
    );

    const handlePlay = (song: Song) => {
        addToQueueByData(Play.NOW, [song]);
    };

    const handleQueue = (song: Song) => {
        addToQueueByData(Play.LAST, [song]);
    };

    const handleImportSong = useCallback(
        async (song: Song) => {
            const videoId = song.youtubeMusic?.videoId;
            if (!videoId || !window.api?.youtubeMusic?.downloadTrack) return;

            try {
                const job = await window.api.youtubeMusic.downloadTrack({
                    album: song.album || undefined,
                    artist: song.artistName || song.albumArtistName || 'Unknown Artist',
                    imageUrl: song.imageUrl || undefined,
                    sourceTrackId: song.id,
                    title: song.name,
                    videoId,
                });
                setJob(job);
                toast.success({ message: `Import queued: ${song.name}` });
            } catch (error) {
                toast.error({ message: (error as Error).message });
            }
        },
        [setJob],
    );

    const handlePlaylistImport = useCallback(
        async (playlist: Playlist) => {
            const playlistId =
                playlist.youtubeMusic?.playlistId || playlist.id.replace(/^ytm-playlist:/, '');
            if (!playlistId || !window.api?.localFirst?.createImport) return;

            try {
                const job = await window.api.localFirst.createImport({
                    createPlaylist: true,
                    imageUrl: playlist.imageUrl || undefined,
                    input: `https://music.youtube.com/playlist?list=${playlistId}`,
                    playlist: true,
                    playlistName: playlist.name,
                    source: 'youtube_music',
                    sourceTrackId: playlist.id,
                    title: playlist.name,
                });
                setJob(job);
                toast.success({ message: `Import queued: ${playlist.name}` });
            } catch (error) {
                toast.error({ message: (error as Error).message });
            }
        },
        [setJob],
    );

    const handlePlaylistImportTracks = useCallback(
        async (playlist: Playlist) => {
            try {
                const songs = await window.api.youtubeMusic.getAccountPlaylistSongs(playlist.id);
                for (const song of songs) {
                    await handleImportSong(song);
                }
            } catch (error) {
                toast.error({ message: (error as Error).message });
            }
        },
        [handleImportSong],
    );

    const handlePlaylistPlay = useCallback(async (playlist: Playlist, playType: Play) => {
        if (!window.api?.youtubeMusic?.getAccountPlaylistSongs) return;

        try {
            const songs = await window.api.youtubeMusic.getAccountPlaylistSongs(playlist.id);
            if (songs.length === 0) {
                toast.info({ message: `"${playlist.name}" has no playable tracks.` });
                return;
            }

            addToQueueByData(playType, songs);
        } catch (error) {
            toast.error({ message: (error as Error).message });
        }
    }, []);

    const handleOpenPlaylist = useCallback(
        (playlist: Playlist) => {
            const playlistId =
                playlist.youtubeMusic?.playlistId || playlist.id.replace(/^ytm-playlist:/, '');
            setSearchParams({ playlist: playlistId, view: 'playlists' });
        },
        [setSearchParams],
    );

    const handleClosePlaylist = useCallback(() => {
        setSearchParams({ view: 'playlists' });
    }, [setSearchParams]);

    const handleConnect = () => {
        window.api.youtubeMusic
            .connect()
            .then((nextStatus) => {
                setStatus(nextStatus);
                queryClient.setQueryData(youtubeMusicAuthStatusQueryKey, nextStatus);
                queryClient.invalidateQueries({ queryKey: ['youtube-music'] });
                if (nextStatus.connected) {
                    setSearchParams({ view: 'browse' }, { replace: true });
                }
            })
            .catch((error) => toast.error({ message: (error as Error).message }));
    };

    const handleDisconnect = () => {
        window.api.youtubeMusic
            .disconnect()
            .then((nextStatus) => {
                setStatus(nextStatus);
                queryClient.setQueryData(youtubeMusicAuthStatusQueryKey, nextStatus);
                queryClient.invalidateQueries({ queryKey: ['youtube-music'] });
            })
            .catch((error) => toast.error({ message: (error as Error).message }));
    };

    return (
        <AnimatedPage>
            <LibraryContainer>
                <div className={styles.container}>
                    <Group justify="space-between">
                        <Stack gap="xs">
                            <Group>
                                <Text fw={700} size="lg">
                                    YouTube Music
                                </Text>
                                <Badge>{isConnected ? 'Connected' : 'Disconnected'}</Badge>
                                <Badge>Remote source</Badge>
                            </Group>
                            <Text isMuted size="sm">
                                Browse your YouTube Music account, preview remote tracks, and import
                                selected music into your local Roofy library.
                            </Text>
                        </Stack>
                        {!isConnected ? (
                            <Button
                                disabled={status?.dependencyAvailable === false}
                                onClick={handleConnect}
                                variant="state-info"
                            >
                                Login
                            </Button>
                        ) : (
                            <Group gap="xs">
                                {status?.avatarUrl && (
                                    <Image
                                        className={styles.accountImage}
                                        containerClassName={styles.accountAvatar}
                                        includeLoader={false}
                                        src={status.avatarUrl}
                                        unloaderIcon="user"
                                    />
                                )}
                                <Text isMuted size="sm">
                                    {status?.displayName || 'Account'}
                                </Text>
                                <Button
                                    onClick={handleDisconnect}
                                    size="compact-sm"
                                    variant="subtle"
                                >
                                    Logout
                                </Button>
                            </Group>
                        )}
                    </Group>

                    {activeView === 'browse' && (
                        <div className={styles.remotePanel}>
                            {!isConnected ? (
                                <Text isMuted>
                                    Login to enable recommendations, search, account songs, and
                                    playlists.
                                </Text>
                            ) : (
                                <SongTable
                                    error={homeQuery.error}
                                    loading={homeQuery.isLoading}
                                    onImport={handleImportSong}
                                    onPlay={handlePlay}
                                    onQueue={handleQueue}
                                    songs={recommendedSongs}
                                    title="Browse"
                                />
                            )}
                        </div>
                    )}

                    {activeView === 'search' && (
                        <div className={styles.remotePanel}>
                            {isConnected ? (
                                <Stack gap="md">
                                    <TextInput
                                        leftSection={<Icon icon="search" />}
                                        onChange={(event) => setQuery(event.currentTarget.value)}
                                        placeholder="Search YouTube Music"
                                        value={query}
                                        width="100%"
                                    />
                                    <SongTable
                                        error={searchQuery.error}
                                        loading={searchQuery.isLoading || searchQuery.isFetching}
                                        onImport={handleImportSong}
                                        onPlay={handlePlay}
                                        onQueue={handleQueue}
                                        songs={searchQuery.data?.songs || []}
                                        title={
                                            debouncedQuery
                                                ? `Search: ${debouncedQuery}`
                                                : 'Search results'
                                        }
                                    />
                                </Stack>
                            ) : (
                                <Text isMuted>Login to search YouTube Music.</Text>
                            )}
                        </div>
                    )}

                    {activeView === 'songs' && (
                        <div className={styles.remotePanel}>
                            {isConnected ? (
                                <SongTable
                                    error={accountSongsQuery.error}
                                    loading={accountSongsQuery.isLoading}
                                    onImport={handleImportSong}
                                    onPlay={handlePlay}
                                    onQueue={handleQueue}
                                    songs={accountSongsQuery.data || []}
                                    title="My Songs"
                                />
                            ) : (
                                <Text isMuted>Login to load your YouTube Music songs.</Text>
                            )}
                        </div>
                    )}

                    {activeView === 'playlists' && (
                        <div className={styles.remotePanel}>
                            {isConnected ? (
                                activePlaylistId ? (
                                    <PlaylistDetail
                                        fallbackPlaylist={accountPlaylistsQuery.data?.find(
                                            (playlist) =>
                                                playlist.id ===
                                                    `ytm-playlist:${activePlaylistId}` ||
                                                playlist.id === activePlaylistId ||
                                                playlist.youtubeMusic?.playlistId ===
                                                    activePlaylistId,
                                        )}
                                        loading={
                                            accountPlaylistDetailQuery.isLoading ||
                                            accountPlaylistSongsQuery.isLoading
                                        }
                                        onBack={handleClosePlaylist}
                                        onImportPlaylist={handlePlaylistImport}
                                        onImportSong={handleImportSong}
                                        onImportTracks={handlePlaylistImportTracks}
                                        onPlay={handlePlay}
                                        onPlayPlaylist={handlePlaylistPlay}
                                        onQueue={handleQueue}
                                        playlist={accountPlaylistDetailQuery.data}
                                        playlistError={accountPlaylistDetailQuery.error}
                                        songs={accountPlaylistSongsQuery.data || []}
                                        songsError={accountPlaylistSongsQuery.error}
                                    />
                                ) : (
                                    <PlaylistTable
                                        error={accountPlaylistsQuery.error}
                                        loading={accountPlaylistsQuery.isLoading}
                                        onImportPlaylist={handlePlaylistImport}
                                        onImportTracks={handlePlaylistImportTracks}
                                        onOpen={handleOpenPlaylist}
                                        onPlayPlaylist={handlePlaylistPlay}
                                        playlists={accountPlaylistsQuery.data || []}
                                    />
                                )
                            ) : (
                                <Text isMuted>Login to load your YouTube Music playlists.</Text>
                            )}
                        </div>
                    )}

                    {activeView === 'login' && (
                        <Stack className={styles.remotePanel} gap="md">
                            <Text fw={600}>YouTube Music account</Text>
                            <Text isMuted size="sm">
                                Login enables your signed-in YouTube Music library inside Roofy.
                            </Text>
                            {!isConnected ? (
                                <Button
                                    disabled={status?.dependencyAvailable === false}
                                    onClick={handleConnect}
                                    variant="state-info"
                                >
                                    Login
                                </Button>
                            ) : (
                                <Group gap="xs">
                                    <Badge>Connected</Badge>
                                    <Text isMuted size="sm">
                                        {status?.displayName || 'Account'}
                                    </Text>
                                    <Button
                                        onClick={handleDisconnect}
                                        size="compact-sm"
                                        variant="subtle"
                                    >
                                        Logout
                                    </Button>
                                </Group>
                            )}
                        </Stack>
                    )}
                </div>
            </LibraryContainer>
        </AnimatedPage>
    );
};

const SongTable = ({
    error,
    loading,
    onImport,
    onPlay,
    onQueue,
    songs,
    title,
}: {
    error?: Error | null;
    loading: boolean;
    onImport: (song: Song) => void;
    onPlay: (song: Song) => void;
    onQueue: (song: Song) => void;
    songs: Song[];
    title: string;
}) => (
    <section className={styles.section}>
        <Group justify="space-between">
            <Text fw={600}>{title}</Text>
            <Text isMuted size="sm">
                {loading ? 'Loading tracks' : `${songs.length} tracks`}
            </Text>
        </Group>
        {loading ? (
            <LoadingState label="Loading YouTube Music tracks" />
        ) : error ? (
            <ErrorState error={error} />
        ) : (
            <>
                <Table>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th />
                            <Table.Th>Track</Table.Th>
                            <Table.Th>Artist</Table.Th>
                            <Table.Th>Album</Table.Th>
                            <Table.Th />
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {songs.map((song) => (
                            <Table.Tr className={styles.songRow} key={song.id}>
                                <Table.Td>
                                    <Image
                                        className={styles.artImage}
                                        containerClassName={styles.art}
                                        includeLoader={false}
                                        src={song.imageUrl || undefined}
                                        unloaderIcon="emptySongImage"
                                    />
                                </Table.Td>
                                <Table.Td>{song.name}</Table.Td>
                                <Table.Td>{song.artistName}</Table.Td>
                                <Table.Td>{song.album || '-'}</Table.Td>
                                <Table.Td>
                                    <Group justify="flex-end" wrap="nowrap">
                                        <Button onClick={() => onImport(song)} size="compact-sm">
                                            Import
                                        </Button>
                                        <Button onClick={() => onPlay(song)} size="compact-sm">
                                            Play
                                        </Button>
                                        <Button onClick={() => onQueue(song)} size="compact-sm">
                                            Queue
                                        </Button>
                                    </Group>
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
                {songs.length === 0 && <Text isMuted>No YouTube Music tracks found.</Text>}
            </>
        )}
    </section>
);

const PlaylistTable = ({
    error,
    loading,
    onImportPlaylist,
    onImportTracks,
    onOpen,
    onPlayPlaylist,
    playlists,
}: {
    error?: Error | null;
    loading: boolean;
    onImportPlaylist: (playlist: Playlist) => void;
    onImportTracks: (playlist: Playlist) => void;
    onOpen: (playlist: Playlist) => void;
    onPlayPlaylist: (playlist: Playlist, playType: Play) => void;
    playlists: Playlist[];
}) => {
    return (
        <section className={styles.section}>
            <Group justify="space-between">
                <Text fw={600}>My Playlists</Text>
                <Text isMuted size="sm">
                    {loading ? 'Loading playlists' : `${playlists.length} playlists`}
                </Text>
            </Group>
            {loading ? (
                <LoadingState label="Loading YouTube Music playlists" />
            ) : error ? (
                <ErrorState error={error} />
            ) : (
                <>
                    <Table>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th />
                                <Table.Th>Playlist</Table.Th>
                                <Table.Th>Owner</Table.Th>
                                <Table.Th />
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {playlists.map((playlist) => (
                                <Table.Tr className={styles.songRow} key={playlist.id}>
                                    <Table.Td>
                                        <button
                                            className={styles.artButton}
                                            onClick={() => onOpen(playlist)}
                                            type="button"
                                        >
                                            <Image
                                                className={styles.artImage}
                                                containerClassName={styles.art}
                                                includeLoader={false}
                                                src={playlist.imageUrl || undefined}
                                                unloaderIcon="emptyPlaylistImage"
                                            />
                                        </button>
                                    </Table.Td>
                                    <Table.Td>
                                        <button
                                            className={styles.playlistTitleButton}
                                            onClick={() => onOpen(playlist)}
                                            type="button"
                                        >
                                            {playlist.name}
                                        </button>
                                    </Table.Td>
                                    <Table.Td>{playlist.owner || '-'}</Table.Td>
                                    <Table.Td>
                                        <Group justify="flex-end" wrap="nowrap">
                                            <Button
                                                onClick={() => onImportPlaylist(playlist)}
                                                size="compact-sm"
                                            >
                                                Import playlist
                                            </Button>
                                            <Button
                                                onClick={() => onImportTracks(playlist)}
                                                size="compact-sm"
                                                variant="subtle"
                                            >
                                                Import tracks
                                            </Button>
                                            <Button
                                                onClick={() => onPlayPlaylist(playlist, Play.NOW)}
                                                size="compact-sm"
                                                variant="subtle"
                                            >
                                                Play
                                            </Button>
                                        </Group>
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                    {playlists.length === 0 && (
                        <Text isMuted>No YouTube Music playlists found.</Text>
                    )}
                </>
            )}
        </section>
    );
};

const PlaylistDetail = ({
    fallbackPlaylist,
    loading,
    onBack,
    onImportPlaylist,
    onImportSong,
    onImportTracks,
    onPlay,
    onPlayPlaylist,
    onQueue,
    playlist,
    playlistError,
    songs,
    songsError,
}: {
    fallbackPlaylist?: Playlist;
    loading: boolean;
    onBack: () => void;
    onImportPlaylist: (playlist: Playlist) => void;
    onImportSong: (song: Song) => void;
    onImportTracks: (playlist: Playlist) => void;
    onPlay: (song: Song) => void;
    onPlayPlaylist: (playlist: Playlist, playType: Play) => void;
    onQueue: (song: Song) => void;
    playlist?: Playlist;
    playlistError?: Error | null;
    songs: Song[];
    songsError?: Error | null;
}) => {
    const activePlaylist = playlist || fallbackPlaylist;

    return (
        <Stack gap="lg">
            <Group justify="space-between">
                <Group gap="md" wrap="nowrap">
                    <Button onClick={onBack} size="compact-sm" variant="subtle">
                        Back
                    </Button>
                    {activePlaylist && (
                        <Image
                            className={styles.detailImage}
                            containerClassName={styles.detailArt}
                            includeLoader={false}
                            src={activePlaylist.imageUrl || undefined}
                            unloaderIcon="emptyPlaylistImage"
                        />
                    )}
                    <Stack gap="xs">
                        <Text fw={700} size="lg">
                            {activePlaylist?.name || 'YouTube Music playlist'}
                        </Text>
                        <Text isMuted size="sm">
                            {loading ? 'Loading tracks' : `${songs.length} tracks`}
                            {activePlaylist?.owner ? ` · ${activePlaylist.owner}` : ''}
                        </Text>
                    </Stack>
                </Group>
                {activePlaylist && (
                    <Group gap="xs" wrap="nowrap">
                        <Button onClick={() => onImportPlaylist(activePlaylist)} size="compact-sm">
                            Import playlist
                        </Button>
                        <Button
                            onClick={() => onImportTracks(activePlaylist)}
                            size="compact-sm"
                            variant="subtle"
                        >
                            Import tracks
                        </Button>
                        <Button
                            onClick={() => onPlayPlaylist(activePlaylist, Play.NOW)}
                            size="compact-sm"
                            variant="subtle"
                        >
                            Play
                        </Button>
                    </Group>
                )}
            </Group>
            {playlistError && <ErrorState error={playlistError} />}
            <SongTable
                error={songsError}
                loading={loading}
                onImport={onImportSong}
                onPlay={onPlay}
                onQueue={onQueue}
                songs={songs}
                title="Tracks"
            />
        </Stack>
    );
};

const LoadingState = ({ label }: { label: string }) => (
    <div className={styles.loadingState}>
        <Spinner size={24} />
        <Text isMuted size="sm">
            {label}
        </Text>
    </div>
);

const ErrorState = ({ error }: { error: Error }) => (
    <div className={styles.errorState}>
        <Text fw={600}>Could not load this YouTube Music section.</Text>
        <Text isMuted size="sm">
            {error.message}
        </Text>
    </div>
);

export default YoutubeMusicRoute;
