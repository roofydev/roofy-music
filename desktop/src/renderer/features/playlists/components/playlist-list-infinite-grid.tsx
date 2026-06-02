import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { useGridRows } from '/@/renderer/components/item-list/helpers/use-grid-rows';
import { useItemListScrollPersist } from '/@/renderer/components/item-list/helpers/use-item-list-scroll-persist';
import { ItemGridList } from '/@/renderer/components/item-list/item-grid-list/item-grid-list';
import { ItemListGridComponentProps } from '/@/renderer/components/item-list/types';
import { useListContext } from '/@/renderer/context/list-context';
import { playlistsQueries } from '/@/renderer/features/playlists/api/playlists-api';
import { useGeneralSettings } from '/@/renderer/store';
import {
    LibraryItem,
    PlaylistListQuery,
    PlaylistListSort,
    SortOrder,
} from '/@/shared/types/domain-types';
import { ItemListKey } from '/@/shared/types/types';

interface PlaylistListInfiniteGridProps extends ItemListGridComponentProps<PlaylistListQuery> {}

export const PlaylistListInfiniteGrid = ({
    gap = 'md',
    itemsPerRow,
    query = {
        sortBy: PlaylistListSort.NAME,
        sortOrder: SortOrder.ASC,
    },
    saveScrollOffset = true,
    serverId,
    size,
}: PlaylistListInfiniteGridProps) => {
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

    const rows = useGridRows(LibraryItem.PLAYLIST, ItemListKey.PLAYLIST, size);
    const { enableGridMultiSelect } = useGeneralSettings();

    return (
        <ItemGridList
            data={playlistItems}
            enableMultiSelect={enableGridMultiSelect}
            gap={gap}
            initialTop={{
                to: scrollOffset ?? 0,
                type: 'offset',
            }}
            itemsPerRow={itemsPerRow}
            itemType={LibraryItem.PLAYLIST}
            onScrollEnd={handleOnScrollEnd}
            rows={rows}
            size={size}
        />
    );
};
