import { useMemo } from 'react';

import { AddToPlaylistAction } from '/@/renderer/features/context-menu/actions/add-to-playlist-action';
import { AddToQueueAction } from '/@/renderer/features/context-menu/actions/add-to-queue-action';
import { DeleteLocalTrackAction } from '/@/renderer/features/context-menu/actions/delete-local-track-action';
import { DownloadAction } from '/@/renderer/features/context-menu/actions/download-action';
import { GetInfoAction } from '/@/renderer/features/context-menu/actions/get-info-action';
import { GoToAction } from '/@/renderer/features/context-menu/actions/go-to-action';
import { OpenYoutubeSourceAction } from '/@/renderer/features/context-menu/actions/open-youtube-source-action';
import { PlayAction } from '/@/renderer/features/context-menu/actions/play-action';
import { PlayNextAction } from '/@/renderer/features/context-menu/actions/play-next-action';
import { PlayTrackRadioAction } from '/@/renderer/features/context-menu/actions/play-track-radio-action';
import { RemoveFromPlaylistAction } from '/@/renderer/features/context-menu/actions/remove-from-playlist-action';
import { SetFavoriteAction } from '/@/renderer/features/context-menu/actions/set-favorite-action';
import { SetRatingAction } from '/@/renderer/features/context-menu/actions/set-rating-action';
import { ShareAction } from '/@/renderer/features/context-menu/actions/share-action';
import { ShowInFileExplorerAction } from '/@/renderer/features/context-menu/actions/show-in-file-explorer-action';
import { ContextMenuPreview } from '/@/renderer/features/context-menu/components/context-menu-preview';
import { ContextMenu } from '/@/shared/components/context-menu/context-menu';
import { isTrackActionVisible } from '/@/shared/product-ux';
import { LibraryItem, Song } from '/@/shared/types/domain-types';

interface PlaylistSongContextMenuProps {
    items: Song[];
    type: LibraryItem.PLAYLIST_SONG;
}

export const PlaylistSongContextMenu = ({ items, type }: PlaylistSongContextMenuProps) => {
    const { ids } = useMemo(() => {
        const ids = items.map((item) => item.id);
        return { ids };
    }, [items]);

    const showSaveOrLibrary =
        isTrackActionVisible(items, 'saveOffline') ||
        isTrackActionVisible(items, 'addToLibrary');
    const showWatchVideo = isTrackActionVisible(items, 'watchVideo');

    return (
        <ContextMenu.Content
            bottomStickyContent={<ContextMenuPreview items={items} itemType={type} />}
        >
            <PlayAction ids={ids} itemType={type} songs={items} />
            <PlayNextAction ids={ids} itemType={type} songs={items} />
            <AddToQueueAction ids={ids} itemType={type} songs={items} />
            <ContextMenu.Divider />
            <RemoveFromPlaylistAction items={items} />
            <ContextMenu.Divider />
            <AddToPlaylistAction items={ids} itemType={type} songs={items} />
            {(showSaveOrLibrary || showWatchVideo) && (
                <>
                    <ContextMenu.Divider />
                    {showSaveOrLibrary && <DownloadAction ids={ids} songs={items} />}
                    {showWatchVideo && <OpenYoutubeSourceAction songs={items} />}
                </>
            )}
            <ContextMenu.Divider />
            <PlayTrackRadioAction disabled={items.length > 1} song={items[0]} />
            <ContextMenu.Divider />
            <SetFavoriteAction ids={ids} itemType={type} />
            <SetRatingAction ids={ids} itemType={type} />
            <DeleteLocalTrackAction items={items} />
            <ShareAction ids={ids} itemType={type} />
            <ContextMenu.Divider />
            <GoToAction items={items} />
            <ShowInFileExplorerAction items={items} />
            <ContextMenu.Divider />
            <GetInfoAction disabled={items.length === 0} items={items} />
        </ContextMenu.Content>
    );
};
