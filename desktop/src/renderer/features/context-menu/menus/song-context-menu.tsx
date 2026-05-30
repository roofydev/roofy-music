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
import { SetFavoriteAction } from '/@/renderer/features/context-menu/actions/set-favorite-action';
import { SetRatingAction } from '/@/renderer/features/context-menu/actions/set-rating-action';
import { ShareAction } from '/@/renderer/features/context-menu/actions/share-action';
import { ShowInFileExplorerAction } from '/@/renderer/features/context-menu/actions/show-in-file-explorer-action';
import { ContextMenuPreview } from '/@/renderer/features/context-menu/components/context-menu-preview';
import { ContextMenu } from '/@/shared/components/context-menu/context-menu';
import { isTrackActionVisible } from '/@/shared/product-ux';
import { LibraryItem, Song } from '/@/shared/types/domain-types';

interface SongContextMenuProps {
    items: Song[];
    type: LibraryItem.SONG;
}

export const SongContextMenu = ({ items, type }: SongContextMenuProps) => {
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
            <PlayAction ids={ids} itemType={LibraryItem.SONG} songs={items} />
            <PlayNextAction ids={ids} itemType={LibraryItem.SONG} songs={items} />
            <AddToQueueAction ids={ids} itemType={LibraryItem.SONG} songs={items} />
            <ContextMenu.Divider />
            <AddToPlaylistAction items={ids} itemType={LibraryItem.SONG} songs={items} />
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
            <SetFavoriteAction ids={ids} itemType={LibraryItem.SONG} songs={items} />
            <SetRatingAction ids={ids} itemType={LibraryItem.SONG} songs={items} />
            <DeleteLocalTrackAction items={items} />
            <ShareAction ids={ids} itemType={LibraryItem.SONG} />
            <ContextMenu.Divider />
            <GoToAction items={items} />
            <ShowInFileExplorerAction items={items} />
            <ContextMenu.Divider />
            <GetInfoAction disabled={items.length === 0} items={items} />
        </ContextMenu.Content>
    );
};
