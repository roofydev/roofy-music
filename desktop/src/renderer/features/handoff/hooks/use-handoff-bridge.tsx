import { useEffect } from 'react';

import { getItemImageUrl } from '/@/renderer/components/item-image/item-image';
import { usePlayer } from '/@/renderer/features/player/context/player-context';
import { useAuthStore, usePlayerStore } from '/@/renderer/store';
import { useTimestampStoreBase } from '/@/renderer/store/timestamp.store';
import { toast } from '/@/shared/components/toast/toast';
import {
    HandoffSnapshot,
    HandoffTrack,
    HandoffTrackSource,
} from '/@/shared/types/handoff-types';
import { LibraryItem, QueueSong } from '/@/shared/types/domain-types';
import { Play, PlayerStatus, ServerType } from '/@/shared/types/types';

const ipc = window.api?.ipc ?? null;

const videoIdFromSong = (song: QueueSong | undefined): null | string => {
    const metadata = (song as (QueueSong & { youtubeMusic?: { videoId?: string } }) | undefined)
        ?.youtubeMusic;
    const candidate =
        metadata?.videoId ||
        (song?.id?.startsWith('ytm:') ? song.id.slice(4) : undefined) ||
        song?.id;
    return candidate && /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : null;
};

const trackSourceFromSong = (song: QueueSong): HandoffTrackSource => {
    const videoId = videoIdFromSong(song);
    if (videoId) return 'youtube';

    const server = Object.values(useAuthStore.getState().serverList).find(
        (item) => item.id === song._serverId,
    );
    if (server?.type === ServerType.NAVIDROME || server?.type === ServerType.SUBSONIC) {
        return 'subsonic';
    }

    return 'unknown';
};

const trackFromSong = (song: QueueSong | undefined): HandoffTrack | null => {
    if (!song) return null;

    const source = trackSourceFromSong(song);
    const videoId = videoIdFromSong(song);
    const artworkUrl =
        getItemImageUrl({
            id: song.id,
            imageUrl: song.imageUrl,
            itemType: LibraryItem.SONG,
            serverId: song._serverId,
            type: 'itemCard',
            useRemoteUrl: true,
        }) || song.imageUrl;

    return {
        album: song.album || undefined,
        artist: song.artistName || 'Unknown artist',
        artworkUrl: artworkUrl || undefined,
        durationMs: Number(song.duration || 0) * 1000 || undefined,
        id: source === 'youtube' && videoId ? videoId : song.id,
        source,
        title: song.name || 'Untitled',
    };
};

const makeSnapshot = (): HandoffSnapshot => {
    const state = usePlayerStore.getState();
    const queue = state.getQueueOrder();
    const current = state.getCurrentSong();
    const currentIndex = queue.items.findIndex((item) => item._uniqueId === current?._uniqueId);
    const upcoming = currentIndex >= 0 ? queue.items.slice(currentIndex + 1) : queue.items;

    return {
        nowPlaying: trackFromSong(current),
        playbackStatus: state.player.status,
        positionMs: Math.max(
            0,
            Math.round(useTimestampStoreBase.getState().timestamp * 1000),
        ),
        queue: upcoming
            .slice(0, 50)
            .map((song) => trackFromSong(song))
            .filter((item): item is HandoffTrack => Boolean(item)),
    };
};

const findQueueSongForHandoffTrack = (track: HandoffTrack): QueueSong | undefined => {
    const queue = usePlayerStore.getState().getQueueOrder().items;

    return queue.find((song) => {
        if (track.source === 'youtube') {
            return videoIdFromSong(song) === track.id;
        }

        if (track.source === 'subsonic') {
            return song.id === track.id;
        }

        return song.id === track.id || song.name === track.title;
    });
};

export const useHandoffBridge = () => {
    const player = usePlayer();

    useEffect(() => {
        if (!ipc) return;

        const collectState = () => {
            try {
                const snapshot = makeSnapshot();
                if (!snapshot.nowPlaying) {
                    ipc.send('handoff:state-error', 'Nothing is playing on desktop.');
                    return;
                }

                ipc.send('handoff:state-response', snapshot);
            } catch (error) {
                ipc.send(
                    'handoff:state-error',
                    error instanceof Error ? error.message : 'Failed to read player state.',
                );
            }
        };

        const applyState = (_event: unknown, snapshot: HandoffSnapshot) => {
            const tracks = [snapshot.nowPlaying, ...snapshot.queue].filter(
                (track): track is HandoffTrack => Boolean(track),
            );
            const songs = tracks
                .map((track) => findQueueSongForHandoffTrack(track))
                .filter((song): song is QueueSong => Boolean(song));

            if (songs.length === 0) {
                toast.warn({
                    message: 'Open the same library tracks on desktop first.',
                    title: 'Playback handoff unavailable',
                });
                return;
            }

            player.addToQueueByData(songs, Play.NOW);
            player.mediaSeekToTimestamp(snapshot.positionMs / 1000);

            if (snapshot.playbackStatus === PlayerStatus.PAUSED) {
                player.mediaPause();
            } else if (snapshot.playbackStatus === PlayerStatus.PLAYING) {
                player.mediaPlay();
            }

            toast.success({ message: 'Playback transferred to desktop', title: 'Roofy Connect' });
        };

        ipc.on('handoff:collect-state', collectState);
        ipc.on('handoff:apply-state', applyState);

        return () => {
            ipc.removeListener('handoff:collect-state', collectState);
            ipc.removeListener('handoff:apply-state', applyState);
        };
    }, [player]);
};

export const HandoffBridgeHook = () => {
    useHandoffBridge();
    return null;
};
