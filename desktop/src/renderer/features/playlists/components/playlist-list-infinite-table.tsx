import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { useItemListColumnReorder } from '/@/renderer/components/item-list/helpers/use-item-list-column-reorder';
import { useItemListColumnResize } from '/@/renderer/components/item-list/helpers/use-item-list-column-resize';
import { useItemListScrollPersist } from '/@/renderer/components/item-list/helpers/use-item-list-scroll-persist';
import { ItemTableList } from '/@/renderer/components/item-list/item-table-list/item-table-list';
import { ItemTableListColumn } from '/@/renderer/components/item-list/item-table-list/item-table-list-column';
import { ItemListTableComponentProps } from '/@/renderer/components/item-list/types';
import { useListContext } from '/@/renderer/context/list-context';
import { playlistsQueries } from '/@/renderer/features/playlists/api/playlists-api';
import {
    LibraryItem,
    PlaylistListQuery,
    PlaylistListSort,
    SortOrder,
} from '/@/shared/types/domain-types';
import { ItemListKey } from '/@/shared/types/types';

interface PlaylistListInfiniteTableProps extends ItemListTableComponentProps<PlaylistListQuery> {}

export const PlaylistListInfiniteTable = ({
    autoFitColumns = false,
    columns,
    enableAlternateRowColors = false,
    enableHeader = true,
    enableHorizontalBorders = false,
    enableRowHoverHighlight = true,
    enableSelection = true,
    enableVerticalBorders = false,
    query = {
        sortBy: PlaylistListSort.NAME,
        sortOrder: SortOrder.ASC,
    },
    saveScrollOffset = true,
    serverId,
    size = 'default',
}: PlaylistListInfiniteTableProps) => {
    const playlistQuery = useMemo(
        () => ({
            ...query,
            limit: 10000,
            startIndex: 0,
        }),
        [query],
    );

    const playlistsQuery = useQuery(
        playlistsQueries.list({
            query: playlistQuery,
            serverId,
        }),
    );

    const playlistItems = playlistsQuery.data?.items ?? [];
    const itemCount = playlistsQuery.data?.totalRecordCount ?? playlistItems.length;
    const { setItemCount } = useListContext();

    useEffect(() => {
        if (!playlistsQuery.data) {
            return;
        }

        setItemCount?.(itemCount);
    }, [itemCount, playlistsQuery.data, setItemCount]);

    const { handleOnScrollEnd, scrollOffset } = useItemListScrollPersist({
        enabled: saveScrollOffset,
    });

    const { handleColumnReordered } = useItemListColumnReorder({
        itemListKey: ItemListKey.PLAYLIST,
    });

    const { handleColumnResized } = useItemListColumnResize({
        itemListKey: ItemListKey.PLAYLIST,
    });

    return (
        <ItemTableList
            autoFitColumns={autoFitColumns}
            CellComponent={ItemTableListColumn}
            columns={columns}
            data={playlistItems}
            enableAlternateRowColors={enableAlternateRowColors}
            enableHeader={enableHeader}
            enableHorizontalBorders={enableHorizontalBorders}
            enableRowHoverHighlight={enableRowHoverHighlight}
            enableSelection={enableSelection}
            enableVerticalBorders={enableVerticalBorders}
            initialTop={{
                to: scrollOffset ?? 0,
                type: 'offset',
            }}
            itemType={LibraryItem.PLAYLIST}
            onColumnReordered={handleColumnReordered}
            onColumnResized={handleColumnResized}
            onScrollEnd={handleOnScrollEnd}
            size={size}
        />
    );
};
