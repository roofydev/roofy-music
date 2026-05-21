import { useQuery } from '@tanstack/react-query';
import isElectron from 'is-electron';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import styles from './quick-import.module.css';

import { queryKeys } from '/@/renderer/api/query-keys';
import { queryClient } from '/@/renderer/lib/react-query';
import { addToQueueByData, useCurrentServer, useImportJobActions } from '/@/renderer/store';
import { Badge } from '/@/shared/components/badge/badge';
import { Button } from '/@/shared/components/button/button';
import { Group } from '/@/shared/components/group/group';
import { Icon } from '/@/shared/components/icon/icon';
import { Image } from '/@/shared/components/image/image';
import { Stack } from '/@/shared/components/stack/stack';
import { Table } from '/@/shared/components/table/table';
import { Text } from '/@/shared/components/text/text';
import { TextInput } from '/@/shared/components/text-input/text-input';
import { useDebouncedValue } from '/@/shared/hooks/use-debounced-value';
import { toast } from '/@/shared/components/toast/toast';
import { Playlist, Song } from '/@/shared/types/domain-types';
import { Play } from '/@/shared/types/types';
import { YoutubeMusicAuthStatus } from '/@/shared/types/youtube-music-types';

type ImportPreview = {
    count: number;
    duration: number | null;
    isPlaylist: boolean;
    thumbnail: string;
    title: string;
    uploader: string;
    webpageUrl: string;
};

const isUrl = (value: string) => /^https?:\/\//i.test(value.trim());

const isYoutubeUrl = (value: string) => {
    if (!isUrl(value)) return false;
    try {
        const url = new URL(value.trim());
        const host = url.hostname.replace(/^www\./, '');
        return (
            host === 'youtube.com' ||
            host === 'm.youtube.com' ||
            host === 'music.youtube.com' ||
            host === 'youtu.be'
        );
    } catch {
        return false;
    }
};

