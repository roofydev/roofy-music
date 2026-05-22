import { useQuery } from '@tanstack/react-query';
import isElectron from 'is-electron';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

import styles from './youtube-music-route.module.css';

import { PageHeader } from '/@/renderer/components/page-header/page-header';
import { AnimatedPage } from '/@/renderer/features/shared/components/animated-page';
import { FilterBar } from '/@/renderer/features/shared/components/filter-bar';
import { LibraryContainer } from '/@/renderer/features/shared/components/library-container';
import { LibraryHeaderBar } from '/@/renderer/features/shared/components/library-header-bar';
import { ListWithSidebarContainer } from '/@/renderer/features/shared/components/list-with-sidebar-container';
import { youtubeMusicAuthStatusQueryKey } from '/@/renderer/features/youtube-music/components/youtube-music-account-button';
import { YoutubeMusicHomeCarousels } from '/@/renderer/features/youtube-music/components/youtube-music-home-carousels';
import { YoutubeMusicIcon } from '/@/renderer/features/youtube-music/components/youtube-music-icon';
import { YoutubeMusicPlaylistDetail } from '/@/renderer/features/youtube-music/components/youtube-music-playlist-detail';
import { YoutubeMusicPlaylistGrid } from '/@/renderer/features/youtube-music/components/youtube-music-playlist-grid';
import { YoutubeMusicSongsTable } from '/@/renderer/features/youtube-music/components/youtube-music-songs-table';
import { RefreshButton } from '/@/renderer/features/shared/components/refresh-button';
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

    const [playlistSearchTerm, setPlaylistSearchTerm] = useState('');
    const [songsSearchTerm, setSongsSearchTerm] = useState('');

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

    const filteredSongs = useMemo(() => {
        const songs = accountSongsQuery.data || [];
        if (!songsSearchTerm) return songs;
        const term = songsSearchTerm.toLowerCase();
        return songs.filter(
            (s) =>
                s.name.toLowerCase().includes(term) ||
                s.artistName?.toLowerCase().includes(term) ||
                s.album?.toLowerCase().includes(term),
        );
    }, [accountSongsQuery.data, songsSearchTerm]);

    const filteredPlaylists = useMemo(() => {
        const playlists = accountPlaylistsQuery.data || [];
        if (!playlistSearchTerm) return playlists;
        const term = playlistSearchTerm.toLowerCase();
        return playlists.filter((p) => p.name.toLowerCase().includes(term));
    }, [accountPlaylistsQuery.data, playlistSearchTerm]);

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
                    {activeView === 'browse' && (
                        <Stack gap={0} style={{ flex: 1, minHeight: 0 }}>
                            <PageHeader>
                                <LibraryHeaderBar ignoreMaxWidth>
                                    <LibraryHeaderBar.Title>Browse</LibraryHeaderBar.Title>
                                    <YoutubeMusicIcon size="2rem" />
                                    <RefreshButton
                                        onClick={() =>
                                            queryClient.invalidateQueries({
                                                queryKey: ['youtube-music', 'home', 'main-feed'],
                                            })
                                        }
                                        variant="subtle"
                                    />
                                </LibraryHeaderBar>
                            </PageHeader>
                            <ListWithSidebarContainer>
                                <div className={styles.contentPanel}>
                                    {!isConnected ? (
                                        <Text isMuted>
                                            Login to enable recommendations, search, account songs,
                                            and playlists.
                                        </Text>
                                    ) : (
                                        <YoutubeMusicHomeCarousels maxHeight="calc(100vh - 12rem)" />
                                    )}
                                </div>
                            </ListWithSidebarContainer>
                        </Stack>
                    )}

                    {activeView === 'search' && (
                        <Stack gap={0} style={{ flex: 1, minHeight: 0 }}>
                            <PageHeader>
                                <LibraryHeaderBar ignoreMaxWidth>
                                    <LibraryHeaderBar.Title>
                                        {debouncedQuery || 'Search'}
                                    </LibraryHeaderBar.Title>
                                    <LibraryHeaderBar.Badge>
                                        {searchQuery.data?.songs?.length || 0}
                                    </LibraryHeaderBar.Badge>
                                    <YoutubeMusicIcon size="2rem" />
                                </LibraryHeaderBar>
                                <Group>
                                    <RefreshButton
                                        loading={searchQuery.isFetching}
                                        onClick={() => searchQuery.refetch()}
                                        variant="subtle"
                                    />
                                    <TextInput
                                        leftSection={<Icon icon="search" />}
                                        onChange={(event) =>
                                            setQuery(event.currentTarget.value)
                                        }
                                        placeholder="Search YouTube Music"
                                        value={query}
                                        width={200}
                                    />
                                </Group>
                            </PageHeader>
                            <FilterBar />
                            <ListWithSidebarContainer>
                                {isConnected ? (
                                    <div className={styles.contentPanel}>
                                        {searchQuery.isLoading || searchQuery.isFetching ? (
                                            <LoadingState label="Loading search results" />
                                        ) : searchQuery.error ? (
                                            <ErrorState error={searchQuery.error} />
                                        ) : (
                                            <>
                                                {searchQuery.data?.songs &&
                                                searchQuery.data.songs.length > 0 ? (
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
                                                            {searchQuery.data.songs.map(
                                                                (song) => (
                                                                    <Table.Tr
                                                                        className={
                                                                            styles.songRow
                                                                        }
                                                                        key={song.id}
                                                                    >
                                                                        <Table.Td>
                                                                            <Image
                                                                                className={
                                                                                    styles.artImage
                                                                                }
                                                                                containerClassName={
                                                                                    styles.art
                                                                                }
                                                                                includeLoader={
                                                                                    false
                                                                                }
                                                                                src={
                                                                                    song.imageUrl ||
                                                                                    undefined
                                                                                }
                                                                                unloaderIcon="emptySongImage"
                                                                            />
                                                                        </Table.Td>
                                                                        <Table.Td>
                                                                            {song.name}
                                                                        </Table.Td>
                                                                        <Table.Td>
                                                                            {song.artistName}
                                                                        </Table.Td>
                                                                        <Table.Td>
                                                                            {song.album || '-'}
                                                                        </Table.Td>
                                                                        <Table.Td>
                                                                            <Group
                                                                                justify="flex-end"
                                                                                wrap="nowrap"
                                                                            >
                                                                                <Button
                                                                                    onClick={() =>
                                                                                        handleImportSong(
                                                                                            song,
                                                                                        )
                                                                                    }
                                                                                    size="compact-sm"
                                                                                >
                                                                                    Import
                                                                                </Button>
                                                                                <Button
                                                                                    onClick={() =>
                                                                                        handlePlay(
                                                                                            song,
                                                                                        )
                                                                                    }
                                                                                    size="compact-sm"
                                                                                >
                                                                                    Play
                                                                                </Button>
                                                                                <Button
                                                                                    onClick={() =>
                                                                                        handleQueue(
                                                                                            song,
                                                                                        )
                                                                                    }
                                                                                    size="compact-sm"
                                                                                >
                                                                                    Queue
                                                                                </Button>
                                                                            </Group>
                                                                        </Table.Td>
                                                                    </Table.Tr>
                                                                ),
                                                            )}
                                                        </Table.Tbody>
                                                    </Table>
                                                ) : (
                                                    <Text isMuted>
                                                        {debouncedQuery
                                                            ? 'No tracks found.'
                                                            : 'Type a query to search YouTube Music.'}
                                                    </Text>
                                                )}
                                            </>
                                        )}
                                    </div>
                                ) : (
                                    <div className={styles.contentPanel}>
                                        <Text isMuted>Login to search YouTube Music.</Text>
                                    </div>
                                )}
                            </ListWithSidebarContainer>
                        </Stack>
                    )}

                    {activeView === 'songs' && (
                        <Stack gap={0} style={{ flex: 1, minHeight: 0 }}>
                            <PageHeader>
                                <LibraryHeaderBar ignoreMaxWidth>
                                    <LibraryHeaderBar.PlayButton
                                        itemType={LibraryItem.SONG}
                                        songs={filteredSongs}
                                    />
                                    <LibraryHeaderBar.Title>My Songs</LibraryHeaderBar.Title>
                                    <LibraryHeaderBar.Badge>
                                        {filteredSongs.length}
                                    </LibraryHeaderBar.Badge>
                                    <YoutubeMusicIcon size="2rem" />
                                </LibraryHeaderBar>
                                <Group>
                                    <RefreshButton
                                        loading={accountSongsQuery.isFetching}
                                        onClick={() => accountSongsQuery.refetch()}
                                        variant="subtle"
                                    />
                                    <TextInput
                                        leftSection={<Icon icon="search" />}
                                        onChange={(event) =>
                                            setSongsSearchTerm(event.currentTarget.value)
                                        }
                                        placeholder="Filter songs"
                                        value={songsSearchTerm}
                                        width={200}
                                    />
                                </Group>
                            </PageHeader>
                            <FilterBar />
                            <ListWithSidebarContainer>
                                {isConnected ? (
                                    <div className={styles.contentPanel}>
                                        {accountSongsQuery.isLoading ? (
                                            <LoadingState label="Loading YouTube Music songs" />
                                        ) : accountSongsQuery.error ? (
                                            <ErrorState error={accountSongsQuery.error} />
                                        ) : (
                                            <>
                                                {filteredSongs.length > 0 ? (
                                                    <YoutubeMusicSongsTable songs={filteredSongs} />
                                                ) : (
                                                    <Text isMuted>No tracks found.</Text>
                                                )}
                                            </>
                                        )}
                                    </div>
                                ) : (
                                    <div className={styles.contentPanel}>
                                        <Text isMuted>Login to load your YouTube Music songs.</Text>
                                    </div>
                                )}
                            </ListWithSidebarContainer>
                        </Stack>
                    )}

                    {activeView === 'playlists' && (
                        <Stack gap={0} style={{ flex: 1, minHeight: 0 }}>
                            {activePlaylistId ? (
                                <ListWithSidebarContainer>
                                    {isConnected ? (
                                        <div className={styles.contentPanel}>
                                            {accountPlaylistDetailQuery.isLoading ||
                                            accountPlaylistSongsQuery.isLoading ? (
                                                <LoadingState label="Loading playlist" />
                                            ) : accountPlaylistDetailQuery.error ? (
                                                <ErrorState
                                                    error={accountPlaylistDetailQuery.error}
                                                />
                                            ) : (
                                                <YoutubeMusicPlaylistDetail
                                                    onBack={handleClosePlaylist}
                                                    onImportPlaylist={handlePlaylistImport}
                                                    onImportTracks={handlePlaylistImportTracks}
                                                    onPlayPlaylist={handlePlaylistPlay}
                                                    onRefresh={() => {
                                                        accountPlaylistDetailQuery.refetch();
                                                        accountPlaylistSongsQuery.refetch();
                                                    }}
                                                    playlist={accountPlaylistDetailQuery.data}
                                                    songs={accountPlaylistSongsQuery.data || []}
                                                />
                                            )}
                                        </div>
                                    ) : (
                                        <div className={styles.contentPanel}>
                                            <Text isMuted>
                                                Login to load your YouTube Music playlists.
                                            </Text>
                                        </div>
                                    )}
                                </ListWithSidebarContainer>
                            ) : (
                                <>
                                    <PageHeader>
                                        <LibraryHeaderBar ignoreMaxWidth>
                                            <LibraryHeaderBar.Title>
                                                My Playlists
                                            </LibraryHeaderBar.Title>
                                            <LibraryHeaderBar.Badge>
                                                {filteredPlaylists.length}
                                            </LibraryHeaderBar.Badge>
                                            <YoutubeMusicIcon size="2rem" />
                                        </LibraryHeaderBar>
                                        <Group>
                                            <RefreshButton
                                                loading={accountPlaylistsQuery.isFetching}
                                                onClick={() => accountPlaylistsQuery.refetch()}
                                                variant="subtle"
                                            />
                                            <TextInput
                                                leftSection={<Icon icon="search" />}
                                                onChange={(event) =>
                                                    setPlaylistSearchTerm(event.currentTarget.value)
                                                }
                                                placeholder="Filter playlists"
                                                value={playlistSearchTerm}
                                                width={200}
                                            />
                                        </Group>
                                    </PageHeader>
                                    <FilterBar />
                                    <ListWithSidebarContainer>
                                        {isConnected ? (
                                            <div className={styles.contentPanel}>
                                                {accountPlaylistsQuery.isLoading ? (
                                                    <LoadingState label="Loading YouTube Music playlists" />
                                                ) : accountPlaylistsQuery.error ? (
                                                    <ErrorState
                                                        error={accountPlaylistsQuery.error}
                                                    />
                                                ) : (
                                                    <>
                                                        {filteredPlaylists.length > 0 ? (
                                                            <YoutubeMusicPlaylistGrid
                                                                onOpenPlaylist={handleOpenPlaylist}
                                                                onPlayPlaylist={handlePlaylistPlay}
                                                                playlists={filteredPlaylists}
                                                            />
                                                        ) : (
                                                            <Text isMuted>No playlists found.</Text>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        ) : (
                                            <div className={styles.contentPanel}>
                                                <Text isMuted>
                                                    Login to load your YouTube Music playlists.
                                                </Text>
                                            </div>
                                        )}
                                    </ListWithSidebarContainer>
                                </>
                            )}
                        </Stack>
                    )}

                    {activeView === 'login' && (
                        <Stack gap={0} style={{ flex: 1, minHeight: 0 }}>
                            <PageHeader>
                                <LibraryHeaderBar ignoreMaxWidth>
                                    <LibraryHeaderBar.Title>
                                        YouTube Music account
                                    </LibraryHeaderBar.Title>
                                    <YoutubeMusicIcon size="2rem" />
                                </LibraryHeaderBar>
                            </PageHeader>
                            <div className={styles.remotePanel}>
                                <Stack gap="md">
                                    <Text isMuted size="sm">
                                        Login enables your signed-in YouTube Music library inside
                                        Roofy.
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
                            </div>
                        </Stack>
                    )}
                </div>
            </LibraryContainer>
        </AnimatedPage>
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
