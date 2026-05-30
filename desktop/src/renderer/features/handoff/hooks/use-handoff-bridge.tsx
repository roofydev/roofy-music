import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { getItemImageUrl } from '/@/renderer/components/item-image/item-image';
import { usePlayer } from '/@/renderer/features/player/context/player-context';
import { getSongById } from '/@/renderer/features/player/utils';
import { useAuthStore, usePlayerStore } from '/@/renderer/store';
import { useTimestampStoreBase } from '/@/renderer/store/timestamp.store';
import { toast } from '/@/shared/components/toast/toast';
import { showHandoffError } from '/@/shared/product-ux';
import {
    HandoffSnapshot,
    HandoffTrack,
    HandoffTrackSource,
} from '/@/shared/types/handoff-types';
import { LibraryItem, QueueSong, Song } from '/@/shared/types/domain-types';
import { Play, PlayerStatus, ServerType } from '/@/shared/types/types';

const ipc = window.api?.ipc ?? null;
const youtubeMusic = window.api?.youtubeMusic ?? null;

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
    const { t } = useTranslation();
    const player = usePlayer();
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!ipc) return;

        const resolveHandoffTrack = async (track: HandoffTrack): Promise<null | Song> => {
            if (track.source === 'youtube' && youtubeMusic) {
                try {
                    return await youtubeMusic.getSongDetail(track.id);
                } catch {
                    return null;
                }
            }

            if (track.source === 'subsonic') {
                const serverId = useAuthStore.getState().currentServer?.id;
                if (!serverId) {
                    return findQueueSongForHandoffTrack(track) ?? null;
                }

                try {
                    const response = await getSongById({
                        id: track.id,
                        queryClient,
                        serverId,
                    });
                    return response.items[0] ?? null;
                } catch {
                    return findQueueSongForHandoffTrack(track) ?? null;
                }
            }

            return findQueueSongForHandoffTrack(track) ?? null;
        };

        const collectState = () => {
            try {
                const snapshot = makeSnapshot();
                if (!snapshot.nowPlaying) {
                    ipc.send(
                        'handoff:state-error',
                        t('productUx.error.devices.nothingPlaying'),
                    );
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

        const applyState = async (_event: unknown, snapshot: HandoffSnapshot) => {
            const tracks = [snapshot.nowPlaying, ...snapshot.queue].filter(
                (track): track is HandoffTrack => Boolean(track),
            );
            const resolved = await Promise.all(tracks.map((track) => resolveHandoffTrack(track)));
            const songs = resolved.filter((song): song is Song => Boolean(song));

            if (songs.length === 0) {
                showHandoffError(t, 'handoff_unavailable');
                return;
            }

            player.addToQueueByData(songs, Play.NOW);
            player.mediaSeekToTimestamp(snapshot.positionMs / 1000);

            if (snapshot.playbackStatus === PlayerStatus.PAUSED) {
                player.mediaPause();
            } else if (snapshot.playbackStatus === PlayerStatus.PLAYING) {
                player.mediaPlay();
            }

            toast.success({
                message: t('productUx.devices.nowPlayingHere'),
                title: t('productUx.devices.listenOn'),
            });
        };

        ipc.on('handoff:collect-state', collectState);
        ipc.on('handoff:apply-state', applyState);

        return () => {
            ipc.removeListener('handoff:collect-state', collectState);
            ipc.removeListener('handoff:apply-state', applyState);
        };
    }, [player, queryClient, t]);
};

export const HandoffBridgeHook = () => {
    useHandoffBridge();
    return null;
};
