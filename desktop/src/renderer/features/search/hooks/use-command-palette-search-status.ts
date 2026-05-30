import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import isElectron from 'is-electron';

import { searchQueries } from '/@/renderer/features/search/api/search-api';
import { useCurrentServer } from '/@/renderer/store';

export function useCommandPaletteSearchStatus(debouncedQuery: string, isHome: boolean) {
    const server = useCurrentServer();
    const trimmedQuery = debouncedQuery.trim();
    const enabled = isHome && trimmedQuery !== '';

    const songsQuery = useInfiniteQuery(
        searchQueries.searchSongsInfinite({
            enabled,
            searchTerm: trimmedQuery,
            serverId: server?.id,
        }),
    );
    const albumsQuery = useInfiniteQuery(
        searchQueries.searchAlbumsInfinite({
            enabled,
            searchTerm: trimmedQuery,
            serverId: server?.id,
        }),
    );
    const artistsQuery = useInfiniteQuery(
        searchQueries.searchAlbumArtistsInfinite({
            enabled,
            searchTerm: trimmedQuery,
            serverId: server?.id,
        }),
    );

    const youtubeEnabled =
        enabled && isElectron() && Boolean(window.api?.youtubeMusic);

    const youtubeStatusQuery = useQuery({
        enabled: youtubeEnabled,
        queryFn: () => window.api.youtubeMusic.status(),
        queryKey: ['youtube-music', 'palette-status', trimmedQuery],
        staleTime: 60_000,
    });

    const youtubeConnected = Boolean(youtubeStatusQuery.data?.connected);
    const youtubeSearchQuery = useQuery({
        enabled: youtubeEnabled && youtubeConnected,
        queryFn: () => window.api.youtubeMusic.search(trimmedQuery),
        queryKey: ['youtube-music', 'palette-search', trimmedQuery],
        staleTime: 30_000,
    });

    const songCount = songsQuery.data?.pages[0]?.songs.length ?? 0;
    const albumCount = albumsQuery.data?.pages[0]?.albums.length ?? 0;
    const artistCount = artistsQuery.data?.pages[0]?.albumArtists.length ?? 0;
    const youtubeSongCount = youtubeSearchQuery.data?.songs?.length ?? 0;

    const libraryLoading =
        songsQuery.isLoading || albumsQuery.isLoading || artistsQuery.isLoading;
    const libraryFetched =
        songsQuery.isFetched && albumsQuery.isFetched && artistsQuery.isFetched;

    const youtubeLoading =
        youtubeEnabled &&
        (youtubeStatusQuery.isLoading ||
            (youtubeConnected && youtubeSearchQuery.isLoading));
    const youtubeFetched =
        !youtubeEnabled || !youtubeConnected || youtubeSearchQuery.isFetched;

    const isLoading = enabled && (libraryLoading || youtubeLoading);
    const isSettled = enabled && libraryFetched && youtubeFetched && !isLoading;

    const hasResults =
        songCount > 0 || albumCount > 0 || artistCount > 0 || youtubeSongCount > 0;

    return {
        hasResults,
        isLoading: enabled && !isSettled,
        showEmpty: isSettled && !hasResults,
    };
}
