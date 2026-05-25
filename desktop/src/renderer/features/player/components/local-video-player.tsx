import { useQuery, useQueryClient } from '@tanstack/react-query';
import isElectron from 'is-electron';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import styles from './local-video-player.module.css';

import { usePlayerSong, usePlayerStatus, usePlayerTimestamp } from '/@/renderer/store';
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

type YoutubePlayerCommand =
    | { args: [number, boolean]; event: 'command'; func: 'seekTo' }
    | { args?: unknown[]; event: 'command'; func: 'mute' | 'pauseVideo' | 'playVideo' };

const LOCAL_SYNC_DRIFT_SECONDS = 0.45;
const YOUTUBE_SEEK_DRIFT_SECONDS = 2.25;
const YOUTUBE_SEEK_COOLDOWN_MS = 5000;
const PLAYER_SEEK_JUMP_SECONDS = 1.5;

export const localVideoMetadataQueryKey = (songId?: string, path?: null | string) => [
    'local-video-metadata',
    songId || '',
    path || '',
];

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

export const useHasVideoAttachment = () => {
    const query = useLocalVideoMetadata();
    return Boolean(query.data?.videoFileUrl || query.data?.embedUrl);
};

interface SyncedLocalVideoProps {
    metadata: NonNullable<LocalVideoMetadata>;
    title: string;
}

const postYoutubeCommand = (iframe: HTMLIFrameElement | null, command: YoutubePlayerCommand) => {
    iframe?.contentWindow?.postMessage(JSON.stringify(command), 'https://www.youtube-nocookie.com');
    iframe?.contentWindow?.postMessage(JSON.stringify(command), 'https://www.youtube.com');
};

const buildEmbedUrl = (url: string, videoId: string) => {
    const baseUrl = url || `https://www.youtube-nocookie.com/embed/${videoId}`;
    const parsed = new URL(baseUrl);
    parsed.searchParams.set('autoplay', '1');
    parsed.searchParams.set('controls', '0');
    parsed.searchParams.set('disablekb', '1');
    parsed.searchParams.set('enablejsapi', '1');
    parsed.searchParams.set('fs', '0');
    parsed.searchParams.set('iv_load_policy', '3');
    parsed.searchParams.set('modestbranding', '1');
    parsed.searchParams.set('origin', window.location.origin);
    parsed.searchParams.set('playsinline', '1');
    parsed.searchParams.set('rel', '0');
    parsed.searchParams.set('showinfo', '0');
    return parsed.toString();
};

const getClampedMediaTime = (time: number, duration: number) => {
    if (!Number.isFinite(duration) || duration <= 0) return Math.max(0, time);
    return Math.min(Math.max(0, time), Math.max(0, duration - 0.25));
};

