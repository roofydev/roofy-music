import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import isElectron from 'is-electron';
import { useCallback, useEffect, useRef, useState } from 'react';

import styles from './local-video-player.module.css';

import { usePlayerSong, usePlayerStatus, usePlayerTimestamp } from '/@/renderer/store';
import { Icon } from '/@/shared/components/icon/icon';
import { Spinner } from '/@/shared/components/spinner/spinner';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';
import { PlayerStatus } from '/@/shared/types/types';

export type LocalVideoMetadata = null | {
    audioPath: string;
    canDownloadVideo: boolean;
    embedUrl: string;
    sourceUrl: string;
    videoFilePath: string;
    videoFileUrl: string;
    videoId: string;
};

type VideoStreamResolution = {
    error?: string;
    expiresAt?: number;
    mimeType?: string;
    resolvedAt: number;
    source: 'youtube_music';
    trackId: string;
    url?: string;
};

const HARD_SEEK_DRIFT_SECONDS = 1.75;
const HARD_SEEK_COOLDOWN_MS = 3000;
const PLAYER_SEEK_JUMP_SECONDS = 1.5;
const RATE_DRIFT_SECONDS = 0.35;
const RATE_RECOVERY_AMOUNT = 0.04;

export const localVideoMetadataQueryKey = (songId?: string, path?: null | string) => [
    'local-video-metadata',
    songId || '',
    path || '',
];

const videoStreamQueryKey = (videoId?: string) => ['youtube-video-stream', videoId || ''];

export const useLocalVideoMetadata = () => {
    const currentSong = usePlayerSong();

    return useQuery<LocalVideoMetadata>({
        enabled: isElectron() && Boolean(window.api?.localFirst && currentSong?.id),
        queryFn: () =>
            window.api.localFirst.getVideoMetadata({
                path: currentSong?.path,
                songId: currentSong?.id,
                youtubeMusic: currentSong?.youtubeMusic,
            }),
        queryKey: localVideoMetadataQueryKey(currentSong?.id, currentSong?.path),
    });
};

export const useSongVideoAvailability = () => {
    const videoMetadataQuery = useLocalVideoMetadata();
    const metadata = videoMetadataQuery.data;
    const hasLocalFile = Boolean(metadata?.videoFileUrl);
    const hasVideoId = Boolean(metadata?.videoId);
    const shouldResolveStream = hasVideoId && !hasLocalFile;
    const streamResolutionQuery = useVideoStreamResolution(
        shouldResolveStream,
        metadata?.videoId,
    );

    const canPlayVideo =
        hasLocalFile || (hasVideoId && Boolean(streamResolutionQuery.data?.url));

    const isCheckingVideo =
        videoMetadataQuery.isLoading ||
        videoMetadataQuery.isFetching ||
        (shouldResolveStream &&
            (streamResolutionQuery.isLoading || streamResolutionQuery.isFetching));

    const videoUnavailable =
        videoMetadataQuery.isFetched &&
        (!metadata ||
            (!hasLocalFile &&
                (!hasVideoId ||
                    (streamResolutionQuery.isFetched && !streamResolutionQuery.data?.url))));

    return {
        canPlayVideo,
        hasVideoSource: hasLocalFile || hasVideoId,
        isCheckingVideo,
        metadata,
        videoMetadataQuery,
        videoUnavailable,
    };
};

export const useHasVideoAttachment = () => {
    const { canPlayVideo } = useSongVideoAvailability();
    return canPlayVideo;
};

const useVideoStreamResolution = (enabled: boolean, videoId?: string) =>
    useQuery<VideoStreamResolution>({
        enabled: enabled && isElectron() && Boolean(window.api?.youtubeMusic && videoId),
        queryFn: () => window.api.youtubeMusic.resolveVideoStream(videoId!, 'playback'),
        queryKey: videoStreamQueryKey(videoId),
        refetchOnWindowFocus: false,
        retry: 1,
        staleTime: 1000 * 60 * 2,
    });

const getClampedMediaTime = (time: number, duration: number) => {
    if (!Number.isFinite(duration) || duration <= 0) return Math.max(0, time);
    return Math.min(Math.max(0, time), Math.max(0, duration - 0.25));
};

interface SyncedLocalVideoProps {
    metadata: NonNullable<LocalVideoMetadata>;
}

