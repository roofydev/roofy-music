import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import isElectron from 'is-electron';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import styles from './quick-import.module.css';

import { queryKeys } from '/@/renderer/api/query-keys';
import { YoutubeMusicPlaylistGrid } from '/@/renderer/features/youtube-music/components/youtube-music-playlist-grid';
import { YoutubeMusicSongsTable } from '/@/renderer/features/youtube-music/components/youtube-music-songs-table';
import { queryClient } from '/@/renderer/lib/react-query';
import { AppRoute } from '/@/renderer/router/routes';
import { addToQueueByData, useCurrentServer, useImportJobActions } from '/@/renderer/store';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Badge } from '/@/shared/components/badge/badge';
import { Button } from '/@/shared/components/button/button';
import { Checkbox } from '/@/shared/components/checkbox/checkbox';
import { Group } from '/@/shared/components/group/group';
import { Icon } from '/@/shared/components/icon/icon';
import { Image } from '/@/shared/components/image/image';
import { Popover } from '/@/shared/components/popover/popover';
import { Stack } from '/@/shared/components/stack/stack';
import { TextInput } from '/@/shared/components/text-input/text-input';
import { ProductUxEmptyState } from '/@/shared/components/product-ux-empty-state';
import { Text } from '/@/shared/components/text/text';
import { showImportError, showPlaybackErrorFromUnknown } from '/@/shared/product-ux';
import { toast } from '/@/shared/components/toast/toast';
import { useDebouncedValue } from '/@/shared/hooks/use-debounced-value';
import {
    ExplicitStatus,
    Genre,
    LibraryItem,
    Playlist,
    RelatedArtist,
    ServerType,
    Song,
} from '/@/shared/types/domain-types';
import { Play } from '/@/shared/types/types';
import { extractYoutubeVideoId } from '/@/shared/utils/youtube-video-id';
import {
    YOUTUBE_MUSIC_SOURCE_ID,
    YoutubeMusicAuthStatus,
} from '/@/shared/types/youtube-music-types';
import { Spinner } from '/@/shared/components/spinner/spinner';

type ImportPreview = {
    album?: string;
    albumArtist?: string;
    artist?: string;
    artists?: string[];
    artworkUrl?: string;
    count: number;
    discNumber?: number;
    duration: null | number;
    durationMs?: number;
    explicit?: boolean;
    isPlaylist: boolean;
    isrc?: string;
    matchConfidence?: number;
    matchState?: ImportTrackPreview['matchState'];
    releaseDate?: string;
    resolvedSource?: ImportSource;
    resolvedSourceTrackId?: string;
    resolvedSourceUrl?: string;
    source: ImportSource;
    sourcePlaylistId?: string;
    sourceTrackId?: string;
    sourceUrl: string;
    thumbnail: string;
    title: string;
    trackNumber?: number;
    tracks?: ImportTrackPreview[];
    uploader: string;
    useSpotdl?: boolean;
    webpageUrl: string;
};

type ImportSource = 'soundcloud' | 'spotify' | 'youtube_music';

