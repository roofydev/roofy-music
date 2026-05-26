import { useSuspenseQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Suspense, useCallback, useMemo, useRef } from 'react';

import styles from './expanded-playlist-list-item.module.css';

import { useItemImageUrl } from '/@/renderer/components/item-image/item-image';
import { getDraggedItems } from '/@/renderer/components/item-list/helpers/get-dragged-items';
import { useDefaultItemListControls } from '/@/renderer/components/item-list/helpers/item-list-controls';
import {
    ItemListStateActions,
    ItemListStateItem,
    useItemDraggingState,
    useItemListState,
    useItemSelectionState,
} from '/@/renderer/components/item-list/helpers/item-list-state';
import { playlistsQueries } from '/@/renderer/features/playlists/api/playlists-api';
import { usePlayer } from '/@/renderer/features/player/context/player-context';
import { PlayButtonGroup } from '/@/renderer/features/shared/components/play-button-group';
import { useDragDrop } from '/@/renderer/hooks/use-drag-drop';
import { useSetGlobalExpanded } from '/@/renderer/store';
import { formatDurationString } from '/@/renderer/utils';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Group } from '/@/shared/components/group/group';
import { Image } from '/@/shared/components/image/image';
import { ScrollArea } from '/@/shared/components/scroll-area/scroll-area';
import { Separator } from '/@/shared/components/separator/separator';
import { Spinner } from '/@/shared/components/spinner/spinner';
import { Text } from '/@/shared/components/text/text';
import { useMergedRef } from '/@/shared/hooks/use-merged-ref';
import { LibraryItem, Song } from '/@/shared/types/domain-types';
import { DragOperation, DragTarget, DragTargetMap } from '/@/shared/types/drag-and-drop';
import { Play } from '/@/shared/types/types';

interface TrackRowProps {
    controls: ReturnType<typeof useDefaultItemListControls>;
    index: number;
    internalState: ItemListStateActions;
    player: ReturnType<typeof usePlayer>;
    song: Song;
    songs: Song[];
}

const CloseExpandedButton = () => {
    const setGlobalExpanded = useSetGlobalExpanded();
    return (
        <ActionIcon
            className={styles.closeButton}
            icon="x"
            iconProps={{ size: 'lg' }}
            onClick={() => setGlobalExpanded(null)}
            size="xs"
            variant="subtle"
        />
    );
};

const TrackRow = ({ controls, index, internalState, player, song, songs }: TrackRowProps) => {
    const rowId = internalState.extractRowId(song);
    const isSelected = useItemSelectionState(internalState, rowId);
    const isDraggingState = useItemDraggingState(internalState, rowId);

    const {
        isDraggedOver,
        isDragging: isDraggingLocal,
        ref: dragRef,
    } = useDragDrop<HTMLDivElement>({
        drag: {
            getId: () => {
                const draggedItems = getDraggedItems(song, internalState);
                return draggedItems.map((draggedItem) => draggedItem.id);
            },
            getItem: () => {
                const draggedItems = getDraggedItems(song, internalState);
                return draggedItems;
            },
            itemType: LibraryItem.SONG,
            onDragStart: () => {
                const draggedItems = getDraggedItems(song, internalState);
                internalState.setDragging(draggedItems);
            },
            onDrop: () => {
                internalState.setDragging([]);
            },
            operation: [DragOperation.ADD],
            target: DragTargetMap[LibraryItem.SONG] || DragTarget.GENERIC,
        },
        isEnabled: true,
    });

    const isDragging = isDraggingState || isDraggingLocal;

    const containerRef = useRef<HTMLDivElement>(null);
    const mergedRef = useMergedRef(containerRef, dragRef);

    const handleDoubleClick = useCallback(() => {
        if (songs && song.id) {
            player.addToQueueByData(songs, Play.NOW, song.id);
        }
    }, [player, songs, song.id]);

    return (
        <div
            className={clsx(styles.trackRow, {
                [styles.dragging]: isDragging,
                [styles.rowSelected]: isSelected,
                [styles.draggedOverTop]: isDraggedOver === 'top',
                [styles.draggedOverBottom]: isDraggedOver === 'bottom',
            })}
            onClick={(e) =>
                controls.onClick?.({
                    event: e,
                    internalState,
                    item: song,
                    itemType: LibraryItem.SONG,
                })
            }
            onDoubleClick={handleDoubleClick}
            ref={mergedRef}
        >
            <Text className={styles.trackIndex} size="sm">
                {index + 1}
            </Text>
            <Text className={styles.trackName} size="sm">
                {song.name}
            </Text>
            <Text className={styles.trackArtist} size="sm">
                {song.artistName}
            </Text>
            <Text className={styles.trackDuration} size="sm">
                {formatDurationString(song.duration)}
            </Text>
        </div>
    );
};