export const SyncedLocalVideo = ({ metadata }: SyncedLocalVideoProps) => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const lastHardSeekAtRef = useRef(0);
    const previousPlayerTimeRef = useRef(0);
    const currentTime = usePlayerTimestamp();
    const playerStatus = usePlayerStatus();
    const [localVideoFailed, setLocalVideoFailed] = useState(false);
    const [streamVideoFailed, setStreamVideoFailed] = useState(false);
    const [isVideoReady, setIsVideoReady] = useState(false);

    const isPlaying = playerStatus === PlayerStatus.PLAYING;
    const shouldResolveStream = Boolean(
        metadata.videoId && (!metadata.videoFileUrl || localVideoFailed),
    );
    const streamResolutionQuery = useVideoStreamResolution(shouldResolveStream, metadata.videoId);
    const localSourceUrl = !localVideoFailed ? metadata.videoFileUrl : '';
    const streamSourceUrl = !streamVideoFailed ? streamResolutionQuery.data?.url || '' : '';
    const videoSourceUrl = localSourceUrl || streamSourceUrl;
    const isLocalSource = Boolean(localSourceUrl);

    useEffect(() => {
        setLocalVideoFailed(false);
        setStreamVideoFailed(false);
        setIsVideoReady(false);
        lastHardSeekAtRef.current = 0;
        previousPlayerTimeRef.current = 0;
    }, [metadata.videoFileUrl, metadata.videoId]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !videoSourceUrl) return;

        video.muted = true;
        const targetTime = getClampedMediaTime(currentTime, video.duration);
        const drift = targetTime - video.currentTime;
        const absDrift = Math.abs(drift);
        const now = Date.now();
        const hasPlayerSeeked =
            Math.abs(currentTime - previousPlayerTimeRef.current) > PLAYER_SEEK_JUMP_SECONDS;
        const canHardSeek = now - lastHardSeekAtRef.current > HARD_SEEK_COOLDOWN_MS;

        if (
            absDrift > HARD_SEEK_DRIFT_SECONDS &&
            (hasPlayerSeeked || isLocalSource || canHardSeek)
        ) {
            video.currentTime = targetTime;
            video.playbackRate = 1;
            lastHardSeekAtRef.current = now;
        } else if (absDrift > RATE_DRIFT_SECONDS && !hasPlayerSeeked) {
            video.playbackRate = drift > 0 ? 1 + RATE_RECOVERY_AMOUNT : 1 - RATE_RECOVERY_AMOUNT;
        } else {
            video.playbackRate = 1;
        }

        if (isPlaying && video.paused) {
            video.play().catch(() => {});
        } else if (!isPlaying && !video.paused) {
            video.pause();
        }

        previousPlayerTimeRef.current = currentTime;
    }, [currentTime, isLocalSource, isPlaying, videoSourceUrl]);

    const handleVideoError = () => {
        if (isLocalSource) {
            setLocalVideoFailed(true);
            return;
        }

        setStreamVideoFailed(true);
    };

    const handleLoadedMetadata = (event: React.SyntheticEvent<HTMLVideoElement>) => {
        const video = event.currentTarget;
        if (!Number.isFinite(video.duration) || video.duration <= 0) {
            handleVideoError();
            return;
        }

        video.currentTime = getClampedMediaTime(currentTime, video.duration);
        if (isPlaying) video.play().catch(() => {});
    };

    const isResolvingSource =
        !videoSourceUrl &&
        (streamResolutionQuery.isLoading || streamResolutionQuery.isFetching);
    const isBufferingVideo = Boolean(videoSourceUrl) && !isVideoReady;

    if (!videoSourceUrl) {
        return (
            <div className={styles.emptyVideoState}>
                {isResolvingSource ? (
                    <Spinner color="var(--theme-colors-foreground)" container size={28} />
                ) : null}
                <Text fw={700} size="sm">
                    {isResolvingSource ? 'Preparing video...' : 'Video unavailable'}
                </Text>
                {!isResolvingSource && (
                    <Text isMuted size="xs">
                        {streamResolutionQuery.data?.error ||
                            (metadata.videoFileUrl && localVideoFailed
                                ? 'Saved MP4 could not be played, and streaming fallback is unavailable.'
                                : 'Roofy could not resolve a clean video stream for this track.')}
                    </Text>
                )}
            </div>
        );
    }

    return (
        <div className={styles.videoShell}>
            {isBufferingVideo && (
                <div aria-hidden className={styles.loadingOverlay}>
                    <Spinner color="var(--theme-colors-foreground)" container size={32} />
                </div>
            )}
            <video
                className={styles.media}
                key={videoSourceUrl}
                muted
                onCanPlay={() => setIsVideoReady(true)}
                onError={handleVideoError}
                onLoadedMetadata={handleLoadedMetadata}
                onLoadStart={() => setIsVideoReady(false)}
                onWaiting={() => setIsVideoReady(false)}
                playsInline
                preload="metadata"
                ref={videoRef}
                src={videoSourceUrl}
            />
        </div>
    );
};

