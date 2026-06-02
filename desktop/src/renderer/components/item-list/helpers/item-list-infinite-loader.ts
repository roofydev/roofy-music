import {
    useMutation,
    useQueryClient,
    useSuspenseQuery,
    UseSuspenseQueryOptions,
} from '@tanstack/react-query';
import throttle from 'lodash/throttle';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { queryKeys } from '/@/renderer/api/query-keys';
import { useListContext } from '/@/renderer/context/list-context';
import { eventEmitter } from '/@/renderer/events/event-emitter';
import { UserFavoriteEventPayload, UserRatingEventPayload } from '/@/renderer/events/events';
import { getListRefreshMutationKey } from '/@/renderer/features/shared/components/list-refresh-button';
import { LibraryItem } from '/@/shared/types/domain-types';

export const getListQueryKeyName = (itemType: LibraryItem): string => {
    switch (itemType) {
        case LibraryItem.ALBUM:
            return 'albums';
        case LibraryItem.ALBUM_ARTIST:
            return 'albumArtists';
        case LibraryItem.ARTIST:
            return 'artists';
        case LibraryItem.GENRE:
            return 'genres';
        case LibraryItem.PLAYLIST:
            return 'playlists';
        case LibraryItem.SONG:
            return 'songs';
        default:
            return 'albums';
    }
};

type InfiniteLoaderCacheData = {
    dataMap: Map<number, unknown>;
    idToIndexMap: Map<string, number>;
    pagesLoaded: Record<string, boolean>;
    version: number;
};

interface UseItemListInfiniteLoaderProps {
    eventKey: string;
    fetchThreshold?: number;
    itemsPerPage: number;
    itemType: LibraryItem;
    listCountQuery: UseSuspenseQueryOptions<number, Error, number, readonly unknown[]>;
    listQueryFn: (args: { apiClientProps: any; query: any }) => Promise<{ items: unknown[] }>;
    query: Record<string, any>;
    serverId: string;
}

function getInitialData(): InfiniteLoaderCacheData {
    return {
        dataMap: new Map(),
        idToIndexMap: new Map(),
        pagesLoaded: {},
        version: 0,
    };
}

const resolveLoaderData = (oldData: InfiniteLoaderCacheData | undefined): InfiniteLoaderCacheData =>
    oldData ?? getInitialData();

export const infiniteLoaderDataQueryKey = (
    serverId: string,
    itemType: LibraryItem,
    query?: Record<string, any>,
) => {
    if (query) {
        return [serverId, 'item-list-infinite-loader', itemType, query];
    }

    return [serverId, 'item-list-infinite-loader', itemType];
};