export const SyncedLocalVideo = ({ metadata, title }: SyncedLocalVideoProps) => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const youtubeCurrentTimeRef = useRef(0);
    const youtubeLastSeekRef = useRef(-1);
    const youtubeLastSeekAtRef = useRef(0);
    const previousPlayerTimeRef = useRef(0);
    const currentTime = usePlayerTimestamp();
    const playerStatus = usePlayerStatus();
    const [iframeReady, setIframeReady] = useState(false);
    const [preferLocalVideo, setPreferLocalVideo] = useState(Boolean(metadata.videoFileUrl));

    const isPlaying = playerStatus === PlayerStatus.PLAYING;
    const shouldUseLocalVideo = Boolean(metadata.videoFileUrl && preferLocalVideo);
    const embedUrl = useMemo(
        () => buildEmbedUrl(metadata.embedUrl, metadata.videoId),
        [metadata.embedUrl, metadata.videoId],
    );

    useEffect(() => {
        setIframeReady(false);
        setPreferLocalVideo(Boolean(metadata.videoFileUrl));
        youtubeCurrentTimeRef.current = 0;
        youtubeLastSeekRef.current = -1;
        youtubeLastSeekAtRef.current = 0;
        previousPlayerTimeRef.current = 0;
    }, [metadata.embedUrl, metadata.videoFileUrl]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        video.muted = true;
        const targetTime = getClampedMediaTime(currentTime, video.duration);
        if (Math.abs(video.currentTime - targetTime) > LOCAL_SYNC_DRIFT_SECONDS) {
            video.currentTime = targetTime;
        }

        if (isPlaying && video.paused) {
            video.play().catch(() => {});
        } else if (!isPlaying && !video.paused) {
            video.pause();
        }
    }, [currentTime, isPlaying, metadata.videoFileUrl, shouldUseLocalVideo]);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (!String(event.origin).includes('youtube')) return;

            try {
                const payload =
                    typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                const current = payload?.info?.currentTime;
                if (typeof current === 'number') {
                    youtubeCurrentTimeRef.current = current;
                }
            } catch {
                // Ignore non-JSON messages from the frame.
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    useEffect(() => {
        if (!metadata.embedUrl || !iframeReady || shouldUseLocalVideo) return;

        postYoutubeCommand(iframeRef.current, { event: 'command', func: 'mute' });

        const now = Date.now();
        const drift = Math.abs(youtubeCurrentTimeRef.current - currentTime);
        const hasPlayerSeeked =
            Math.abs(currentTime - previousPlayerTimeRef.current) > PLAYER_SEEK_JUMP_SECONDS;
        const canDriftCorrect = now - youtubeLastSeekAtRef.current > YOUTUBE_SEEK_COOLDOWN_MS;

        if (
            youtubeLastSeekRef.current < 0 ||
            hasPlayerSeeked ||
            (drift > YOUTUBE_SEEK_DRIFT_SECONDS && canDriftCorrect)
        ) {
            const seekTime = Math.max(0, currentTime);
            youtubeLastSeekRef.current = seekTime;
            youtubeLastSeekAtRef.current = now;
            postYoutubeCommand(iframeRef.current, {
                args: [seekTime, true],
                event: 'command',
                func: 'seekTo',
            });
        }

        postYoutubeCommand(iframeRef.current, {
            event: 'command',
            func: isPlaying ? 'playVideo' : 'pauseVideo',
        });
        previousPlayerTimeRef.current = currentTime;
    }, [currentTime, iframeReady, isPlaying, metadata.embedUrl, shouldUseLocalVideo]);

    if (shouldUseLocalVideo) {
        return (
            <video
                className={styles.media}
                key={metadata.videoFileUrl}
                muted
                onError={() => setPreferLocalVideo(false)}
                onLoadedMetadata={(event) => {
                    const video = event.currentTarget;
                    if (!Number.isFinite(video.duration) || video.duration <= 0) {
                        setPreferLocalVideo(false);
                        return;
                    }

                    video.currentTime = getClampedMediaTime(currentTime, video.duration);
                    if (isPlaying) video.play().catch(() => {});
                }}
                playsInline
                preload="metadata"
                ref={videoRef}
                src={metadata.videoFileUrl}
            />
        );
    }

    return (
        <>
            <iframe
                allow="autoplay; encrypted-media; picture-in-picture"
                className={styles.media}
                key={embedUrl}
                onLoad={() => setIframeReady(true)}
                ref={iframeRef}
                src={embedUrl}
                tabIndex={-1}
                title={`Synced video for ${title}`}
            />
            <div className={styles.youtubeChromeMask} />
            <div className={styles.interactionShield} />
        </>
    );
};

interface VideoModeOverlayProps {
    metadata: NonNullable<LocalVideoMetadata>;
}

export const VideoModeOverlay = ({ metadata }: VideoModeOverlayProps) => {
    const currentSong = usePlayerSong();

    const statusCopy = metadata.videoFileUrl ? 'Saved MP4' : 'Streaming video';

    return (
        <>
            <SyncedLocalVideo metadata={metadata} title={currentSong?.name || 'Current track'} />
            <div className={styles.statusBar}>
                <Text className={styles.statusText} fw={700} size="xs">
                    {statusCopy}
                </Text>
            </div>
        </>
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