type ImportTrackPreview = {
    album?: string;
    albumArtist?: string;
    artist?: string;
    artists?: string[];
    artworkUrl?: string;
    discNumber?: number;
    durationMs?: number;
    explicit?: boolean;
    isrc?: string;
    matchConfidence?: number;
    matchState?: 'in_library' | 'matched' | 'needs_review' | 'unavailable';
    releaseDate?: string;
    resolvedSource?: ImportSource;
    resolvedSourceTrackId?: string;
    resolvedSourceUrl?: string;
    source?: ImportSource;
    sourceTrackId?: string;
    sourceUrl?: string;
    title: string;
    trackNumber?: number;
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

const getImportSource = (value: string): 'unknown' | ImportSource => {
    if (!isUrl(value)) return 'youtube_music';
    try {
        const url = new URL(value.trim());
        const host = url.hostname.replace(/^www\./, '').toLowerCase();
        if (host === 'open.spotify.com') return 'spotify';
        if (host === 'soundcloud.com' || host === 'on.soundcloud.com') return 'soundcloud';
        if (
            host === 'youtube.com' ||
            host === 'm.youtube.com' ||
            host === 'music.youtube.com' ||
            host === 'youtu.be'
        ) {
            return 'youtube_music';
        }
        return 'unknown';
    } catch {
        return 'unknown';
    }
};

const getSourceLabel = (source: ImportSource | undefined, t: (key: string) => string) => {
    if (source === 'spotify') return t('productUx.import.sourceBadge.spotify');
    if (source === 'soundcloud') return t('productUx.import.sourceBadge.soundcloud');
    return t('productUx.import.sourceBadge.onlineCatalog');
};

const hasYoutubeMatchUrl = (track: ImportTrackPreview) =>
    Boolean(extractYoutubeVideoId(track.resolvedSourceUrl));

const isImportableMatch = (track: ImportTrackPreview) =>
    track.matchState === 'matched' && hasYoutubeMatchUrl(track);

const getTrackKey = (track: ImportTrackPreview, index: number) =>
    track.sourceTrackId || `${track.title}-${track.artist || ''}-${index}`;

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

const toRelatedArtist = (name: string): RelatedArtist => ({
    id: name,
    imageId: null,
    imageUrl: null,
    name,
    userFavorite: false,
    userRating: null,
});

const emptyGenre = (): Genre => ({
    _itemType: LibraryItem.GENRE,
    _serverId: YOUTUBE_MUSIC_SOURCE_ID,
    _serverType: ServerType.YOUTUBE_MUSIC,
    albumCount: null,
    id: 'unknown-genre',
    imageId: null,
    imageUrl: null,
    name: 'Unknown',
    songCount: null,
});

const previewTrackToSong = (
    track: ImportTrackPreview,
    index: number,
    fallback?: Pick<ImportPreview, 'durationMs' | 'thumbnail' | 'title' | 'uploader'>,
): Song => {
    const videoId =
        extractYoutubeVideoId(track.resolvedSourceUrl) ||
        extractYoutubeVideoId(track.sourceUrl) ||
        extractYoutubeVideoId(track.resolvedSourceTrackId) ||
        extractYoutubeVideoId(track.sourceTrackId);
    const artistNames =
        track.artists?.filter(Boolean) ||
        (track.artist ? [track.artist] : fallback?.uploader ? [fallback.uploader] : ['Unknown Artist']);
    const artists = artistNames.map(toRelatedArtist);
    const name = track.title || fallback?.title || 'Untitled';
    const createdAt = new Date().toISOString();
    const songId = videoId ? `ytm:${videoId}` : `spotify-preview:${track.sourceTrackId || index}`;

    return {
        _itemType: LibraryItem.SONG,
        _serverId: YOUTUBE_MUSIC_SOURCE_ID,
        _serverType: ServerType.YOUTUBE_MUSIC,
        album: track.album || null,
        albumArtistName: track.albumArtist || artists[0]?.name || 'Unknown Artist',
        albumArtists: artists,
        albumId: '',
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
        discNumber: track.discNumber || 0,
        discSubtitle: null,
        duration: track.durationMs ?? fallback?.durationMs ?? 0,
        explicitStatus: track.explicit ? ExplicitStatus.EXPLICIT : ExplicitStatus.CLEAN,
        gain: null,
        genres: [emptyGenre()],
        id: songId,
        imageId: null,
        imageUrl: track.artworkUrl || fallback?.thumbnail || null,
        lastPlayedAt: null,
        lyrics: null,
        mbzRecordingId: null,
        mbzTrackId: null,
        name,
        participants: null,
        path: null,
        peak: null,
        playCount: 0,
        releaseDate: track.releaseDate || null,
        releaseYear: null,
        sampleRate: null,
        size: 0,
        sortName: name,
        tags: null,
        trackNumber: track.trackNumber || 0,
        trackSubtitle: null,
        updatedAt: createdAt,
        userFavorite: false,
        userRating: null,
        youtubeMusic: videoId
            ? {
                  mediaType: 'song',
                  videoId,
                  watchUrl:
                      track.resolvedSourceUrl ||
                      `https://music.youtube.com/watch?v=${videoId}`,
              }
            : undefined,
    };
};

const previewToSongs = (preview: ImportPreview): Song[] => {
    const tracks =
        preview.tracks?.length && preview.tracks.length > 0
            ? preview.tracks
            : [
                  {
                      album: preview.album,
                      artist: preview.artist || preview.uploader,
                      artworkUrl: preview.artworkUrl || preview.thumbnail,
                      durationMs: preview.durationMs,
                      matchState: preview.matchState,
                      resolvedSourceUrl:
                          preview.resolvedSourceUrl ||
                          preview.webpageUrl ||
                          preview.sourceUrl,
                      sourceTrackId: preview.sourceTrackId,
                      title: preview.title,
                  } satisfies ImportTrackPreview,
              ];

    return tracks.map((track, index) => previewTrackToSong(track, index, preview));
};

export const QuickImport = ({ className, variant = 'panel' }: QuickImportProps) => {
    const { t } = useTranslation();
    const [input, setInput] = useState('');
    const [submittedInput, setSubmittedInput] = useState('');
    const [preview, setPreview] = useState<ImportPreview | null>(null);
    const [acceptedReviewMatches, setAcceptedReviewMatches] = useState<Set<string>>(new Set());
    const [previewLoading, setPreviewLoading] = useState(false);
    const [saveVideo, setSaveVideo] = useState(false);
    const [error, setError] = useState('');
    const [debouncedInput] = useDebouncedValue(input.trim(), 300);
    const navigate = useNavigate();
    const server = useCurrentServer();
    const { setJob } = useImportJobActions();

    const statusQuery = useQuery({
        enabled: isElectron() && Boolean(window.api?.localFirst?.status),
        queryFn: () => window.api.localFirst.status(),
        queryKey: ['local-first', 'quick-import-status'],
        staleTime: 15_000,
    });

    const ytmStatusQuery = useQuery({
        enabled: isElectron() && Boolean(window.api?.youtubeMusic?.status),
        queryFn: () => window.api.youtubeMusic.status(),
        queryKey: ['youtube-music', 'quick-import-status'],
    });

    const isConnected = Boolean(
        (ytmStatusQuery.data as undefined | YoutubeMusicAuthStatus)?.connected,
    );
    const isInline = variant === 'inline';
    const submittedIsUrl = isUrl(submittedInput);
    const submittedSource = getImportSource(submittedInput);
    const importInput = submittedInput;
    const spotdlAvailable = Boolean(statusQuery.data?.tools?.spotdl);
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
        const v = debouncedInput;
        if (!v) {
            setSubmittedInput('');
            setError('');
            return;
        }
        if (!isUrl(v)) {
            setSubmittedInput('');
            setError('');
            return;
        }
        if (getImportSource(v) === 'unknown') {
            setSubmittedInput('');
            setError(t('productUx.import.linkUnsupported'));
            return;
        }
        setError('');
        setSubmittedInput((prev) => (prev === v ? prev : v));
    }, [debouncedInput, t]);

    useEffect(() => {
        if (!submittedInput || !submittedIsUrl) {
            setPreview(null);
            setAcceptedReviewMatches(new Set());
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
                if (!cancelled) {
                    setPreview(result);
                    setAcceptedReviewMatches(new Set());
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    setPreview(null);
                    setError(err?.message || t('productUx.import.linkReadFailed'));
                }
            })
            .finally(() => {
                if (!cancelled) setPreviewLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [submittedInput, submittedIsUrl, t]);

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
        (liveSearchInput && isConnected),
    );

    const handleSubmit = (event: FormEvent) => {
        event.preventDefault();
        const value = input.trim();
        if (!value || !isUrl(value)) return;

        if (getImportSource(value) === 'unknown') {
            setError(t('productUx.import.linkUnsupported'));
            setSubmittedInput('');
            return;
        }

        setError('');
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
            showPlaybackErrorFromUnknown(t, error);
        }
    }, [t]);

    const handleImportPreview = useCallback(async () => {
        if (!preview || !importInput) return;

        try {
            if (preview.source === 'spotify') {
                const tracks = (preview.tracks || [])
                    .map((track, index) =>
                        acceptedReviewMatches.has(getTrackKey(track, index))
                            ? { ...track, matchState: 'matched' as const }
                            : track,
                    )
                    .filter((track, index) => {
                        const trackKey = getTrackKey(track, index);
                        return (
                            isImportableMatch(track) ||
                            (track.matchState === 'needs_review' &&
                                hasYoutubeMatchUrl(track) &&
                                acceptedReviewMatches.has(trackKey))
                        );
                    });

                if (tracks.length > 0) {
                    const primaryUrl = tracks[0].resolvedSourceUrl || importInput;
                    const videoId = extractYoutubeVideoId(primaryUrl);
                    const job = await window.api.localFirst.createImport({
                        artist: preview.uploader,
                        artists: preview.artists,
                        artworkUrl: preview.artworkUrl || preview.thumbnail || undefined,
                        createPlaylist: preview.isPlaylist,
                        imageUrl: preview.thumbnail || undefined,
                        input: primaryUrl,
                        playlist: preview.isPlaylist,
                        playlistName: preview.isPlaylist ? preview.title : undefined,
                        source: 'spotify',
                        sourcePlaylistId: preview.sourcePlaylistId,
                        sourceTrackId: preview.sourceTrackId,
                        sourceTracks: tracks,
                        sourceUrl: preview.sourceUrl,
                        title: preview.title,
                        videoId,
                    });
                    setJob(job);
                    return;
                }

                if (preview.useSpotdl) {
                    const job = await window.api.localFirst.createImport({
                        artworkUrl: preview.artworkUrl || preview.thumbnail || undefined,
                        createPlaylist: preview.isPlaylist,
                        imageUrl: preview.thumbnail || undefined,
                        input: importInput,
                        playlist: preview.isPlaylist,
                        playlistName: preview.isPlaylist ? preview.title : undefined,
                        source: 'spotify',
                        sourcePlaylistId: preview.sourcePlaylistId,
                        sourceTrackId: preview.sourceTrackId,
                        sourceTracks: preview.tracks,
                        sourceUrl: preview.sourceUrl,
                        title: preview.title,
                    });
                    setJob(job);
                    return;
                }

                toast.warn({ message: t('productUx.import.noMatchesReady') });
                return;
            }

            const job = await window.api.localFirst.createImport({
                artist: preview.uploader,
                createPlaylist: preview.isPlaylist,
                imageUrl: preview.thumbnail || undefined,
                input: importInput,
                playlist: preview.isPlaylist,
                playlistName: preview.isPlaylist ? preview.title : undefined,
                saveVideo: preview.source === 'youtube_music' ? saveVideo : false,
                source: preview.source,
                sourcePlaylistId: preview.sourcePlaylistId,
                sourceTrackId: preview.webpageUrl || importInput,
                sourceUrl: preview.sourceUrl || preview.webpageUrl || importInput,
                title: preview.title,
                videoId: getVideoId(submittedInput),
            });
            setJob(job);
        } catch (err: unknown) {
            showImportError(t, err);
        }
    }, [acceptedReviewMatches, importInput, preview, saveVideo, setJob, submittedInput, t]);

    const getImportableSpotifyTrackCount = useCallback(
        (tracks: ImportTrackPreview[] = []) =>
            tracks.filter(
                (track, index) =>
                    isImportableMatch(track) ||
                    (track.matchState === 'needs_review' &&
                        hasYoutubeMatchUrl(track) &&
                        acceptedReviewMatches.has(getTrackKey(track, index))),
            ).length,
        [acceptedReviewMatches],
    );
    const spotifyPreviewSongs = useMemo(
        () => (preview?.source === 'spotify' ? previewToSongs(preview) : []),
        [preview],
    );

    const streamableLinkPreviewSongs = useMemo(() => {
        if (!preview || preview.source === 'spotify') {
            return [];
        }

        return previewToSongs(preview).filter((song) => Boolean(song.youtubeMusic?.videoId));
    }, [preview]);

    const spotifyReviewTracks = useMemo(() => {
        if (preview?.source !== 'spotify' || !preview.tracks?.length) return [];
        return preview.tracks
            .map((track, index) => ({ index, track, trackKey: getTrackKey(track, index) }))
            .filter(
                ({ track, trackKey }) =>
                    track.matchState === 'needs_review' &&
                    hasYoutubeMatchUrl(track) &&
                    !acceptedReviewMatches.has(trackKey),
            );
    }, [acceptedReviewMatches, preview]);

    const spotifyImportDisabled =
        preview?.source === 'spotify' &&
        !preview.useSpotdl &&
        getImportableSpotifyTrackCount(preview.tracks) === 0;

    const isSpotifyLink =
        submittedSource === 'spotify' ||
        preview?.source === 'spotify' ||
        (isUrl(input.trim()) && getImportSource(input.trim()) === 'spotify');

    return (
        <section className={clsx(styles.container, isInline && styles.inline, className)}>
            <Stack gap={isInline ? 'xs' : 'md'}>
                {!isInline && (
                    <Stack gap={4}>
                        <Group gap="xs">
                            <Icon icon="download" size="md" />
                            <Text fw={700}>{t('productUx.import.quickTitle')}</Text>
                        </Group>
                        <Text isMuted size="sm">
                            {t('productUx.import.quickDescription')}
                            {!spotdlAvailable &&
                                ` ${t('productUx.import.spotifySetupRequired')}.`}
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
                                    ? t('productUx.import.linkPlaceholderInline')
                                    : t('productUx.import.linkPlaceholder')
                            }
                            value={input}
                        />
                        {isSpotifyLink && (
                            <SpotifyImportInfoPopover useSpotdl={preview?.useSpotdl} />
                        )}
                    </Group>
                </form>

                {(!isInline || hasResultsPanel) && (
                    <div className={clsx(isInline && styles.inlineDropdown)}>
                        <Stack gap="md">
                            {error && (
                                <Text color="red" size="sm">
                                    {t('productUx.error.import.failed')}
                                </Text>
                            )}

                            {!isInline && !input.trim() && (
                                <Group gap="xs">
                                    <Badge variant="light">Songs</Badge>
                                    <Badge variant="light">Albums</Badge>
                                    <Badge variant="light">Playlists</Badge>
                                    <Badge variant="light">Spotify links</Badge>
                                    <Badge variant="light">SoundCloud links</Badge>
                                    <Badge variant="light">YouTube links</Badge>
                                </Group>
                            )}

                            {liveSearchInput && !isConnected && (
                                <div className={styles.emptyState}>
                                    <ProductUxEmptyState
                                        descriptionKey="productUx.search.youtubeMusic.loginToSearchDescription"
                                        icon="search"
                                        titleKey="productUx.search.youtubeMusic.loginToSearchTitle"
                                    />
                                </div>
                            )}

                            {previewLoading && (
                                <div className={styles.loadingState}>
                                    <Spinner size={22} />
                                    <Stack gap={4}>
                                        <Text fw={600}>{t('productUx.import.readingLinkTitle')}</Text>
                                        <Text isMuted size="sm">
                                            {t('productUx.import.readingLinkDescription')}
                                        </Text>
                                    </Stack>
                                </div>
                            )}

                            {preview && preview.source === 'spotify' && (
                                <Stack gap="sm">
                                    <Group className={styles.spotifyInfoRow} gap="xs" wrap="nowrap">
                                        <Text className={styles.spotifyInfoLabel} isMuted size="sm">
                                            {t('productUx.import.spotifyMatchedOnline')}
                                        </Text>
                                        <SpotifyImportInfoPopover useSpotdl={preview.useSpotdl} />
                                    </Group>
                                    <div className={styles.songsResultPanel}>
                                        <YoutubeMusicSongsTable songs={spotifyPreviewSongs} />
                                    </div>
                                    {spotifyReviewTracks.length > 0 && (
                                        <div className={styles.spotifyReviewActions}>
                                            {spotifyReviewTracks.map(({ index, track, trackKey }) => (
                                                <Button
                                                    key={trackKey}
                                                    onClick={() =>
                                                        setAcceptedReviewMatches((current) =>
                                                            new Set(current).add(trackKey),
                                                        )
                                                    }
                                                    size="compact-sm"
                                                    variant="subtle"
                                                >
                                                    Accept: {track.title || `Track ${index + 1}`}
                                                </Button>
                                            ))}
                                        </div>
                                    )}
                                    <div className={styles.spotifyImportFooter}>
                                        <Button
                                            disabled={spotifyImportDisabled}
                                            onClick={handleImportPreview}
                                        >
                                            {preview.useSpotdl ? 'Import' : 'Import matched'}
                                        </Button>
                                    </div>
                                </Stack>
                            )}

                            {preview &&
                                preview.source !== 'spotify' &&
                                streamableLinkPreviewSongs.length > 0 && (
                                    <Stack gap="sm">
                                        <Text isMuted size="sm">
                                            {t('productUx.import.linkPreviewHint')}
                                        </Text>
                                        <div className={styles.songsResultPanel}>
                                            <YoutubeMusicSongsTable
                                                songs={streamableLinkPreviewSongs}
                                            />
                                        </div>
                                        <div className={styles.previewFooter}>
                                            {preview.source === 'youtube_music' && (
                                                <Checkbox
                                                    checked={saveVideo}
                                                    label={t('productUx.video.saveOnImport')}
                                                    onChange={(event) =>
                                                        setSaveVideo(event.currentTarget.checked)
                                                    }
                                                />
                                            )}
                                            <Button
                                                className={styles.previewImport}
                                                onClick={handleImportPreview}
                                                variant="default"
                                            >
                                                {t('productUx.import.saveToLibrary')}
                                            </Button>
                                        </div>
                                    </Stack>
                                )}

                            {preview &&
                                preview.source !== 'spotify' &&
                                streamableLinkPreviewSongs.length === 0 && (
                                    <div className={styles.previewCard}>
                                        <div className={styles.previewMain}>
                                            <Image
                                                className={styles.previewImageInner}
                                                containerClassName={styles.previewThumb}
                                                includeLoader={false}
                                                src={preview.thumbnail || undefined}
                                                unloaderIcon={
                                                    preview.isPlaylist
                                                        ? 'emptyPlaylistImage'
                                                        : 'emptySongImage'
                                                }
                                            />
                                            <div className={styles.previewInfo}>
                                                <Group
                                                    className={styles.previewMeta}
                                                    gap="xs"
                                                    wrap="wrap"
                                                >
                                                    <Badge variant="light">
                                                        {getSourceLabel(preview.source, t)}
                                                    </Badge>
                                                    <Badge variant="light">
                                                        {preview.isPlaylist
                                                            ? 'Playlist'
                                                            : preview.source === 'soundcloud'
                                                              ? 'Track'
                                                              : 'Video'}
                                                    </Badge>
                                                    {preview.isPlaylist && (
                                                        <Badge>{preview.count} tracks</Badge>
                                                    )}
                                                </Group>
                                                <Text
                                                    className={styles.previewTitle}
                                                    fw={700}
                                                    size="lg"
                                                >
                                                    {preview.title}
                                                </Text>
                                                <Text
                                                    className={styles.previewArtist}
                                                    isMuted
                                                    size="sm"
                                                >
                                                    {preview.uploader}
                                                </Text>
                                            </div>
                                        </div>
                                        <div className={styles.previewFooter}>
                                            {preview.source === 'youtube_music' && (
                                                <Checkbox
                                                    checked={saveVideo}
                                                    label={t('productUx.video.saveOnImport')}
                                                    onChange={(event) =>
                                                        setSaveVideo(event.currentTarget.checked)
                                                    }
                                                />
                                            )}
                                            <Button
                                                className={styles.previewImport}
                                                onClick={handleImportPreview}
                                            >
                                                {t('productUx.import.saveToLibrary')}
                                            </Button>
                                        </div>
                                    </div>
                                )}

                            {liveSearchInput && isConnected && (
                                <Stack gap="md">
                                    {searchQuery.isFetching &&
                                        songs.length === 0 &&
                                        playlists.length === 0 && (
                                            <div className={styles.emptyState}>
                                                <ProductUxEmptyState
                                                    descriptionKey="productUx.search.youtubeMusic.searchingDescription"
                                                    icon="search"
                                                    titleKey="productUx.search.youtubeMusic.searchingTitle"
                                                />
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
                                                <ProductUxEmptyState
                                                    descriptionKey="productUx.search.empty.description"
                                                    icon="search"
                                                    titleKey="productUx.search.empty.title"
                                                />
                                            </div>
                                        )}
                                </Stack>
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

type SpotifyImportInfoPopoverProps = {
    useSpotdl?: boolean;
};

const SpotifyImportInfoPopover = ({ useSpotdl }: SpotifyImportInfoPopoverProps) => {
    const { t } = useTranslation();

    return (
    <Popover position="bottom-start" width={360} withArrow>
        <Popover.Target>
            <ActionIcon
                aria-label="About importing from Spotify"
                className={styles.spotifyInfoButton}
                size="sm"
                variant="subtle"
            >
                <Icon icon="info" size="sm" />
            </ActionIcon>
        </Popover.Target>
        <Popover.Dropdown className={styles.spotifyInfoPopover}>
            <Stack gap="sm">
                <Text fw={600} size="sm">
                    {t('productUx.import.spotifyInfoTitle')}
                </Text>
                <Text isMuted size="sm">
                    {t('productUx.import.spotifyInfoBody1')}
                </Text>
                <Text isMuted size="sm">
                    {t('productUx.import.spotifyInfoBody2')}
                </Text>
                {useSpotdl ? (
                    <Text isMuted size="sm">
                        {t('productUx.import.spotifyAlternatePathHint')}
                    </Text>
                ) : (
                    <Text isMuted size="sm">
                        {t('productUx.import.reviewMatchRequired')}
                    </Text>
                )}
            </Stack>
        </Popover.Dropdown>
    </Popover>
    );
};
