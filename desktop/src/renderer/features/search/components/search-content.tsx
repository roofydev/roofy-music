import { useQuery } from '@tanstack/react-query';
import isElectron from 'is-electron';
import { Suspense, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router';

import {
    AlbumListView,
    OverrideAlbumListQuery,
} from '/@/renderer/features/albums/components/album-list-content';
import {
    AlbumArtistListView,
    OverrideAlbumArtistListQuery,
} from '/@/renderer/features/artists/components/album-artist-list-content';
import { AnimatedPage } from '/@/renderer/features/shared/components/animated-page';
import { YoutubeMusicSongsTable } from '/@/renderer/features/youtube-music/components/youtube-music-songs-table';
import {
    OverrideSongListQuery,
    SongListView,
} from '/@/renderer/features/songs/components/song-list-content';
import { useListSettings } from '/@/renderer/store';
import { Badge } from '/@/shared/components/badge/badge';
import { Group } from '/@/shared/components/group/group';
import { Image } from '/@/shared/components/image/image';
import { Spinner } from '/@/shared/components/spinner/spinner';
import { Stack } from '/@/shared/components/stack/stack';
import { Table } from '/@/shared/components/table/table';
import { Text } from '/@/shared/components/text/text';
import {
    AlbumArtistListSort,
    AlbumListSort,
    LibraryItem,
    Song,
    SongListSort,
    SortOrder,
} from '/@/shared/types/domain-types';
import { ItemListKey } from '/@/shared/types/types';
import { SearchRouteEmptyHint } from '/@/renderer/features/search/components/search-route-empty-hint';
import { showSearchError } from '/@/shared/product-ux';

export const SearchContent = () => {
    const { itemType } = useParams() as { itemType: LibraryItem };

    return (
        <AnimatedPage>
            <Suspense fallback={<Spinner container />}>
                {itemType === LibraryItem.ALBUM && <AlbumSearch />}
                {itemType === LibraryItem.SONG && <SongSearch />}
                {itemType === LibraryItem.ALBUM_ARTIST && <ArtistSearch />}
            </Suspense>
        </AnimatedPage>
    );
};

const AlbumSearch = () => {
    const { display, grid, itemsPerPage, pagination, table } = useListSettings(ItemListKey.ALBUM);
    const [searchParams] = useSearchParams();

    const albumQuery: OverrideAlbumListQuery = {
        searchTerm: searchParams.get('query') || '',
        sortBy: AlbumListSort.NAME,
        sortOrder: SortOrder.ASC,
    };

    const searchTerm = searchParams.get('query') || '';

    return (
        <Stack gap="lg">
            <SearchRouteEmptyHint itemType={LibraryItem.ALBUM} searchTerm={searchTerm} />
            <AlbumListView
                display={display}
                grid={grid}
                itemsPerPage={itemsPerPage}
                overrideQuery={albumQuery}
                pagination={pagination}
                table={table}
            />
            <YoutubeMusicSearchSection itemType={LibraryItem.ALBUM} searchTerm={searchTerm} />
        </Stack>
    );
};

const SongSearch = () => {
    const { display, grid, itemsPerPage, pagination, table } = useListSettings(ItemListKey.SONG);
    const [searchParams] = useSearchParams();

    const songQuery: OverrideSongListQuery = {
        searchTerm: searchParams.get('query') || '',
        sortBy: SongListSort.NAME,
        sortOrder: SortOrder.ASC,
    };

    const searchTerm = searchParams.get('query') || '';

    return (
        <Stack gap="lg">
            <SearchRouteEmptyHint itemType={LibraryItem.SONG} searchTerm={searchTerm} />
            <SongListView
                display={display}
                grid={grid}
                itemsPerPage={itemsPerPage}
                overrideQuery={songQuery}
                pagination={pagination}
                table={table}
            />
            <YoutubeMusicSearchSection itemType={LibraryItem.SONG} searchTerm={searchTerm} />
        </Stack>
    );
};

const ArtistSearch = () => {
    const { display, grid, itemsPerPage, pagination, table } = useListSettings(ItemListKey.ARTIST);
    const [searchParams] = useSearchParams();

    const albumArtistQuery: OverrideAlbumArtistListQuery = {
        searchTerm: searchParams.get('query') || '',
        sortBy: AlbumArtistListSort.NAME,
        sortOrder: SortOrder.ASC,
    };

    const searchTerm = searchParams.get('query') || '';

    return (
        <Stack gap="lg">
            <SearchRouteEmptyHint itemType={LibraryItem.ALBUM_ARTIST} searchTerm={searchTerm} />
            <AlbumArtistListView
                display={display}
                grid={grid}
                itemsPerPage={itemsPerPage}
                overrideQuery={albumArtistQuery}
                pagination={pagination}
                table={table}
            />
            <YoutubeMusicSearchSection
                itemType={LibraryItem.ALBUM_ARTIST}
                searchTerm={searchTerm}
            />
        </Stack>
    );
};

const YoutubeMusicSearchSection = ({
    itemType,
    searchTerm,
}: {
    itemType: LibraryItem.ALBUM | LibraryItem.ALBUM_ARTIST | LibraryItem.SONG;
    searchTerm: string;
}) => {
    const { t } = useTranslation();
    const enabled = Boolean(searchTerm.trim() && isElectron() && window.api?.youtubeMusic);

    const statusQuery = useQuery({
        enabled,
        queryFn: () => window.api.youtubeMusic.status(),
        queryKey: ['youtube-music', 'search-status'],
        staleTime: 60_000,
    });

    const searchQuery = useQuery({
        enabled: enabled && Boolean(statusQuery.data?.connected),
        queryFn: () => window.api.youtubeMusic.search(searchTerm),
        queryKey: ['youtube-music', 'global-search', searchTerm],
        staleTime: 30_000,
    });

    useEffect(() => {
        if (searchQuery.isError) {
            showSearchError(t, searchQuery.error);
        }
    }, [searchQuery.isError, searchQuery.error, t]);

    if (!enabled || statusQuery.data?.connected === false) {
        return null;
    }

    const songs = searchQuery.data?.songs || [];
    const albums = searchQuery.data?.albums || [];
    const artists = searchQuery.data?.albumArtists || [];
    const title =
        itemType === LibraryItem.SONG
            ? t('productUx.search.youtubeMusic.tracks')
            : itemType === LibraryItem.ALBUM
              ? t('productUx.search.youtubeMusic.albums')
              : t('productUx.search.youtubeMusic.artists');
    const count =
        itemType === LibraryItem.SONG
            ? songs.length
            : itemType === LibraryItem.ALBUM
              ? albums.length
              : artists.length;

    return (
        <section
            style={{
                background: 'color-mix(in srgb, #707070 6%, var(--theme-colors-background))',
                border: '1px solid rgba(255, 255, 255, 0.28)',
                borderLeft: '3px solid rgba(255, 255, 255, 0.55)',
                borderRadius: 0,
                padding: 'var(--theme-spacing-md)',
            }}
        >
            <Group justify="space-between" mb="xs">
                <Group>
                    <Text fw={600}>{title}</Text>
                    <Badge>{t('productUx.search.youtubeMusic.badgeOnline')}</Badge>
                </Group>
                <Text isMuted size="sm">
                    {searchQuery.isLoading
                        ? t('productUx.search.youtubeMusic.loading')
                        : t('productUx.search.youtubeMusic.resultCount', { count })}
                </Text>
            </Group>
            {itemType === LibraryItem.SONG && songs.length > 0 && (
                <YoutubeMusicSongsTable songs={songs.slice(0, 8)} />
            )}
            {itemType !== LibraryItem.SONG && (
                <Table>
                    <Table.Tbody>
                        {(itemType === LibraryItem.ALBUM ? albums : artists)
                            .slice(0, 8)
                            .map((item) => (
                                <Table.Tr key={item.id}>
                                    <Table.Td w={42}>
                                        <Image
                                            imageContainerProps={{
                                                style: { height: 32, width: 32 },
                                            }}
                                            includeLoader={false}
                                            src={item.imageUrl || undefined}
                                            unloaderIcon={
                                                itemType === LibraryItem.ALBUM
                                                    ? 'emptyAlbumImage'
                                                    : 'emptyArtistImage'
                                            }
                                        />
                                    </Table.Td>
                                    <Table.Td>
                                        <Text>{item.name}</Text>
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                    </Table.Tbody>
                </Table>
            )}
        </section>
    );
};
