import { useQuery } from '@tanstack/react-query';
import isElectron from 'is-electron';
import { FormEvent, useEffect, useMemo, useState } from 'react';

import styles from './youtube-music-route.module.css';

import { AnimatedPage } from '/@/renderer/features/shared/components/animated-page';
import { LibraryContainer } from '/@/renderer/features/shared/components/library-container';
import { addToQueueByData } from '/@/renderer/store';
import { Badge } from '/@/shared/components/badge/badge';
import { Button } from '/@/shared/components/button/button';
import { Group } from '/@/shared/components/group/group';
import { Stack } from '/@/shared/components/stack/stack';
import { Table } from '/@/shared/components/table/table';
import { TextInput } from '/@/shared/components/text-input/text-input';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';
import { LibraryItem, Song } from '/@/shared/types/domain-types';
import { Play } from '/@/shared/types/types';
import { YoutubeMusicAuthStatus } from '/@/shared/types/youtube-music-types';

const YoutubeMusicRoute = () => {
    const [status, setStatus] = useState<null | YoutubeMusicAuthStatus>(null);
    const [query, setQuery] = useState('');
    const [submittedQuery, setSubmittedQuery] = useState('');

    useEffect(() => {
        if (!isElectron() || !window.api?.youtubeMusic) return;
        window.api.youtubeMusic
            .status()
            .then(setStatus)
            .catch((error) => toast.error({ message: (error as Error).message }));
    }, []);

    const homeQuery = useQuery({
        enabled: Boolean(status?.connected),
        queryFn: () => window.api.youtubeMusic.home(),
        queryKey: ['youtube-music', 'home'],
    });

    const searchQuery = useQuery({
        enabled: Boolean(status?.connected && submittedQuery),
        queryFn: () => window.api.youtubeMusic.search(submittedQuery),
        queryKey: ['youtube-music', 'search', submittedQuery],
    });

    const songs = useMemo(() => {
        if (submittedQuery) return searchQuery.data?.songs || [];
        return (
            homeQuery.data?.sections
                .filter((section) => section.itemType === LibraryItem.SONG)
                .flatMap((section) => section.items as Song[]) || []
        );
    }, [homeQuery.data?.sections, searchQuery.data?.songs, submittedQuery]);

    const handleSubmit = (event: FormEvent) => {
        event.preventDefault();
        setSubmittedQuery(query.trim());
    };

    const handlePlay = (song: Song) => {
        addToQueueByData(Play.NOW, [song]);
    };

    const handleQueue = (song: Song) => {
        addToQueueByData(Play.LAST, [song]);
    };

    const handleDownload = async (song: Song) => {
        const videoId = song.youtubeMusic?.videoId;
        if (!videoId || !window.api?.youtubeMusic?.downloadTrack) return;
        try {
            await window.api.youtubeMusic.downloadTrack({
                album: song.album || undefined,
                artist: song.artistName || song.albumArtistName || 'Unknown Artist',
                sourceTrackId: song.id,
                title: song.name,
                videoId,
            });
            toast.success({ message: 'Queued local import' });
        } catch (error) {
            toast.error({ message: (error as Error).message });
        }
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
                                <Badge>{status?.connected ? 'Connected' : 'Disconnected'}</Badge>
                                <Badge>Remote preview</Badge>
                            </Group>
                            <Text isMuted size="sm">
                                Stream tracks before importing them into your local Navidrome
                                library.
                            </Text>
                        </Stack>
                        {!status?.connected && (
                            <Button
                                disabled={status?.dependencyAvailable === false}
                                onClick={() =>
                                    window.api.youtubeMusic
                                        .connect()
                                        .then(setStatus)
                                        .catch((error) =>
                                            toast.error({ message: (error as Error).message }),
                                        )
                                }
                                variant="state-info"
                            >
                                Connect
                            </Button>
                        )}
                    </Group>

                    <form onSubmit={handleSubmit}>
                        <Group wrap="nowrap">
                            <TextInput
                                disabled={!status?.connected}
                                onChange={(event) => setQuery(event.currentTarget.value)}
                                placeholder="Search YouTube Music"
                                value={query}
                                width="100%"
                            />
                            <Button disabled={!status?.connected || !query.trim()} type="submit">
                                Search
                            </Button>
                            {submittedQuery && (
                                <Button onClick={() => setSubmittedQuery('')}>Home</Button>
                            )}
                        </Group>
                    </form>

                    {!status?.connected ? (
                        <Text isMuted>
                            Connect YouTube Music in Settings to enable search, recommendations, and
                            streaming.
                        </Text>
                    ) : (
                        <SongTable
                            loading={homeQuery.isLoading || searchQuery.isLoading}
                            onDownload={handleDownload}
                            onPlay={handlePlay}
                            onQueue={handleQueue}
                            songs={songs}
                            title={submittedQuery ? `Search: ${submittedQuery}` : 'Recommended'}
                        />
                    )}
                </div>
            </LibraryContainer>
        </AnimatedPage>
    );
};

const SongTable = ({
    loading,
    onDownload,
    onPlay,
    onQueue,
    songs,
    title,
}: {
    loading: boolean;
    onDownload: (song: Song) => void;
    onPlay: (song: Song) => void;
    onQueue: (song: Song) => void;
    songs: Song[];
    title: string;
}) => (
    <section className={styles.section}>
        <Group justify="space-between">
            <Text fw={600}>{title}</Text>
            <Text isMuted size="sm">
                {loading ? 'Loading' : `${songs.length} tracks`}
            </Text>
        </Group>
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
                    <Table.Tr className={styles['song-row']} key={song.id}>
                        <Table.Td>
                            {song.imageUrl ? (
                                <img alt="" className={styles.art} src={song.imageUrl} />
                            ) : (
                                <div className={`${styles.art} ${styles['empty-art']}`}>YT</div>
                            )}
                        </Table.Td>
                        <Table.Td>{song.name}</Table.Td>
                        <Table.Td>{song.artistName}</Table.Td>
                        <Table.Td>{song.album || '-'}</Table.Td>
                        <Table.Td>
                            <Group justify="flex-end" wrap="nowrap">
                                <Button onClick={() => onPlay(song)} size="compact-sm">
                                    Play
                                </Button>
                                <Button onClick={() => onQueue(song)} size="compact-sm">
                                    Queue
                                </Button>
                                <Button onClick={() => onDownload(song)} size="compact-sm">
                                    Import
                                </Button>
                            </Group>
                        </Table.Td>
                    </Table.Tr>
                ))}
            </Table.Tbody>
        </Table>
        {!loading && songs.length === 0 && <Text isMuted>No YouTube Music tracks found.</Text>}
    </section>
);

export default YoutubeMusicRoute;
