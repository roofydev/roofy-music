import clsx from 'clsx';
import {
    ActionIcon,
    Group,
    Menu,
    Text,
} from '@mantine/core';
import { RiDraggable, RiMore2Fill, RiPlayFill } from 'react-icons/ri';

import { usePlayer } from '/@/renderer/features/player/context/player-context';
import styles from '/@/renderer/features/party/party-dashboard.module.css';
import {
    formatTrackDuration,
    partyTrackIdFromSong,
} from '/@/renderer/features/party/utils/party-utils';
import { useDragDrop } from '/@/renderer/hooks/use-drag-drop';
import { usePlayerStore } from '/@/renderer/store';
import { LibraryItem, QueueSong } from '/@/shared/types/domain-types';
import { DragOperation, DragTarget } from '/@/shared/types/drag-and-drop';
import { PartyTrack } from '/@/shared/types/party-types';

const findSongForTrack = (trackId: string): QueueSong | undefined => {
    const state = usePlayerStore.getState();
    const queue = state.getQueueOrder();
    return queue.items.find((song) => partyTrackIdFromSong(song) === trackId);
};

interface PartyQueueRowProps {
    index: number;
    onPlay: (trackId: string) => void;
    onRemove: (trackId: string) => void;
    onMoveToTop: (trackId: string) => void;
    reorderEnabled: boolean;
    track: PartyTrack;
    voteMax: number;
}

export const PartyQueueRow = ({
    index,
    onMoveToTop,
    onPlay,
    onRemove,
    reorderEnabled,
    track,
    voteMax,
}: PartyQueueRowProps) => {
    const player = usePlayer();
    const song = findSongForTrack(track.id);

    const { isDraggedOver, ref: dropRef } = useDragDrop<HTMLTableRowElement>({
        drop: {
            canDrop: ({ source }) =>
                reorderEnabled &&
                source.type === DragTarget.QUEUE_SONG &&
                source.itemType === LibraryItem.QUEUE_SONG,
            getData: () => ({
                id: [track.id],
                item: song ? [song] : [],
                itemType: LibraryItem.QUEUE_SONG,
                type: DragTarget.QUEUE_SONG,
            }),
            onDrag: () => undefined,
            onDragLeave: () => undefined,
            onDrop: ({ edge, source }) => {
                if (!reorderEnabled || !edge || !song) return;

                const sourceItems = (source.item || []) as QueueSong[];
                if (!sourceItems.length) return;

                const sourceTrackId = partyTrackIdFromSong(sourceItems[0]);
                if (sourceTrackId === track.id) return;

                player.moveSelectedTo(sourceItems, edge, song._uniqueId);
            },
        },
        isEnabled: reorderEnabled && Boolean(song),
    });

    const { isDragging, ref: dragHandleRef } = useDragDrop<HTMLButtonElement>({
        drag: {
            getId: () => [track.id],
            getItem: () => (song ? [song] : []),
            itemType: LibraryItem.QUEUE_SONG,
            metadata: { fromPartyQueue: true },
            operation: [DragOperation.REORDER],
            target: DragTarget.QUEUE_SONG,
        },
        isEnabled: reorderEnabled && Boolean(song),
    });

    const rowRef = dropRef;

    return (
        <tr
            className={clsx(
                styles.partyQueueRow,
                isDragging && styles.partyQueueRowDragging,
                isDraggedOver === 'top' && styles.partyQueueRowOverTop,
                isDraggedOver === 'bottom' && styles.partyQueueRowOverBottom,
            )}
            ref={rowRef}
        >
            <td className={styles.partyQueueIndexCell}>
                <div className={styles.partyQueueIndexInner}>
                    <button
                        aria-label={`Reorder ${track.title}`}
                        className={clsx(
                            styles.partyQueueDragHandle,
                            !reorderEnabled && styles.partyQueueDragHandleDisabled,
                        )}
                        disabled={!reorderEnabled}
                        ref={dragHandleRef}
                        title={
                            reorderEnabled
                                ? 'Drag to reorder'
                                : 'Switch to queue order to drag items'
                        }
                        type="button"
                    >
                        <RiDraggable />
                    </button>
                    <span>{index + 1}</span>
                </div>
            </td>
            <td>
                <div className={styles.partyTrackCell}>
                    {track.artworkUrl ? (
                        <img
                            alt=""
                            className={styles.partyTrackThumb}
                            src={track.artworkUrl}
                        />
                    ) : (
                        <div className={styles.partyTrackThumb} />
                    )}
                    <div style={{ minWidth: 0 }}>
                        <Text lineClamp={1} size="sm">
                            {track.title}
                        </Text>
                        {track.suggestedBy && (
                            <Text c="dimmed" lineClamp={1} size="xs">
                                by {track.suggestedBy}
                            </Text>
                        )}
                    </div>
                </div>
            </td>
            <td>
                <Text lineClamp={1} size="xs">
                    {track.artist}
                </Text>
                {track.album && (
                    <Text c="dimmed" lineClamp={1} size="xs">
                        {track.album}
                    </Text>
                )}
            </td>
            <td>{formatTrackDuration(track.durationMs)}</td>
            <td>
                <div className={styles.partyVoteBar}>
                    <div
                        className={styles.partyVoteFill}
                        style={{
                            width: `${Math.round(((track.votes || 0) / voteMax) * 100)}%`,
                        }}
                    />
                </div>
                <Text c="dimmed" size="xs">
                    {track.votes || 0}
                </Text>
            </td>
            <td>
                <Group gap={4} wrap="nowrap">
                    <ActionIcon onClick={() => onPlay(track.id)} size="sm" variant="subtle">
                        <RiPlayFill />
                    </ActionIcon>
                    <Menu position="bottom-end" withinPortal>
                        <Menu.Target>
                            <ActionIcon size="sm" variant="subtle">
                                <RiMore2Fill />
                            </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Item onClick={() => onMoveToTop(track.id)}>Move to top</Menu.Item>
                            <Menu.Item color="red" onClick={() => onRemove(track.id)}>
                                Remove
                            </Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
                </Group>
            </td>
        </tr>
    );
};
