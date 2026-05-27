import { useMemo, useState } from 'react';
import {
    ActionIcon,
    Badge,
    Button,
    Group,
    Select,
    Stack,
    Text,
} from '@mantine/core';
import { RiRefreshLine } from 'react-icons/ri';

import { PartyQueueRow } from '/@/renderer/features/party/components/party-queue-row';
import { usePlayer } from '/@/renderer/features/player/context/player-context';
import styles from '/@/renderer/features/party/party-dashboard.module.css';
import { usePartyRoomState } from '/@/renderer/features/party/party-store';
import {
    formatTrackDuration,
    partyTrackIdFromSong,
    sumQueueDurationMs,
} from '/@/renderer/features/party/utils/party-utils';
import { usePlayerStore } from '/@/renderer/store';
import { Play } from '/@/shared/types/types';

const party = window.api?.party ?? null;

type QueueSort = 'fifo' | 'priority';

const maxVotes = (tracks: { votes?: number }[]) =>
    Math.max(1, ...tracks.map((track) => track.votes || 0));

const findSongForTrack = (trackId: string) => {
    const state = usePlayerStore.getState();
    const queue = state.getQueueOrder();
    return queue.items.find((song) => partyTrackIdFromSong(song) === trackId);
};

export const PartyQueueColumn = () => {
    const state = usePartyRoomState();
    const player = usePlayer();
    const [sort, setSort] = useState<QueueSort>('fifo');
    const [pendingOpen, setPendingOpen] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);

    const pendingSuggestions = useMemo(
        () => state?.requestQueue.filter((item) => item.status === 'pending') || [],
        [state?.requestQueue],
    );

    const sortedQueue = useMemo(() => {
        const queue = [...(state?.queue || [])];
        if (sort === 'priority') {
            queue.sort((left, right) => (right.votes || 0) - (left.votes || 0));
        }
        return queue;
        // refreshKey forces manual refresh
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sort, state?.queue, refreshKey]);

    if (!state) return null;

    const voteMax = maxVotes(sortedQueue);
    const totalDuration = sumQueueDurationMs(sortedQueue);
    const reorderEnabled = sort === 'fifo';

    const playTrackNow = (trackId: string) => {
        const song = findSongForTrack(trackId);
        if (song) player.addToQueueByData([song], Play.NOW);
    };

    const removeTrack = (trackId: string) => {
        const song = findSongForTrack(trackId);
        if (song) player.clearSelected([song]);
    };

    const moveTrackToTop = (trackId: string) => {
        const song = findSongForTrack(trackId);
        if (song) player.moveSelectedToTop([song]);
    };

    return (
        <div className={styles.partyColumn}>
            <div className={styles.partyColumnHeader}>
                <span>Request queue</span>
                <Group gap="xs">
                    <ActionIcon onClick={() => setRefreshKey((value) => value + 1)} size="sm" variant="subtle">
                        <RiRefreshLine />
                    </ActionIcon>
                    <Select
                        comboboxProps={{ withinPortal: true }}
                        data={[
                            { label: 'Queue order', value: 'fifo' },
                            { label: 'Sort: Priority', value: 'priority' },
                        ]}
                        onChange={(value) => setSort((value as QueueSort) || 'fifo')}
                        size="xs"
                        value={sort}
                        w={140}
                    />
                </Group>
            </div>

            <div className={styles.partyColumnScroll}>
                <table className={styles.partyQueueTable}>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Track</th>
                            <th>Artist</th>
                            <th>Duration</th>
                            <th>Votes</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedQueue.length ? (
                            sortedQueue.map((track, index) => (
                                <PartyQueueRow
                                    index={index}
                                    key={track.id}
                                    onMoveToTop={moveTrackToTop}
                                    onPlay={playTrackNow}
                                    onRemove={removeTrack}
                                    reorderEnabled={reorderEnabled}
                                    track={track}
                                    voteMax={voteMax}
                                />
                            ))
                        ) : (
                            <tr>
                                <td colSpan={6}>
                                    <Text c="dimmed" py="md" size="sm">
                                        Queue is empty. Add songs from your library or approve guest requests.
                                    </Text>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>

                {pendingSuggestions.length > 0 && (
                    <Stack gap="xs" mt="md">
                        <Button onClick={() => setPendingOpen((value) => !value)} size="compact-xs" variant="subtle">
                            Pending requests ({pendingSuggestions.length})
                        </Button>
                        {pendingOpen &&
                            pendingSuggestions.map((suggestion) => (
                                <Stack gap={4} key={suggestion.id} mb="sm">
                                    <Group justify="space-between" wrap="nowrap">
                                        <div style={{ minWidth: 0 }}>
                                            <Text lineClamp={1} size="sm">
                                                {suggestion.track?.title || suggestion.query}
                                            </Text>
                                            <Text c="dimmed" lineClamp={1} size="xs">
                                                by {suggestion.guestDisplayName}
                                            </Text>
                                        </div>
                                        <Badge color="yellow" variant="light">
                                            pending
                                        </Badge>
                                    </Group>
                                    <Group gap="xs">
                                        <Button
                                            disabled={!suggestion.track}
                                            onClick={() => party?.approveSuggestionNext(suggestion.id)}
                                            size="compact-xs"
                                        >
                                            Play next
                                        </Button>
                                        <Button
                                            disabled={!suggestion.track}
                                            onClick={() => party?.approveSuggestion(suggestion.id)}
                                            size="compact-xs"
                                            variant="light"
                                        >
                                            Add to queue
                                        </Button>
                                        <Button
                                            color="red"
                                            onClick={() => party?.rejectSuggestion(suggestion.id)}
                                            size="compact-xs"
                                            variant="subtle"
                                        >
                                            Reject
                                        </Button>
                                    </Group>
                                </Stack>
                            ))}
                    </Stack>
                )}
            </div>

            <div className={styles.partyColumnFooter}>
                <Group justify="space-between">
                    <span>
                        Up next: {sortedQueue.length} songs · {formatTrackDuration(totalDuration)}
                    </span>
                    <span>Total requests: {state.requestQueue.length}</span>
                </Group>
            </div>
        </div>
    );
};