interface VideoModeOverlayProps {
    metadata: NonNullable<LocalVideoMetadata>;
}

export const VideoModeOverlay = ({ metadata }: VideoModeOverlayProps) => {
    return <SyncedLocalVideo metadata={metadata} />;
};

export interface VideoPlayerToolbarProps {
    isDownloading?: boolean;
    metadata: NonNullable<LocalVideoMetadata>;
    onDownload?: () => void;
    onEnterFullscreen?: () => void;
    onExitFullscreen?: () => void;
    variant?: 'default' | 'overlay' | 'playerbar';
}

export const VideoPlayerToolbar = ({
    isDownloading = false,
    metadata,
    onDownload,
    onEnterFullscreen,
    onExitFullscreen,
    variant = 'default',
}: VideoPlayerToolbarProps) => {
    const isSaved = Boolean(metadata.videoFileUrl);
    const statusCopy = isSaved ? 'Saved MP4' : 'Streaming video';

    return (
        <div
            aria-label="Video options"
            className={clsx(styles.toolbar, {
                [styles.toolbarOverlay]: variant === 'overlay',
                [styles.toolbarPlayerbar]: variant === 'playerbar',
            })}
            onClick={(e) => e.stopPropagation()}
            role="toolbar"
        >
            <span className={styles.statusBadge} title={statusCopy}>
                {statusCopy}
            </span>
            <div className={styles.actionGroup}>
                {onEnterFullscreen && (
                    <button
                        className={styles.actionButton}
                        onClick={(e) => {
                            e.stopPropagation();
                            onEnterFullscreen();
                        }}
                        title="Fullscreen video"
                        type="button"
                    >
                        <Icon icon="expand" size="md" />
                    </button>
                )}
                {metadata.sourceUrl && (
                    <button
                        className={styles.actionButton}
                        onClick={(e) => {
                            e.stopPropagation();
                            window.open(metadata.sourceUrl, '_blank');
                        }}
                        title="Open video source"
                        type="button"
                    >
                        <Icon icon="externalLink" size="md" />
                    </button>
                )}
                {isSaved ? (
                    <span className={styles.savedIndicator} title="Video saved in your library">
                        <Icon icon="check" size="md" />
                    </span>
                ) : (
                    <button
                        aria-busy={isDownloading}
                        className={styles.actionButton}
                        disabled={!metadata.canDownloadVideo || isDownloading}
                        onClick={(e) => {
                            e.stopPropagation();
                            onDownload?.();
                        }}
                        title={isDownloading ? 'Saving MP4…' : 'Save MP4 to library'}
                        type="button"
                    >
                        <Icon icon="download" size="md" />
                    </button>
                )}
                {onExitFullscreen && (
                    <button
                        className={styles.actionButton}
                        onClick={(e) => {
                            e.stopPropagation();
                            onExitFullscreen();
                        }}
                        title="Exit fullscreen video"
                        type="button"
                    >
                        <Icon icon="arrowDownS" size="md" />
                    </button>
                )}
            </div>
        </div>
    );
};

export const useDownloadVideoForCurrentSong = () => {
    const queryClient = useQueryClient();
    const currentSong = usePlayerSong();
    const [isDownloading, setIsDownloading] = useState(false);

    const refreshMetadata = useCallback(async () => {
        await queryClient.invalidateQueries({
            queryKey: localVideoMetadataQueryKey(currentSong?.id, currentSong?.path),
        });
    }, [currentSong?.id, currentSong?.path, queryClient]);

    const downloadVideo = useCallback(async () => {
        if (!currentSong || !window.api?.localFirst?.downloadVideoForSong) return;

        const toastId = `save-video-${currentSong.id}`;
        setIsDownloading(true);
        toast.show({
            id: toastId,
            loading: true,
            message: currentSong.name,
            title: 'Saving MP4 video',
            withCloseButton: false,
        });

        try {
            await window.api.localFirst.downloadVideoForSong({
                path: currentSong.path,
                songId: currentSong.id,
                title: currentSong.name,
                youtubeMusic: currentSong.youtubeMusic,
            });
            await refreshMetadata();
            toast.hide(toastId);
            toast.success({
                message: 'Video attached to this library track.',
                title: 'MP4 saved',
                withCloseButton: true,
            });
        } catch (error) {
            toast.hide(toastId);
            toast.error({
                message: (error as Error).message,
                title: 'Could not save MP4',
                withCloseButton: true,
            });
        } finally {
            setIsDownloading(false);
        }
    }, [currentSong, refreshMetadata]);

    return { downloadVideo, isDownloading };
};
