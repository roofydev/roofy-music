import { useCallback, useMemo } from 'react';

import { FILTER_KEYS } from '/@/renderer/features/shared/utils';
import { filterOfflineSongs } from '/@/shared/product-ux/offline-songs';
import type { Song, SongListResponse } from '/@/shared/types/domain-types';

type SongListFn = (args: {
    apiClientProps: { serverId: string; signal?: AbortSignal };
    query: Record<string, unknown>;
}) => Promise<SongListResponse>;

export const useOfflineSongListQuery = (
    query: Record<string, unknown>,
    listQueryFn: SongListFn,
) => {
    const offlineOnly = Boolean(query[FILTER_KEYS.SONG.OFFLINE]);

    const adaptedListQueryFn = useCallback<SongListFn>(
        async (args) => {
            const response = await listQueryFn(args);
            if (!offlineOnly) {
                return response;
            }

            return {
                ...response,
                items: filterOfflineSongs(response.items as Song[]),
            };
        },
        [listQueryFn, offlineOnly],
    );

    return useMemo(
        () => ({
            adaptedListQueryFn,
            offlineOnly,
        }),
        [adaptedListQueryFn, offlineOnly],
    );
};
