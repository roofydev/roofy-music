import { useQuery } from '@tanstack/react-query';
import isElectron from 'is-electron';
import { useMemo } from 'react';

import styles from './youtube-music-home-carousels.module.css';

import {
    GridCarousel,
    useGridCarouselContainerQuery,
} from '/@/renderer/components/grid-carousel/grid-carousel-v2';
import { DataRow, MemoizedItemCard } from '/@/renderer/components/item-card/item-card';
import { useDefaultItemListControls } from '/@/renderer/components/item-list/helpers/item-list-controls';
import { useGridRows } from '/@/renderer/components/item-list/helpers/use-grid-rows';
import { ItemControls } from '/@/renderer/components/item-list/types';
import { QuickImport } from '/@/renderer/features/local-first/components/quick-import';
import { usePlayer } from '/@/renderer/features/player/context/player-context';
import { youtubeMusicAuthStatusQueryKey } from '/@/renderer/features/youtube-music/components/youtube-music-account-button';
import { Badge } from '/@/shared/components/badge/badge';
import { Group } from '/@/shared/components/group/group';
import { Spinner } from '/@/shared/components/spinner/spinner';
import { Stack } from '/@/shared/components/stack/stack';
import { TextTitle } from '/@/shared/components/text-title/text-title';
import { Album, LibraryItem, Playlist, Song } from '/@/shared/types/domain-types';
import { ItemListKey, Play } from '/@/shared/types/types';
import { YoutubeMusicHomeSection } from '/@/shared/types/youtube-music-types';

type YoutubeMusicHomeCarouselsProps = {
    containerQuery?: ReturnType<typeof useGridCarouselContainerQuery>;
    maxHeight?: string;
    title?: string;
};

const rowsByType = (
    itemType: LibraryItem.ALBUM | LibraryItem.PLAYLIST | LibraryItem.SONG,
    rows: {
        album: DataRow[];
        playlist: DataRow[];
        song: DataRow[];
    },
) => {
    switch (itemType) {
        case LibraryItem.ALBUM:
            return rows.album;
        case LibraryItem.PLAYLIST:
            return rows.playlist;
        case LibraryItem.SONG:
            return rows.song;
        default:
            return rows.song;
    }
};

const sectionTitle = (section: YoutubeMusicHomeSection) => (
    <Group gap="sm">
        <span>{section.title}</span>
        <Badge>{section.sourceLabel}</Badge>
    </Group>
);

const YoutubeMusicSectionHeader = ({ title }: { title?: string }) => {
    if (!title) return null;

    return (
        <Group align="center" className={styles.header} gap="lg" wrap="nowrap">
            <TextTitle className={styles.title} fw={700}>
                {title}
            </TextTitle>
            <QuickImport className={styles.quickImport} variant="inline" />
        </Group>
    );
};

export const YoutubeMusicHomeCarousels = ({
    containerQuery,
    maxHeight,
    title,
}: YoutubeMusicHomeCarouselsProps) => {
    const player = usePlayer();
    const baseControls = useDefaultItemListControls();
    const songRows = useGridRows(LibraryItem.SONG, ItemListKey.SONG);
    const albumRows = useGridRows(LibraryItem.ALBUM, ItemListKey.ALBUM);
    const playlistRows = useGridRows(LibraryItem.PLAYLIST, ItemListKey.PLAYLIST);

    const statusQuery = useQuery({
        enabled: isElectron() && Boolean(window.api?.youtubeMusic),
        queryFn: () => window.api.youtubeMusic.status(),
        queryKey: youtubeMusicAuthStatusQueryKey,
        staleTime: 1000 * 60,
    });

    const homeQuery = useQuery({
        enabled: Boolean(statusQuery.data?.connected),
        queryFn: () => window.api.youtubeMusic.home(),
        queryKey: ['youtube-music', 'home', 'main-feed'],
        staleTime: 1000 * 60 * 10,
    });

    const controls: ItemControls = useMemo(
        () => ({
            ...baseControls,
            onPlay: ({ item, itemType, playType }) => {
                if (!item) return;
                if (itemType === LibraryItem.SONG) {
                    player.addToQueueByData([item as Song], playType as Play);
                    return;
                }

                baseControls.onPlay?.({ event: null, item, itemType, playType });
            },
        }),
        [baseControls, player],
    );

    const rows = useMemo(
        () => ({
            album: albumRows,
            playlist: playlistRows,
            song: songRows,
        }),
        [albumRows, playlistRows, songRows],
    );

    const sections = homeQuery.data?.sections || [];

    if (homeQuery.isLoading) {
        return (
            <Stack className={styles.container} gap="lg" style={{ maxHeight }}>
                <YoutubeMusicSectionHeader title={title} />
                <Spinner container size={32} />
            </Stack>
        );
    }

    if (sections.length === 0) return null;

    return (
        <Stack className={styles.container} gap="lg" style={{ maxHeight }}>
            <YoutubeMusicSectionHeader title={title} />
            <div className={styles.sections}>
                {sections.map((section) => {
                    const cardRows = rowsByType(section.itemType, rows);
                    const cards = section.items.map((item) => ({
                        content: (
                            <MemoizedItemCard
                                controls={controls}
                                data={item as Album | Playlist | Song}
                                imageFetchPriority="low"
                                itemType={section.itemType}
                                rows={cardRows}
                                type="poster"
                                withControls
                            />
                        ),
                        id: `${section.id}-${item.id}`,
                    }));

                    if (cards.length === 0) return null;

                    return (
                        <GridCarousel
                            cards={cards}
                            containerQuery={containerQuery}
                            key={section.id}
                            onNextPage={() => {}}
                            onPrevPage={() => {}}
                            placeholderItemType={section.itemType}
                            placeholderRows={cardRows}
                            rowCount={1}
                            title={sectionTitle(section)}
                        />
                    );
                })}
            </div>
        </Stack>
    );
};
