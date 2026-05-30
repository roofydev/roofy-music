import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { searchQueries } from '/@/renderer/features/search/api/search-api';
import { useCurrentServer } from '/@/renderer/store';
import { Box } from '/@/shared/components/box/box';
import { Icon } from '/@/shared/components/icon/icon';
import { Spinner } from '/@/shared/components/spinner/spinner';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';
import { LibraryItem } from '/@/shared/types/domain-types';

interface SearchRouteEmptyHintProps {
    itemType: LibraryItem;
    searchTerm: string;
}

export function SearchRouteEmptyHint({ itemType, searchTerm }: SearchRouteEmptyHintProps) {
    const { t } = useTranslation();
    const server = useCurrentServer();
    const trimmedQuery = searchTerm.trim();
    const enabled = Boolean(server?.id && trimmedQuery);

    const songsQuery = useInfiniteQuery(
        searchQueries.searchSongsInfinite({
            enabled: enabled && itemType === LibraryItem.SONG,
            searchTerm: trimmedQuery,
            serverId: server?.id,
        }),
    );
    const albumsQuery = useInfiniteQuery(
        searchQueries.searchAlbumsInfinite({
            enabled: enabled && itemType === LibraryItem.ALBUM,
            searchTerm: trimmedQuery,
            serverId: server?.id,
        }),
    );
    const artistsQuery = useInfiniteQuery(
        searchQueries.searchAlbumArtistsInfinite({
            enabled: enabled && itemType === LibraryItem.ALBUM_ARTIST,
            searchTerm: trimmedQuery,
            serverId: server?.id,
        }),
    );

    const activeQuery =
        itemType === LibraryItem.SONG
            ? songsQuery
            : itemType === LibraryItem.ALBUM
              ? albumsQuery
              : artistsQuery;

    const resultCount =
        itemType === LibraryItem.SONG
            ? (songsQuery.data?.pages[0]?.songs.length ?? 0)
            : itemType === LibraryItem.ALBUM
              ? (albumsQuery.data?.pages[0]?.albums.length ?? 0)
              : (artistsQuery.data?.pages[0]?.albumArtists.length ?? 0);

    if (!trimmedQuery) {
        return null;
    }

    if (!server?.id) {
        return null;
    }

    if (activeQuery.isLoading) {
        return (
            <Box p="md">
                <Spinner container />
            </Box>
        );
    }

    if (!activeQuery.isFetched || resultCount > 0) {
        return null;
    }

    return (
        <Box p="md" style={{ textAlign: 'center' }}>
            <Stack align="center" gap="xs">
                <Icon icon="search" size="xl" />
                <Text fw={600}>{t('productUx.search.empty.title')}</Text>
                <Text isMuted size="sm">
                    {t('productUx.search.empty.description')}
                </Text>
            </Stack>
        </Box>
    );
}
