import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useCreateFavorite } from '/@/renderer/features/shared/mutations/create-favorite-mutation';
import { useDeleteFavorite } from '/@/renderer/features/shared/mutations/delete-favorite-mutation';
import { useCurrentServerId } from '/@/renderer/store';
import { ContextMenu } from '/@/shared/components/context-menu/context-menu';
import { toast } from '/@/shared/components/toast/toast';
import { LibraryItem, ServerType, Song } from '/@/shared/types/domain-types';

interface SetFavoriteActionProps {
    ids: string[];
    itemType: LibraryItem;
    songs?: Song[];
}

const setYoutubeFavorite = (songs: Song[], favorite: boolean) => {
    const raw = window.localStorage.getItem('roofy-youtube-music-user-state');
    const state = raw ? JSON.parse(raw) : {};

    for (const song of songs) {
        state[song.id] = {
            ...(state[song.id] || {}),
            favorite,
            sourceTrackId: song.id,
            updatedAt: new Date().toISOString(),
            videoId: song.youtubeMusic?.videoId,
        };
    }

    window.localStorage.setItem('roofy-youtube-music-user-state', JSON.stringify(state));
};

export const SetFavoriteAction = ({ ids, itemType, songs = [] }: SetFavoriteActionProps) => {
    const { t } = useTranslation();
    const serverId = useCurrentServerId();

    const createFavoriteMutation = useCreateFavorite({});
    const deleteFavoriteMutation = useDeleteFavorite({});
    const youtubeSongs = songs.filter((song) => song._serverType === ServerType.YOUTUBE_MUSIC);
    const isYoutubeOnlySelection = youtubeSongs.length > 0 && youtubeSongs.length === ids.length;

    const handleAddToFavorites = useCallback(() => {
        if (isYoutubeOnlySelection) {
            setYoutubeFavorite(youtubeSongs, true);
            toast.success({ message: t('productUx.search.youtubeMusic.favoriteSavedLocal') });
            return;
        }

        if (ids.length === 0 || !serverId) return;

        createFavoriteMutation.mutate({
            apiClientProps: { serverId },
            query: {
                id: ids,
                type: itemType,
            },
        });
    }, [createFavoriteMutation, ids, isYoutubeOnlySelection, itemType, serverId, youtubeSongs]);

    const handleRemoveFromFavorites = useCallback(() => {
        if (isYoutubeOnlySelection) {
            setYoutubeFavorite(youtubeSongs, false);
            toast.success({ message: t('productUx.search.youtubeMusic.favoriteUpdatedLocal') });
            return;
        }

        if (ids.length === 0 || !serverId) return;

        deleteFavoriteMutation.mutate({
            apiClientProps: { serverId },
            query: {
                id: ids,
                type: itemType,
            },
        });
    }, [deleteFavoriteMutation, ids, isYoutubeOnlySelection, itemType, serverId, youtubeSongs]);

    return (
        <ContextMenu.Submenu>
            <ContextMenu.SubmenuTarget>
                <ContextMenu.Item
                    leftIcon="favorite"
                    onSelect={(e) => e.preventDefault()}
                    rightIcon="arrowRightS"
                >
                    {t('common.favorite')}
                </ContextMenu.Item>
            </ContextMenu.SubmenuTarget>
            <ContextMenu.SubmenuContent>
                <ContextMenu.Item leftIcon="favorite" onSelect={handleAddToFavorites}>
                    {t('action.addToFavorites')}
                </ContextMenu.Item>
                <ContextMenu.Item leftIcon="unfavorite" onSelect={handleRemoveFromFavorites}>
                    {t('action.removeFromFavorites')}
                </ContextMenu.Item>
            </ContextMenu.SubmenuContent>
        </ContextMenu.Submenu>
    );
};
