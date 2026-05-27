import { useEffect, useRef } from 'react';

import { getItemImageUrl } from '/@/renderer/components/item-image/item-image';
import { getSongUrl } from '/@/renderer/features/player/audio-player/hooks/use-stream-url';
import { usePlayerEvents } from '/@/renderer/features/player/audio-player/hooks/use-player-events';
import { usePlayer } from '/@/renderer/features/player/context/player-context';
import { usePartyStoreActions } from '/@/renderer/features/party/party-store';
import { usePlayerStore, useSettingsStore } from '/@/renderer/store';
import { useTimestampStoreBase } from '/@/renderer/store/timestamp.store';
import { toast } from '/@/shared/components/toast/toast';
import { LibraryItem, QueueSong } from '/@/shared/types/domain-types';
import { PartyHostSnapshot, PartyTrack, defaultPartyTrackFields } from '/@/shared/types/party-types';
import { Play, PlayerStatus } from '/@/shared/types/types';

const party = window.api?.party ?? null;

const HOST_SNAPSHOT_THROTTLE_MS = 2000;

const videoIdFromSong = (song: QueueSong | undefined): null | string => {
    const metadata = (song as (QueueSong & { youtubeMusic?: { videoId?: string } }) | undefined)
        ?.youtubeMusic;
    const candidate =
        metadata?.videoId ||
        (song?.id?.startsWith('ytm:') ? song.id.slice(4) : undefined) ||
        song?.id;
    return candidate && /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : null;
};

const partyTrackIdFromSong = (song: QueueSong): string => {
    const videoId = videoIdFromSong(song);
    if (videoId) return `youtube:${videoId}`;
    return `host:${song._serverId}:${song._uniqueId || song.id}`;
};

const trackFromSong = async (song: QueueSong | undefined): Promise<null | PartyTrack> => {
    const videoId = videoIdFromSong(song);
    if (!song) return null;

    const artworkUrl =
        getItemImageUrl({
            id: song.id,
            imageUrl: song.imageUrl,
            itemType: LibraryItem.SONG,
            serverId: song._serverId,
            type: 'itemCard',
            useRemoteUrl: true,
        }) || song.imageUrl;

    let hostStreamUrl: string | undefined;
    try {
        hostStreamUrl = await getSongUrl(song, useSettingsStore.getState().playback.transcode, true);
    } catch {
        hostStreamUrl = undefined;
    }

    return {
        album: song.album,
        artist: song.artistName || 'Unknown artist',
        artworkUrl,
        durationMs: Number(song.duration || 0),
        hostStreamUrl,
        id: videoId ? `youtube:${videoId}` : `host:${song._serverId}:${song._uniqueId || song.id}`,
        source: videoId ? 'youtube' : 'host',
        title: song.name || 'Untitled',
        videoId: videoId || undefined,
        ...defaultPartyTrackFields(),
    };
};

const makeSnapshot = async (
    status?: PlayerStatus,
    positionSeconds?: number,
): Promise<PartyHostSnapshot> => {
    const state = usePlayerStore.getState();
    const queue = state.getQueueOrder();
    const current = state.getCurrentSong();
    const currentIndex = queue.items.findIndex((item) => item._uniqueId === current?._uniqueId);
    const upcoming = currentIndex >= 0 ? queue.items.slice(currentIndex + 1) : [];

    return {
        nowPlaying: await trackFromSong(current),
        playbackStatus: status || state.player.status,
        positionMs: Math.max(
            0,
            Math.round((positionSeconds ?? useTimestampStoreBase.getState().timestamp) * 1000),
        ),
        queue: (
            await Promise.all(upcoming.slice(0, 40).map((song) => trackFromSong(song)))
        ).filter((item): item is PartyTrack => Boolean(item)),
    };
};

const reorderQueueByPartyTrack = (trackId: string, toIndex: number) => {
    const state = usePlayerStore.getState();
    const queue = state.getQueueOrder();
    const current = state.getCurrentSong();
    const currentIndex = queue.items.findIndex((item) => item._uniqueId === current?._uniqueId);
    const upcoming = currentIndex >= 0 ? queue.items.slice(currentIndex + 1) : queue.items;

    const fromIndex = upcoming.findIndex((song) => partyTrackIdFromSong(song) === trackId);
    if (fromIndex < 0) return;

    const clampedToIndex = Math.max(0, Math.min(toIndex, upcoming.length - 1));
    if (fromIndex === clampedToIndex) return;

    const song = upcoming[fromIndex];
    const target = upcoming[clampedToIndex];
    const edge: 'bottom' | 'top' = fromIndex < clampedToIndex ? 'bottom' : 'top';
    state.moveSelectedTo([song], target._uniqueId, edge);
};

export const usePartyHost = () => {
    const player = usePlayer();
    const { setState } = usePartyStoreActions();
    const lastSentRef = useRef(0);

    useEffect(() => {
        if (!party) return;

        const offState = party.onState((_event, roomState) => setState(roomState));
        const offApproved = party.onSuggestionApproved((_event, data) => {
            player.addToQueueByData(
                [data.song],
                data.insertAtFront ? Play.NEXT : Play.LAST,
            );
            toast.success({ message: data.song.name, title: 'Party suggestion added' });
        });
        const offControl = party.onControlCommand((_event, data) => {
            if (data.action === 'seek' && typeof data.positionMs === 'number') {
                player.mediaSeekToTimestamp(data.positionMs / 1000);
                toast.info({
                    message: data.guestDisplayName,
                    title: 'Party guest seeked',
                });
                return;
            }

            if (data.action === 'skip') {
                player.mediaNext();
                toast.info({ message: data.guestDisplayName, title: 'Party guest skipped track' });
                return;
            }

            if (data.action === 'toggle_play') {
                player.mediaTogglePlayPause();
                toast.info({
                    message: data.guestDisplayName,
                    title: 'Party guest toggled playback',
                });
                return;
            }

            if (!data.song) return;
            player.addToQueueByData(
                [data.song],
                data.action === 'play_now' ? Play.NOW : Play.NEXT,
            );
            toast.success({
                message: data.song.name,
                title:
                    data.action === 'play_now'
                        ? `${data.guestDisplayName} changed the song`
                        : `${data.guestDisplayName} added next`,
            });
        });
        const offReorder = party.onReorderQueue((_event, data) => {
            reorderQueueByPartyTrack(data.trackId, data.toIndex);
            toast.info({
                message: data.guestDisplayName,
                title: 'Party guest reordered the queue',
            });
        });

        return () => {
            offState();
            offApproved();
            offControl();
            offReorder();
        };
    }, [player, setState]);

    const sendSnapshot = (snapshot?: Partial<PartyHostSnapshot>, immediate = false) => {
        const now = Date.now();
        if (!immediate && now - lastSentRef.current < HOST_SNAPSHOT_THROTTLE_MS) return;
        lastSentRef.current = now;
        makeSnapshot().then((baseSnapshot) => {
            party?.updateHostState({
                ...baseSnapshot,
                ...snapshot,
            });
        });
    };

    usePlayerEvents(
        {
            onCurrentSongChange: () => sendSnapshot({ positionMs: 0 }, true),
            onPlayerProgress: (properties) => {
                sendSnapshot({ positionMs: Math.max(0, Math.round(properties.timestamp * 1000)) });
            },
            onPlayerQueueChange: () => sendSnapshot(undefined, true),
            onPlayerStatus: (properties) => {
                sendSnapshot({ playbackStatus: properties.status }, true);
            },
        },
        [],
    );
};

export const PartyHostHook = () => {
    usePartyHost();
    return null;
};
