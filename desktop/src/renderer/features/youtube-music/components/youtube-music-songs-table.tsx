import { useMemo } from 'react';

import {
    pickTableColumns,
    SONG_TABLE_COLUMNS,
} from '/@/renderer/components/item-list/item-table-list/default-columns';
import { ItemTableList } from '/@/renderer/components/item-list/item-table-list/item-table-list';
import { ItemTableListColumn } from '/@/renderer/components/item-list/item-table-list/item-table-list-column';
import { ItemControls } from '/@/renderer/components/item-list/types';
import { usePlayer } from '/@/renderer/features/player/context/player-context';
import { LibraryItem, Song } from '/@/shared/types/domain-types';
import { Play, TableColumn } from '/@/shared/types/types';

interface YoutubeMusicSongsTableProps {
    songs: Song[];
}

export const YoutubeMusicSongsTable = ({ songs }: YoutubeMusicSongsTableProps) => {
    const player = usePlayer();

    const columns = useMemo(
        () =>
            pickTableColumns({
                columns: SONG_TABLE_COLUMNS,
                enabledColumns: [
                    TableColumn.ROW_INDEX,
                    TableColumn.TITLE_COMBINED,
                    TableColumn.DURATION,
                    TableColumn.ALBUM,
                    TableColumn.ARTIST,
                    TableColumn.ACTIONS,
                ],
            }),
        [],
    );

    const overrideControls: Partial<ItemControls> = useMemo(
        () => ({
            onDoubleClick: ({ index, internalState, item, meta }) => {
                if (!item) {
                    return;
                }

                const playType = (meta?.playType as Play) || Play.NOW;
                const items = internalState?.getData() as Song[];

                if (index !== undefined && index >= 0) {
                    player.addToQueueByData(items, playType, item.id);
                }
            },
        }),
        [player],
    );

    if (columns.length === 0) {
        return null;
    }

    return (
        <ItemTableList
            CellComponent={ItemTableListColumn}
            columns={columns}
            data={songs}
            enableDrag={false}
            enableEntranceAnimation={false}
            enableExpansion={false}
            enableHeader
            enableRowHoverHighlight
            enableSelection={false}
            enableStickyHeader
            itemType={LibraryItem.SONG}
            overrideControls={overrideControls}
            size="default"
        />
    );
};
