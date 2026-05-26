import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import isElectron from 'is-electron';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import styles from './quick-import.module.css';

import { queryKeys } from '/@/renderer/api/query-keys';
import { YoutubeMusicPlaylistGrid } from '/@/renderer/features/youtube-music/components/youtube-music-playlist-grid';
import { YoutubeMusicSongsTable } from '/@/renderer/features/youtube-music/components/youtube-music-songs-table';
import { queryClient } from '/@/renderer/lib/react-query';
import { AppRoute } from '/@/renderer/router/routes';
import { addToQueueByData, useCurrentServer, useImportJobActions } from '/@/renderer/store';
import { Badge } from '/@/shared/components/badge/badge';
import { Button } from '/@/shared/components/button/button';
import { Checkbox } from '/@/shared/components/checkbox/checkbox';
import { Group } from '/@/shared/components/group/group';
import { Icon } from '/@/shared/components/icon/icon';
import { Image } from '/@/shared/components/image/image';
import { Stack } from '/@/shared/components/stack/stack';
import { TextInput } from '/@/shared/components/text-input/text-input';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';
import { useDebouncedValue } from '/@/shared/hooks/use-debounced-value';
import { Playlist } from '/@/shared/types/domain-types';
import { Play } from '/@/shared/types/types';
import { YoutubeMusicAuthStatus } from '/@/shared/types/youtube-music-types';

type ImportPreview = {
    count: number;
    duration: null | number;
    isPlaylist: boolean;
    thumbnail: string;
    title: string;
    uploader: string;
    webpageUrl: string;
};

type QuickImportProps = {
    className?: string;
    variant?: 'inline' | 'panel';
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

export const QuickImport = ({ className, variant = 'panel' }: QuickImportProps) => {
    const [input, setInput] = useState('');
    const [submittedInput, setSubmittedInput] = useState('');
    const [preview, setPreview] = useState<ImportPreview | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [saveVideo, setSaveVideo] = useState(false);
    const [error, setError] = useState('');
    const [debouncedInput] = useDebouncedValue(input.trim(), 300);
    const navigate = useNavigate();
    const server = useCurrentServer();
    const { setJob } = useImportJobActions();

    const statusQuery = useQuery({
        enabled: isElectron() && Boolean(window.api?.youtubeMusic?.status),
        queryFn: () => window.api.youtubeMusic.status(),
        queryKey: ['youtube-music', 'quick-import-status'],
    });

    const isConnected = Boolean(
        (statusQuery.data as undefined | YoutubeMusicAuthStatus)?.connected,
    );
    const isInline = variant === 'inline';
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
    const hasResultsPanel = Boolean(
        error ||
        previewLoading ||
        preview ||
        (liveSearchInput && !isConnected) ||
        (liveSearchInput && isConnected) ||
        (submittedIsUrl && !submittedIsYoutubeUrl),
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

    const handleOpenPlaylist = useCallback(
        (playlist: Playlist) => {
            const playlistId =
                playlist.youtubeMusic?.playlistId || playlist.id.replace(/^ytm-playlist:/, '');
            navigate(`${AppRoute.YOUTUBE_MUSIC}?view=playlists&playlist=${playlistId}`);
        },
        [navigate],
    );
    const handlePlayPlaylist = useCallback(async (playlist: Playlist, playType: Play) => {
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
                saveVideo,
                source: 'youtube_music',
                sourceTrackId: preview.webpageUrl || submittedInput,
                title: preview.title,
                videoId: getVideoId(submittedInput),
            });
            setJob(job);
        } catch (err: any) {
            toast.error({ message: err?.message || 'Import failed' });
        }
    }, [preview, saveVideo, setJob, submittedInput]);

    return (
        <section className={clsx(styles.container, isInline && styles.inline, className)}>
            <Stack gap={isInline ? 'xs' : 'md'}>
                {!isInline && (
                    <Stack gap={4}>
                        <Group gap="xs">
                            <Icon icon="download" size="md" />
                            <Text fw={700}>Find or import from YouTube Music</Text>
                        </Group>
                        <Text isMuted size="sm">
                            Search by song, artist, or album, or paste a YouTube video/playlist
                            link.
                        </Text>
                    </Stack>
                )}

                <form onSubmit={handleSubmit}>
                    <Group className={styles.searchRow} gap="sm" wrap="nowrap">
                        <TextInput
                            className={styles.searchInput}
                            leftSection={<Icon icon="search" />}
                            onChange={(event) => setInput(event.currentTarget.value)}
                            placeholder={
                                isInline
                                    ? 'Search or paste a YouTube link'
                                    : 'Search YouTube Music or paste a link'
                            }
                            value={input}
                        />
                        {isUrl(input) && (
                            <Button disabled={!input.trim()} loading={previewLoading} type="submit">
                                {isInline ? 'Preview' : 'Preview link'}
                            </Button>
                        )}
                    </Group>
                </form>

                {(!isInline || hasResultsPanel) && (
                    <div className={clsx(isInline && styles.inlineDropdown)}>
                        <Stack gap="md">
                            {error && (
                                <Text color="red" size="sm">
                                    {error}
                                </Text>
                            )}

                            {!isInline && !input.trim() && (
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
                                        Paste a direct YouTube link here, or use the YouTube Music
                                        Login tab to search your account and recommendations.
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
                                            preview.isPlaylist
                                                ? 'emptyPlaylistImage'
                                                : 'emptySongImage'
                                        }
                                    />
                                    <Stack className={styles.previewBody} gap="xs">
                                        <Group gap="xs">
                                            <Badge variant="light">
                                                {preview.isPlaylist ? 'Playlist' : 'Video'}
                                            </Badge>
                                            {preview.isPlaylist && (
                                                <Badge>{preview.count} tracks</Badge>
                                            )}
                                        </Group>
                                        <Text className={styles.previewTitle} fw={700}>
                                            {preview.title}
                                        </Text>
                                        <Text isMuted size="sm">
                                            {preview.uploader}
                                        </Text>
                                    </Stack>
                                    <Stack align="flex-end" gap="xs">
                                        <Checkbox
                                            checked={saveVideo}
                                            label="Save MP4 video"
                                            onChange={(event) =>
                                                setSaveVideo(event.currentTarget.checked)
                                            }
                                        />
                                        <Button onClick={handleImportPreview}>Import</Button>
                                    </Stack>
                                </div>
                            )}

                            {liveSearchInput && isConnected && (
                                <Stack gap="md">
                                    {searchQuery.isFetching &&
                                        songs.length === 0 &&
                                        playlists.length === 0 && (
                                            <div className={styles.emptyState}>
                                                <Text fw={600}>Searching YouTube Music</Text>
                                                <Text isMuted size="sm">
                                                    Results will update as you type.
                                                </Text>
                                            </div>
                                        )}
                                    {songs.length > 0 && (
                                        <div className={styles.songsResultPanel}>
                                            <YoutubeMusicSongsTable songs={songs} />
                                        </div>
                                    )}

                                    {playlists.length > 0 && (
                                        <ResultSection title="Playlists">
                                            <div className={styles.playlistsResultPanel}>
                                                <YoutubeMusicPlaylistGrid
                                                    onOpenPlaylist={handleOpenPlaylist}
                                                    onPlayPlaylist={handlePlayPlaylist}
                                                    playlists={playlists}
                                                />
                                            </div>
                                        </ResultSection>
                                    )}

                                    {!searchQuery.isLoading &&
                                        songs.length === 0 &&
                                        playlists.length === 0 && (
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
