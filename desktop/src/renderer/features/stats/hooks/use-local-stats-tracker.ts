import { useCallback, useRef } from 'react';

import { usePlayerEvents } from '/@/renderer/features/player/audio-player/hooks/use-player-events';
import { recordSongStats } from '/@/renderer/features/stats/api/local-stats';
import {
    incrementQueuePlayCount,
    useAppStore,
    usePlaybackSettings,
    usePlayerStore,
} from '/@/renderer/store';
import { QueueSong } from '/@/shared/types/domain-types';
import { PlayerStatus } from '/@/shared/types/types';

const TRACK_BEGIN_SEC = 5;
const RESTART_PREVIOUS_MIN_SEC = 10;
const MAX_LISTEN_DELTA_SEC = 5;
const FLUSH_LISTEN_MS = 15000;

const meetsPlayThreshold = (listenedMs: number, durationSec: number) => {
    const durationMs = Math.max(0, durationSec * 1000);
    const targetDurationMs = Math.min(240000, durationMs || 240000);
    const targetPercentageMs = durationMs * 0.75;
    return listenedMs >= targetDurationMs || (targetPercentageMs > 0 && listenedMs >= targetPercentageMs);
};

export const useLocalStatsTracker = () => {
    const privateMode = useAppStore((state) => state.privateMode);
    const scrobbleSettings = usePlaybackSettings().scrobble;
    const countedRef = useRef(false);
    const listenedMsRef = useRef(0);
    const pendingListenMsRef = useRef(0);
    const lastSampleTimeRef = useRef<null | number>(null);
    const previousSongRef = useRef<QueueSong | undefined>(undefined);

    const flush = useCallback((song: QueueSong | undefined, playIncrement = 0) => {
        if (privateMode || !song?.id) {
            pendingListenMsRef.current = 0;
            return;
        }

        const listenedMs = pendingListenMsRef.current;
        pendingListenMsRef.current = 0;

        if (listenedMs <= 0 && playIncrement <= 0) {
            return;
        }

        void recordSongStats(song, { listenedMs, playIncrement });
        if (playIncrement > 0) {
            incrementQueuePlayCount([song.id]);
        }
    }, [privateMode]);

    const resetForSong = useCallback((song: QueueSong | undefined) => {
        countedRef.current = false;
        listenedMsRef.current = 0;
        pendingListenMsRef.current = 0;
        lastSampleTimeRef.current = null;
        previousSongRef.current = song;
    }, []);

    const handleCurrentSongChange = useCallback(
        ({ song }: { index: number; song: QueueSong | undefined }) => {
            flush(previousSongRef.current);
            resetForSong(song);
        },
        [flush, resetForSong],
    );

    const handleProgress = useCallback(
        (properties: { timestamp: number }, prev: { timestamp: number }) => {
            const song = usePlayerStore.getState().getCurrentSong();
            const status = usePlayerStore.getState().player.status;

            if (privateMode || !song?.id || status !== PlayerStatus.PLAYING) {
                lastSampleTimeRef.current = properties.timestamp;
                return;
            }

            const currentTime = properties.timestamp;
            const previousTime = prev.timestamp;

            if (
                currentTime < previousTime &&
                currentTime < TRACK_BEGIN_SEC &&
                previousTime >= RESTART_PREVIOUS_MIN_SEC
            ) {
                flush(song);
                resetForSong(song);
                return;
            }

            const lastSample = lastSampleTimeRef.current;
            let deltaSec = 0;

            if (lastSample === null) {
                if (currentTime > previousTime && currentTime - previousTime <= MAX_LISTEN_DELTA_SEC) {
                    deltaSec = currentTime - previousTime;
                }
            } else {
                const jumpedBackToTrackStart =
                    currentTime < lastSample &&
                    currentTime < TRACK_BEGIN_SEC &&
                    lastSample >= TRACK_BEGIN_SEC;

                if (jumpedBackToTrackStart) {
                    flush(song);
                    resetForSong(song);
                    lastSampleTimeRef.current = currentTime;
                    return;
                }

                if (currentTime >= lastSample && currentTime - lastSample <= MAX_LISTEN_DELTA_SEC) {
                    deltaSec = currentTime - lastSample;
                }
            }

            lastSampleTimeRef.current = currentTime;

            if (deltaSec <= 0) {
                return;
            }

            const deltaMs = deltaSec * 1000;
            listenedMsRef.current += deltaMs;
            pendingListenMsRef.current += deltaMs;

            if (!countedRef.current && meetsPlayThreshold(listenedMsRef.current, song.duration / 1000)) {
                countedRef.current = true;
                flush(song, 1);
                return;
            }

            if (pendingListenMsRef.current >= FLUSH_LISTEN_MS) {
                flush(song);
            }
        },
        [flush, privateMode, resetForSong],
    );

    const handleSeek = useCallback(
        ({ timestamp }: { timestamp: number }) => {
            const song = usePlayerStore.getState().getCurrentSong();
            flush(song);

            if (
                timestamp < TRACK_BEGIN_SEC &&
                (lastSampleTimeRef.current === null || lastSampleTimeRef.current >= TRACK_BEGIN_SEC)
            ) {
                countedRef.current = false;
                listenedMsRef.current = 0;
            }

            lastSampleTimeRef.current = timestamp;
        },
        [flush],
    );

    const handleStatus = useCallback(
        ({ status }: { status: PlayerStatus }) => {
            const song = usePlayerStore.getState().getCurrentSong();
            if (status !== PlayerStatus.PLAYING) {
                flush(song);
            }
            lastSampleTimeRef.current = null;
        },
        [flush],
    );

    const handleRepeat = useCallback(() => {
        const song = usePlayerStore.getState().getCurrentSong();
        flush(song);
        resetForSong(song);
    }, [flush, resetForSong]);

    usePlayerEvents(
        {
            onCurrentSongChange: handleCurrentSongChange,
            onPlayerProgress: handleProgress,
            onPlayerRepeated: handleRepeat,
            onPlayerSeekToTimestamp: handleSeek,
            onPlayerStatus: handleStatus,
        },
        [handleCurrentSongChange, handleProgress, handleRepeat, handleSeek, handleStatus],
    );

    return {
        enabled: !privateMode && scrobbleSettings.enabled,
    };
};

const LocalStatsTrackerInner = () => {
    useLocalStatsTracker();
    return null;
};

export const LocalStatsTrackerHook = LocalStatsTrackerInner;
