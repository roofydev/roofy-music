import { useQuery } from '@tanstack/react-query';
import isElectron from 'is-electron';
import { Suspense } from 'react';
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
import {
    OverrideSongListQuery,
    SongListView,
} from '/@/renderer/features/songs/components/song-list-content';
import { addToQueueByData, useListSettings } from '/@/renderer/store';
import { Badge } from '/@/shared/components/badge/badge';
import { Button } from '/@/shared/components/button/button';
import { Group } from '/@/shared/components/group/group';
import { Spinner } from '/@/shared/components/spinner/spinner';
import { Stack } from '/@/shared/components/stack/stack';
import { Table } from '/@/shared/components/table/table';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';
import {
    AlbumArtistListSort,
    AlbumListSort,
    LibraryItem,
    Song,
    SongListSort,
    SortOrder,
} from '/@/shared/types/domain-types';
import { ItemListKey, Play } from '/@/shared/types/types';

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

    if (!enabled || statusQuery.data?.connected === false) {
        return null;
    }

    const songs = searchQuery.data?.songs || [];
    const albums = searchQuery.data?.albums || [];
    const artists = searchQuery.data?.albumArtists || [];
    const title =
        itemType === LibraryItem.SONG
            ? 'YouTube Music tracks'
            : itemType === LibraryItem.ALBUM
              ? 'YouTube Music albums'
              : 'YouTube Music artists';
    const count =
        itemType === LibraryItem.SONG
            ? songs.length
            : itemType === LibraryItem.ALBUM
              ? albums.length
              : artists.length;

    const handleImport = async (song: Song) => {
        const videoId = song.youtubeMusic?.videoId;
        if (!videoId || !window.api?.youtubeMusic?.downloadTrack) return;

        try {
            await window.api.youtubeMusic.downloadTrack({
                album: song.album || undefined,
                artist: song.artistName || song.albumArtistName || 'Unknown Artist',
                sourceTrackId: song.id,
                title: song.name,
                videoId,
            });
            toast.success({ message: `Queued "${song.name}" for local import` });
        } catch (error) {
            toast.error({ message: (error as Error).message });
        }
    };

    return (
        <section>
            <Group justify="space-between" mb="xs">
                <Group>
                    <Text fw={600}>{title}</Text>
                    <Badge>Remote</Badge>
                </Group>
                <Text isMuted size="sm">
                    {searchQuery.isLoading ? 'Loading' : `${count} results`}
                </Text>
            </Group>
            {itemType === LibraryItem.SONG && (
                <Table>
                    <Table.Tbody>
                        {songs.slice(0, 8).map((song) => (
                            <Table.Tr key={song.id}>
                                <Table.Td w={42}>
                                    {song.imageUrl ? (
                                        <img
                                            alt=""
                                            height={32}
                                            src={song.imageUrl}
                                            style={{ objectFit: 'cover' }}
                                            width={32}
                                        />
                                    ) : (
                                        <Badge>YT</Badge>
                                    )}
                                </Table.Td>
                                <Table.Td>
                                    <Text>{song.name}</Text>
                                    <Text isMuted size="sm">
                                        {song.artistName || 'Unknown Artist'}
                                    </Text>
                                </Table.Td>
                                <Table.Td>
                                    <Group justify="flex-end" wrap="nowrap">
                                        <Button
                                            onClick={() => addToQueueByData(Play.NOW, [song])}
                                            size="compact-sm"
                                        >
                                            Play
                                        </Button>
                                        <Button onClick={() => handleImport(song)} size="compact-sm">
                                            Import
                                        </Button>
                                    </Group>
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            )}
            {itemType !== LibraryItem.SONG && (
                <Table>
                    <Table.Tbody>
                        {(itemType === LibraryItem.ALBUM ? albums : artists).slice(0, 8).map((item) => (
                            <Table.Tr key={item.id}>
                                <Table.Td w={42}>
                                    {item.imageUrl ? (
                                        <img
                                            alt=""
                                            height={32}
                                            src={item.imageUrl}
                                            style={{ objectFit: 'cover' }}
                                            width={32}
                                        />
                                    ) : (
                                        <Badge>YT</Badge>
                                    )}
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