const getVideoId = (value: string) => {
    if (!isYoutubeUrl(value)) return undefined;
    try {
        const url = new URL(value.trim());
        const host = url.hostname.replace(/^www\./, '');
        if (host === 'youtu.be') return url.pathname.replace(/^\//, '') || undefined;
        return url.searchParams.get('v') || undefined;
    } catch {
        return undefined;
    }
};

const getPlaylistId = (value: string) => {
    if (!isYoutubeUrl(value)) return undefined;
    try {
        const url = new URL(value.trim());
        const rawList = url.searchParams.get('list') || undefined;
        const list = rawList?.startsWith('VL') ? rawList.slice(2) : rawList;
        return list && !list.toUpperCase().startsWith('RD') ? list : undefined;
    } catch {
        return undefined;
    }
};

export const QuickImport = () => {
    const [input, setInput] = useState('');
    const [submittedInput, setSubmittedInput] = useState('');
    const [preview, setPreview] = useState<ImportPreview | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [error, setError] = useState('');
    const [debouncedInput] = useDebouncedValue(input.trim(), 300);
    const server = useCurrentServer();
    const { setJob } = useImportJobActions();

    const statusQuery = useQuery({
        enabled: isElectron() && Boolean(window.api?.youtubeMusic?.status),
        queryFn: () => window.api.youtubeMusic.status(),
        queryKey: ['youtube-music', 'quick-import-status'],
    });

    const isConnected = Boolean(
        (statusQuery.data as YoutubeMusicAuthStatus | undefined)?.connected,
    );
    const submittedIsUrl = isUrl(submittedInput);
    const submittedIsYoutubeUrl = isYoutubeUrl(submittedInput);
    const liveSearchInput = debouncedInput && !isUrl(debouncedInput) ? debouncedInput : '';

    const searchQuery = useQuery({
        enabled:
            isElectron() &&
            isConnected &&
            Boolean(liveSearchInput) &&
            Boolean(window.api?.youtubeMusic?.search),
        queryFn: () => window.api.youtubeMusic.search(liveSearchInput),
        queryKey: ['youtube-music', 'quick-import-search', liveSearchInput],
    });

    useEffect(() => {
        const removeListener = window.api.localFirst.onPlaylistImported(() => {
            if (server?.id) {
                queryClient.invalidateQueries({ queryKey: queryKeys.playlists.root(server.id) });
                queryClient.invalidateQueries({ queryKey: queryKeys.playlists.list(server.id) });
                queryClient.invalidateQueries({ queryKey: queryKeys.songs.root(server.id) });
            }
        });
        return () => removeListener();
    }, [server?.id]);

    useEffect(() => {
        if (!submittedInput || !submittedIsUrl) {
            setPreview(null);
            return;
        }

        let cancelled = false;
        setPreviewLoading(true);
        setError('');
        window.api.localFirst
            .previewImport({
                input: submittedInput,
                playlist: Boolean(getPlaylistId(submittedInput)),
            })
            .then((result) => {
                if (!cancelled) setPreview(result);
            })
            .catch((err) => {
                if (!cancelled) {
                    setPreview(null);
                    setError(err?.message || 'Could not read this link.');
                }
            })
            .finally(() => {
                if (!cancelled) setPreviewLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [submittedInput, submittedIsUrl]);

    const songs = useMemo(() => searchQuery.data?.songs?.slice(0, 6) || [], [searchQuery.data]);
    const playlists = useMemo(
        () => searchQuery.data?.playlists?.slice(0, 4) || [],
        [searchQuery.data],
    );

    const handleSubmit = (event: FormEvent) => {
        event.preventDefault();
        const value = input.trim();
        if (!value || !isUrl(value)) return;

        setError('');
        setPreview(null);

        if (isUrl(value) && !isYoutubeUrl(value)) {
            setError('Paste a YouTube or YouTube Music link, or search by title/artist.');
            return;
        }

        setSubmittedInput(value);
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
            } catch (err: any) {
                toast.error({ message: err?.message || 'Import failed' });
            }
        },
        [setJob],
    );

    const handleImportPlaylist = useCallback(
        async (playlist: Playlist) => {
            const playlistId =
                playlist.youtubeMusic?.playlistId || playlist.id.replace(/^ytm-playlist:/, '');
            if (!playlistId) return;

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
            } catch (err: any) {
                toast.error({ message: err?.message || 'Import failed' });
            }
        },
        [setJob],
    );

    const handleImportPreview = useCallback(async () => {
        if (!preview || !submittedInput) return;

        try {
            const job = await window.api.localFirst.createImport({
                artist: preview.uploader,
                createPlaylist: preview.isPlaylist,
                imageUrl: preview.thumbnail || undefined,
                input: submittedInput,
                playlist: preview.isPlaylist,
                playlistName: preview.isPlaylist ? preview.title : undefined,
                source: 'youtube_music',
                sourceTrackId: preview.webpageUrl || submittedInput,
                title: preview.title,
                videoId: getVideoId(submittedInput),
            });
            setJob(job);
        } catch (err: any) {
            toast.error({ message: err?.message || 'Import failed' });
        }
    }, [preview, setJob, submittedInput]);

    return (
        <section className={styles.container}>
            <Stack gap="md">
                <Stack gap={4}>
                    <Group gap="xs">
                        <Icon icon="download" size="md" />
                        <Text fw={700}>Find or import from YouTube Music</Text>
                    </Group>
                    <Text isMuted size="sm">
                        Search by song, artist, or album, or paste a YouTube video/playlist link.
                    </Text>
                </Stack>

                <form onSubmit={handleSubmit}>
                    <Group className={styles.searchRow} gap="sm" wrap="nowrap">
                        <TextInput
                            className={styles.searchInput}
                            leftSection={<Icon icon="search" />}
                            onChange={(event) => setInput(event.currentTarget.value)}
                            placeholder="Search YouTube Music or paste a link"
                            value={input}
                        />
                        {isUrl(input) && (
                            <Button disabled={!input.trim()} loading={previewLoading} type="submit">
                                Preview link
                            </Button>
                        )}
                    </Group>
                </form>

                {error && (
                    <Text color="red" size="sm">
                        {error}
                    </Text>
                )}

                {!input.trim() && (
                    <Group gap="xs">
                        <Badge variant="light">Songs</Badge>
                        <Badge variant="light">Albums</Badge>
                        <Badge variant="light">Playlists</Badge>
                        <Badge variant="light">YouTube links</Badge>
                    </Group>
                )}

                {liveSearchInput && !isConnected && (
                    <div className={styles.emptyState}>
                        <Text fw={600}>Login to search YouTube Music</Text>
                        <Text isMuted size="sm">
                            Paste a direct YouTube link here, or use the YouTube Music Login tab to
                            search your account and recommendations.
                        </Text>
                    </div>
                )}

                {previewLoading && (
                    <div className={styles.emptyState}>
                        <Text fw={600}>Reading link metadata</Text>
                        <Text isMuted size="sm">
                            Fetching title, artwork, and playlist details.
                        </Text>
                    </div>
                )}

                {preview && (
                    <div className={styles.preview}>
                        <Image
                            className={styles.previewImageInner}
                            containerClassName={styles.previewImage}
                            includeLoader={false}
                            src={preview.thumbnail || undefined}
                            unloaderIcon={
                                preview.isPlaylist ? 'emptyPlaylistImage' : 'emptySongImage'
                            }
                        />
                        <Stack className={styles.previewBody} gap="xs">
                            <Group gap="xs">
                                <Badge variant="light">
                                    {preview.isPlaylist ? 'Playlist' : 'Video'}
                                </Badge>
                                {preview.isPlaylist && <Badge>{preview.count} tracks</Badge>}
                            </Group>
                            <Text className={styles.previewTitle} fw={700}>
                                {preview.title}
                            </Text>
                            <Text isMuted size="sm">
                                {preview.uploader}
                            </Text>
                        </Stack>
                        <Button onClick={handleImportPreview}>Import</Button>
                    </div>
                )}

                {liveSearchInput && isConnected && (
                    <Stack gap="md">
                        {searchQuery.isFetching && songs.length === 0 && playlists.length === 0 && (
                            <div className={styles.emptyState}>
                                <Text fw={600}>Searching YouTube Music</Text>
                                <Text isMuted size="sm">
                                    Results will update as you type.
                                </Text>
                            </div>
                        )}
                        {songs.length > 0 && (
                            <ResultSection title="Songs">
                                <Table>
                                    <Table.Tbody>
                                        {songs.map((song) => (
                                            <SongResultRow
                                                key={song.id}
                                                onImport={handleImportSong}
                                                song={song}
                                            />
                                        ))}
                                    </Table.Tbody>
                                </Table>
                            </ResultSection>
                        )}

                        {playlists.length > 0 && (
                            <ResultSection title="Playlists">
                                <Table>
                                    <Table.Tbody>
                                        {playlists.map((playlist) => (
                                            <PlaylistResultRow
                                                key={playlist.id}
                                                onImport={handleImportPlaylist}
                                                playlist={playlist}
                                            />
                                        ))}
                                    </Table.Tbody>
                                </Table>
                            </ResultSection>
                        )}

                        {!searchQuery.isLoading && songs.length === 0 && playlists.length === 0 && (
                            <div className={styles.emptyState}>
                                <Text fw={600}>No results</Text>
                                <Text isMuted size="sm">
                                    Try a different title, artist, or link.
                                </Text>
                            </div>
                        )}
                    </Stack>
                )}

                {submittedIsUrl && !submittedIsYoutubeUrl && (
                    <div className={styles.emptyState}>
                        <Text fw={600}>Unsupported link</Text>
                        <Text isMuted size="sm">
                            Use a YouTube or YouTube Music URL.
                        </Text>
                    </div>
                )}
            </Stack>
        </section>
    );
};

const ResultSection = ({ children, title }: { children: React.ReactNode; title: string }) => (
    <Stack gap="xs">
        <Text fw={600}>{title}</Text>
        {children}
    </Stack>
);

const SongResultRow = ({ onImport, song }: { onImport: (song: Song) => void; song: Song }) => (
    <Table.Tr className={styles.resultRow}>
        <Table.Td w={52}>
            <Image
                className={styles.resultImageInner}
                containerClassName={styles.resultImage}
                includeLoader={false}
                src={song.imageUrl || undefined}
                unloaderIcon="emptySongImage"
            />
        </Table.Td>
        <Table.Td>
            <Text className={styles.resultTitle}>{song.name}</Text>
            <Text isMuted size="sm">
                {song.artistName || song.albumArtistName || 'Unknown Artist'}
            </Text>
        </Table.Td>
        <Table.Td>
            <Group justify="flex-end" wrap="nowrap">
                <Button onClick={() => addToQueueByData(Play.NOW, [song])} size="compact-sm">
                    Play
                </Button>
                <Button onClick={() => addToQueueByData(Play.LAST, [song])} size="compact-sm">
                    Queue
                </Button>
                <Button onClick={() => onImport(song)} size="compact-sm">
                    Import
                </Button>
            </Group>
        </Table.Td>
    </Table.Tr>
);

const PlaylistResultRow = ({
    onImport,
    playlist,
}: {
    onImport: (playlist: Playlist) => void;
    playlist: Playlist;
}) => (
    <Table.Tr className={styles.resultRow}>
        <Table.Td w={52}>
            <Image
                className={styles.resultImageInner}
                containerClassName={styles.resultImage}
                includeLoader={false}
                src={playlist.imageUrl || undefined}
                unloaderIcon="emptyPlaylistImage"
            />
        </Table.Td>
        <Table.Td>
            <Text className={styles.resultTitle}>{playlist.name}</Text>
            <Text isMuted size="sm">
                {playlist.owner || `${playlist.songCount || 0} tracks`}
            </Text>
        </Table.Td>
        <Table.Td>
            <Group justify="flex-end" wrap="nowrap">
                <Button onClick={() => onImport(playlist)} size="compact-sm">
                    Import playlist
                </Button>
            </Group>
        </Table.Td>
    </Table.Tr>
);
