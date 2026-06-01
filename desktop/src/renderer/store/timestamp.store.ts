import { subscribeWithSelector } from 'zustand/middleware';
import { createWithEqualityFn } from 'zustand/traditional';

interface PlaybackClockState {
    engineDurationSec: number;
    resetPlaybackClock: () => void;
    seekable: boolean;
    setEngineDurationSec: (durationSec: number) => void;
    setSeekable: (seekable: boolean) => void;
    setTimestamp: (timestamp: number) => void;
    timestamp: number;
}

const initialClockState = {
    engineDurationSec: 0,
    seekable: true,
    timestamp: 0,
};

export const useTimestampStoreBase = createWithEqualityFn<PlaybackClockState>()(
    subscribeWithSelector((set) => ({
        ...initialClockState,
        resetPlaybackClock: () => {
            set({ ...initialClockState });
        },
        setEngineDurationSec: (durationSec: number) => {
            if (!Number.isFinite(durationSec) || durationSec <= 0) {
                return;
            }
            set((state) => ({
                engineDurationSec: Math.max(state.engineDurationSec, durationSec),
            }));
        },
        setSeekable: (seekable: boolean) => {
            set({ seekable });
        },
        setTimestamp: (timestamp: number) => {
            set({ timestamp });
        },
    })),
);

export const subscribePlayerProgress = (
    onChange: (properties: { timestamp: number }, prev: { timestamp: number }) => void,
) => {
    return useTimestampStoreBase.subscribe(
        (state) => state.timestamp,
        (timestamp, prevTimestamp) => {
            onChange({ timestamp }, { timestamp: prevTimestamp });
        },
        {
            equalityFn: (a, b) => {
                return a === b;
            },
        },
    );
};

export const usePlayerProgress = () => {
    return useTimestampStoreBase((state) => state.timestamp);
};

export const usePlayerTimestamp = () => {
    return useTimestampStoreBase((state) => state.timestamp);
};

export const usePlaybackSeekable = () => {
    return useTimestampStoreBase((state) => state.seekable);
};

export const usePlaybackDurationSec = (metadataDurationMs?: null | number) => {
    const engineDurationSec = useTimestampStoreBase((state) => state.engineDurationSec);
    const metadataSec =
        metadataDurationMs && Number.isFinite(metadataDurationMs)
            ? metadataDurationMs / 1000
            : 0;

    if (metadataSec > 0 && engineDurationSec > 0) {
        return Math.max(metadataSec, engineDurationSec);
    }

    return metadataSec || engineDurationSec || 0;
};

export const setTimestamp = (timestamp: number) => {
    useTimestampStoreBase.getState().setTimestamp(timestamp);
};

export const setEngineDurationSec = (durationSec: number) => {
    useTimestampStoreBase.getState().setEngineDurationSec(durationSec);
};

export const setPlaybackSeekable = (seekable: boolean) => {
    useTimestampStoreBase.getState().setSeekable(seekable);
};

export const resetPlaybackClock = () => {
    useTimestampStoreBase.getState().resetPlaybackClock();
};

/** Effective duration in seconds for skip/seek bounds (metadata ms + engine). */
export const getPlaybackDurationSec = (metadataDurationMs?: null | number) => {
    const { engineDurationSec } = useTimestampStoreBase.getState();
    const metadataSec =
        metadataDurationMs && Number.isFinite(metadataDurationMs)
            ? metadataDurationMs / 1000
            : 0;

    if (metadataSec > 0 && engineDurationSec > 0) {
        return Math.max(metadataSec, engineDurationSec);
    }

    return metadataSec || engineDurationSec || 0;
};