interface PlaylistTracksProps {
    songs?: Song[];
}

const PlaylistTracks = ({ songs }: PlaylistTracksProps) => {
    const getDataFn = useCallback(() => songs || [], [songs]);

    const extractRowId = useCallback((item: unknown) => {
        if (item && typeof item === 'object' && 'id' in item) {
            return (item as { id: string }).id;
        }
        return undefined;
    }, []);

    const internalState = useItemListState(getDataFn, extractRowId);
    const controls = useDefaultItemListControls();
    const player = usePlayer();

    return (
        <div className={styles.tracks}>
            <ScrollArea>
                <div className={styles.tracksList}>
                    {songs?.map((song, index) => (
                        <TrackRow
                            controls={controls}
                            index={index}
                            internalState={internalState}
                            key={song.id}
                            player={player}
                            song={song}
                            songs={songs}
                        />
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
};

interface ExpandedPlaylistListItemContentProps {
    imageId: string | null | undefined;
    name: string;
    songCount?: number | null;
    songs?: Song[] | null;
    totalDuration?: number | null;
}

const ExpandedPlaylistListItemContent = ({
    imageId,
    name,
    songCount,
    songs,
    totalDuration,
}: ExpandedPlaylistListItemContentProps) => {
    const player = usePlayer();

    const imageUrl = useItemImageUrl({
        id: imageId || undefined,
        itemType: LibraryItem.PLAYLIST,
        type: 'itemCard',
    });

    const handlePlay = useCallback(
        (playType: Play) => {
            if (songs?.length) {
                player.addToQueueByData(songs, playType);
            }
        },
        [songs, player],
    );

    const subtitleParts = useMemo(() => {
        const parts: string[] = [];
        if (songCount != null) {
            parts.push(`${songCount} song${songCount === 1 ? '' : 's'}`);
        }
        if (totalDuration != null && totalDuration > 0) {
            parts.push(formatDurationString(totalDuration));
        }
        return parts;
    }, [songCount, totalDuration]);

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <Image className={styles.image} src={imageUrl} />
                <div className={styles.meta}>
                    <Text className={styles.name} fw={600} size="md">
                        {name}
                    </Text>
                    <Group className={styles.subtitle} gap="xs">
                        {subtitleParts.map((part, i) => (
                            <Group gap="xs" key={i}>
                                <Text size="sm">{part}</Text>
                                {i < subtitleParts.length - 1 && <Separator />}
                            </Group>
                        ))}
                    </Group>
                </div>
                <div className={styles.actions}>
                    {songs && songs.length > 0 && (
                        <PlayButtonGroup onPlay={handlePlay} />
                    )}
                    <CloseExpandedButton />
                </div>
            </div>
            <PlaylistTracks songs={songs ?? undefined} />
        </div>
    );
};

export const ExpandedPlaylistListItem = ({ item }: { item: ItemListStateItem }) => {
    const playlistItem = item as unknown as {
        _serverId: string;
        duration?: number | null;
        id: string;
        imageId?: string | null;
        name?: string;
        songCount?: number | null;
    };

    const serverId = playlistItem._serverId;
    const playlistId = playlistItem.id;

    const detailQuery = useSuspenseQuery({
        ...playlistsQueries.detail({ query: { id: playlistId }, serverId }),
    });

    const songsQuery = useSuspenseQuery({
        ...playlistsQueries.songList({ query: { id: playlistId }, serverId }),
    });

    const name = playlistItem.name ?? detailQuery.data?.name ?? '';
    const songCount = playlistItem.songCount ?? detailQuery.data?.songCount ?? null;
    const totalDuration = playlistItem.duration ?? detailQuery.data?.duration ?? null;
    const imageId = playlistItem.imageId ?? detailQuery.data?.imageId ?? null;
    const songs = songsQuery.data?.items ?? null;

    return (
        <Suspense fallback={<Spinner container />}>
            <ExpandedPlaylistListItemContent
                imageId={imageId}
                name={name}
                songCount={songCount}
                songs={songs}
                totalDuration={totalDuration}
            />
        </Suspense>
    );
};
