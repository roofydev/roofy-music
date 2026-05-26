import { useCallback, useEffect, useRef, useState } from 'react';

import { usePlayerEvents } from '/@/renderer/features/player/audio-player/hooks/use-player-events';
import { usePlayerActions, usePlayerSong } from '/@/renderer/store';
import { ServerType } from '/@/shared/types/domain-types';

type Segment = [number, number];

const SPONSORBLOCK_API = 'https://sponsor.ajay.app';
const CATEGORIES = ['sponsor', 'intro', 'outro', 'interaction', 'selfpromo', 'music_offtopic'];
const VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

const mergeSegments = (segments: Segment[]) => {
    const sorted = [...segments].sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));
    const merged: Segment[] = [];

    for (const segment of sorted) {
        const previous = merged[merged.length - 1];
        if (!previous || previous[1] < segment[0]) {
            merged.push([...segment]);
        } else {
            previous[1] = Math.max(previous[1], segment[1]);
        }
    }

    return merged;
};

const fetchSegments = async (videoId: string): Promise<Segment[]> => {
    const url = `${SPONSORBLOCK_API}/api/skipSegments?videoID=${encodeURIComponent(
        videoId,
    )}&categories=${encodeURIComponent(JSON.stringify(CATEGORIES))}`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = (await response.json()) as Array<{ segment: Segment }>;
    return mergeSegments(data.map((item) => item.segment).filter(Boolean));
};

export const useYoutubeMusicSponsorBlock = () => {
    const currentSong = usePlayerSong();
    const { mediaSeekToTimestamp } = usePlayerActions();
    const [segments, setSegments] = useState<Segment[]>([]);
    const skippedRef = useRef(new Set<string>());

    const videoId =
        currentSong?._serverType === ServerType.YOUTUBE_MUSIC
            ? currentSong.youtubeMusic?.videoId
            : undefined;

    useEffect(() => {
        skippedRef.current.clear();
        setSegments([]);

        if (!videoId || !VIDEO_ID_REGEX.test(videoId)) return;

        let cancelled = false;
        fetchSegments(videoId)
            .then((next) => {
                if (!cancelled) setSegments(next);
            })
            .catch(() => {
                if (!cancelled) setSegments([]);
            });

        return () => {
            cancelled = true;
        };
    }, [videoId]);

    const handleProgress = useCallback(
        ({ timestamp }: { timestamp: number }) => {
            if (!videoId || segments.length === 0) return;

            for (const [start, end] of segments) {
                const key = `${start}:${end}`;
                if (timestamp >= start && timestamp < end && !skippedRef.current.has(key)) {
                    skippedRef.current.add(key);
                    mediaSeekToTimestamp(end);
                    return;
                }
            }
        },
        [mediaSeekToTimestamp, segments, videoId],
    );

    usePlayerEvents(
        {
            onPlayerProgress: handleProgress,
        },
        [handleProgress],
    );
};

export const YoutubeMusicSponsorBlockHook = () => {
    useYoutubeMusicSponsorBlock();
    return null;
};
