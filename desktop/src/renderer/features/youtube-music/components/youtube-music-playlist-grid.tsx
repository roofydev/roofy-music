import { useMemo } from 'react';

import styles from './youtube-music-playlist-grid.module.css';

import { ItemCard } from '/@/renderer/components/item-card/item-card';
import { useDefaultItemListControls } from '/@/renderer/components/item-list/helpers/item-list-controls';
import { useItemListState } from '/@/renderer/components/item-list/helpers/item-list-state';
import { ItemControls } from '/@/renderer/components/item-list/types';
import { LibraryItem, Playlist } from '/@/shared/types/domain-types';
import { Play } from '/@/shared/types/types';

interface YoutubeMusicPlaylistGridProps {
    onOpenPlaylist: (playlist: Playlist) => void;
    onPlayPlaylist: (playlist: Playlist, playType: Play) => void;
    playlists: Playlist[];
}

export const YoutubeMusicPlaylistGrid = ({
    onOpenPlaylist,
    onPlayPlaylist,
    playlists,
}: YoutubeMusicPlaylistGridProps) => {
    const defaultControls = useDefaultItemListControls();
    const internalState = useItemListState(
        () => playlists,
        (item) => (item as any)?.id,
    );
    const controls: ItemControls = useMemo(
        () => ({
            ...defaultControls,
            onDoubleClick: ({ item }) => {
                onOpenPlaylist(item as Playlist);
            },
            onPlay: ({ item, playType }) => {
                onPlayPlaylist(item as Playlist, playType);
            },
        }),
        [defaultControls, onOpenPlaylist, onPlayPlaylist],
    );

    const rows = useMemo(
        () => [
            {
                format: (data: any) => data.name,
                id: 'name',
            },
        ],
        [],
    );

    return (
        <div className={styles.grid}>
            {playlists.map((playlist) => {
                return (
                    <ItemCard
                        controls={controls}
                        data={playlist}
                        enableDrag={false}
                        enableNavigation={false}
                        internalState={internalState}
                        itemType={LibraryItem.PLAYLIST}
                        key={playlist.id}
                        rows={rows}
                        type="poster"
                        withControls
                    />
                );
            })}
        </div>
    );
};