export const useItemListInfiniteLoader = ({
    eventKey,
    fetchThreshold = 0.5,
    itemsPerPage = 100,
    itemType,
    listCountQuery,
    listQueryFn,
    query = {},
    serverId,
}: UseItemListInfiniteLoaderProps) => {
    const queryClient = useQueryClient();
    const lastFetchedPageRef = useRef<number>(-1);
    const currentVisibleRangeRef = useRef<null | { startIndex: number; stopIndex: number }>(null);
    const [isRefetching, setIsRefetching] = useState(false);
    const refetchPromiseRef = useRef<null | Promise<void>>(null);
    const previousDataQueryKeyRef = useRef<string>('');
    const isRefetchingRef = useRef<boolean>(false);

    const { data: totalItemCount } = useSuspenseQuery<number, any, number, any>(listCountQuery);

    const { setItemCount } = useListContext();

    useEffect(() => {
        if (totalItemCount == null || !setItemCount) {
            return;
        }

        setItemCount(totalItemCount);
    }, [setItemCount, totalItemCount]);

    const dataQueryKey = useMemo(
        () => [serverId, 'item-list-infinite-loader', itemType, query],
        [serverId, itemType, query],
    );

    const dataQueryKeyHash = useMemo(() => JSON.stringify(dataQueryKey), [dataQueryKey]);

    const [loaderData, setLoaderData] = useState<InfiniteLoaderCacheData>(() =>
        resolveLoaderData(queryClient.getQueryData<InfiniteLoaderCacheData>(dataQueryKey)),
    );

    const writeLoaderData = useCallback(
        (updater: (base: InfiniteLoaderCacheData) => InfiniteLoaderCacheData) => {
            setLoaderData((prev) => {
                const next = updater(resolveLoaderData(prev));
                queryClient.setQueryData(dataQueryKey, next);
                return next;
            });
        },
        [dataQueryKey, queryClient],
    );

    const fetchPage = useCallback(
        async (pageNumber: number) => {
            const startIndex = pageNumber * itemsPerPage;
            const queryParams = {
                limit: itemsPerPage,
                startIndex,
                ...query,
            };

            const result = await queryClient.fetchQuery({
                queryFn: async ({ signal }) => {
                    const result = await listQueryFn({
                        apiClientProps: { serverId, signal },
                        query: queryParams,
                    });

                    return result;
                },
                queryKey: queryKeys[getListQueryKeyName(itemType)].list(serverId, queryParams),
            });

            writeLoaderData((base) => {
                const nextDataMap = new Map(base.dataMap);
                const nextIdToIndexMap = new Map(base.idToIndexMap);

                for (const [offset, item] of (result.items ?? []).entries()) {
                    const index = startIndex + offset;
                    nextDataMap.set(index, item);
                    if (item && typeof item === 'object' && 'id' in (item as any)) {
                        const id = String((item as any).id);
                        nextIdToIndexMap.set(id, index);
                    }
                }

                return {
                    dataMap: nextDataMap,
                    idToIndexMap: nextIdToIndexMap,
                    pagesLoaded: { ...base.pagesLoaded, [pageNumber]: true },
                    version: base.version + 1,
                };
            });

            lastFetchedPageRef.current = Math.max(lastFetchedPageRef.current, pageNumber);
        },
        [itemsPerPage, query, queryClient, serverId, listQueryFn, itemType, writeLoaderData],
    );

    // Reset the loaded pages and refetch current page when the query changes
    useEffect(() => {
        const currentDataQueryKey = dataQueryKeyHash;

        if (previousDataQueryKeyRef.current === currentDataQueryKey || isRefetchingRef.current) {
            return;
        }

        previousDataQueryKeyRef.current = currentDataQueryKey;
        isRefetchingRef.current = true;

        const visibleRange = currentVisibleRangeRef.current;

        let pageToFetch = 0;
        if (visibleRange) {
            pageToFetch = Math.floor(visibleRange.startIndex / itemsPerPage);
        }

        const countQueryKey = listCountQuery.queryKey;

        setIsRefetching(true);
        const refetchPromise = (async () => {
            try {
                writeLoaderData((base) => ({
                    ...base,
                    dataMap: new Map(),
                    idToIndexMap: new Map(),
                    pagesLoaded: {},
                    version: base.version + 1,
                }));

                lastFetchedPageRef.current = -1;
                currentVisibleRangeRef.current = null;

                await queryClient.ensureQueryData({
                    queryKey: countQueryKey,
                });

                await fetchPage(pageToFetch);
            } finally {
                setIsRefetching(false);
                isRefetchingRef.current = false;
                refetchPromiseRef.current = null;
            }
        })();

        refetchPromiseRef.current = refetchPromise;

        refetchPromise.catch(() => {
            setIsRefetching(false);
            isRefetchingRef.current = false;
            refetchPromiseRef.current = null;
        });

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dataQueryKeyHash, queryClient, fetchPage, itemsPerPage]);

    // Suspend if refetching
    if (isRefetching && refetchPromiseRef.current) {
        throw refetchPromiseRef.current;
    }

    const onRangeChangedBase = useCallback(
        async (range: { startIndex: number; stopIndex: number }) => {
            currentVisibleRangeRef.current = range;

            const pageNumber = Math.floor(range.startIndex / itemsPerPage);

            const currentData =
                queryClient.getQueryData<InfiniteLoaderCacheData>(dataQueryKey) ?? loaderData;

            const startPageBoundary = pageNumber * itemsPerPage;
            const endPageBoundary = (pageNumber + 1) * itemsPerPage;

            const distanceFromStartBoundary = range.startIndex - startPageBoundary;
            const distanceToEndBoundary = endPageBoundary - range.stopIndex;

            const thresholdDistance = Math.floor(itemsPerPage * fetchThreshold);

            const isCurrentPageLoaded = currentData?.pagesLoaded[pageNumber] ?? false;

            if (!isCurrentPageLoaded) {
                await fetchPage(pageNumber);
            }

            if (isCurrentPageLoaded) {
                if (
                    distanceFromStartBoundary <= thresholdDistance &&
                    pageNumber > 0 &&
                    !currentData?.pagesLoaded[pageNumber - 1]
                ) {
                    await fetchPage(pageNumber - 1);
                }

                if (
                    distanceToEndBoundary <= thresholdDistance &&
                    !currentData?.pagesLoaded[pageNumber + 1]
                ) {
                    await fetchPage(pageNumber + 1);
                }
            }
        },
        [itemsPerPage, fetchThreshold, queryClient, dataQueryKey, fetchPage, loaderData],
    );

    const onRangeChanged = useMemo(
        () =>
            throttle(onRangeChangedBase, 150, {
                leading: true,
                trailing: true,
            }),
        [onRangeChangedBase],
    );

    const refreshMutation = useMutation({
        mutationFn: async (force?: boolean) => {
            queryClient.invalidateQueries();

            const currentData = queryClient.getQueryData<InfiniteLoaderCacheData>(dataQueryKey);

            if (force || currentData) {
                writeLoaderData((base) => ({
                    ...base,
                    dataMap: new Map(),
                    idToIndexMap: new Map(),
                    pagesLoaded: {},
                    version: base.version + 1,
                }));
                lastFetchedPageRef.current = -1;
            }

            let pageToFetch = 0;
            if (currentVisibleRangeRef.current) {
                pageToFetch = Math.floor(currentVisibleRangeRef.current.startIndex / itemsPerPage);
            } else if (lastFetchedPageRef.current >= 0) {
                pageToFetch = lastFetchedPageRef.current;
            }

            await fetchPage(pageToFetch);

            const startIndex = pageToFetch * itemsPerPage;
            const stopIndex = Math.min((pageToFetch + 1) * itemsPerPage, totalItemCount);

            await onRangeChangedBase({
                startIndex,
                stopIndex,
            });
        },
        mutationKey: getListRefreshMutationKey(eventKey),
    });

    const refreshMutationRef = useRef(refreshMutation);
    refreshMutationRef.current = refreshMutation;

    const refresh = useCallback(
        async (force?: boolean) => refreshMutationRef.current.mutateAsync(force),
        [],
    );

    const updateItems = useCallback(
        (indexes: number[], value: object) => {
            writeLoaderData((base) => {
                const nextDataMap = new Map(base.dataMap);

                indexes.forEach((index) => {
                    const existing = nextDataMap.get(index);
                    if (!existing || typeof existing !== 'object') {
                        return;
                    }
                    nextDataMap.set(index, { ...(existing as any), ...(value as any) });
                });

                return {
                    ...base,
                    dataMap: nextDataMap,
                    version: base.version + 1,
                };
            });
        },
        [writeLoaderData],
    );

    useEffect(() => {
        const handleRefresh = (payload: { key: string }) => {
            if (!eventKey || eventKey !== payload.key) {
                return;
            }

            refreshMutationRef.current.mutate(true);
        };

        eventEmitter.on('ITEM_LIST_REFRESH', handleRefresh);

        return () => {
            eventEmitter.off('ITEM_LIST_REFRESH', handleRefresh);
        };
    }, [eventKey]);

    useEffect(() => {
        const handleFavorite = (payload: UserFavoriteEventPayload) => {
            if (payload.itemType !== itemType || payload.serverId !== serverId) {
                return;
            }

            const dataIndexes = payload.id
                .map((id: string) => loaderData.idToIndexMap?.get(id))
                .filter((idx): idx is number => typeof idx === 'number');

            if (dataIndexes.length === 0) {
                return;
            }

            return updateItems(dataIndexes, { userFavorite: payload.favorite });
        };

        const handleRating = (payload: UserRatingEventPayload) => {
            if (payload.itemType !== itemType || payload.serverId !== serverId) {
                return;
            }

            const dataIndexes = payload.id
                .map((id: string) => loaderData.idToIndexMap?.get(id))
                .filter((idx): idx is number => typeof idx === 'number');

            if (dataIndexes.length === 0) {
                return;
            }

            return updateItems(dataIndexes, { userRating: payload.rating });
        };

        eventEmitter.on('USER_FAVORITE', handleFavorite);
        eventEmitter.on('USER_RATING', handleRating);

        return () => {
            eventEmitter.off('USER_FAVORITE', handleFavorite);
            eventEmitter.off('USER_RATING', handleRating);
        };
    }, [loaderData, eventKey, itemType, serverId, updateItems]);

    const itemCount = totalItemCount ?? 0;

    const getItem = useCallback(
        (index: number) => {
            return loaderData.dataMap.get(index);
        },
        [loaderData],
    );

    const getItemIndex = useCallback(
        (id: string) => {
            return loaderData.idToIndexMap.get(id);
        },
        [loaderData],
    );

    const loadedItems = useMemo(() => {
        if (loaderData.dataMap.size === 0) return [];
        return Array.from(loaderData.dataMap.entries())
            .sort(([a], [b]) => a - b)
            .map(([, v]) => v);
    }, [loaderData]);

    return {
        dataVersion: loaderData.version,
        getItem,
        getItemIndex,
        itemCount,
        loadedItems,
        onRangeChanged,
        refresh,
        updateItems,
    };
};

export const parseListCountQuery = (query: any) => {
    return {
        ...query,
        limit: 1,
        startIndex: 0,
    };
};
