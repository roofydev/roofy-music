import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useSetRating } from '/@/renderer/features/shared/hooks/use-set-rating';
import { useCurrentServer, useCurrentServerId, useShowRatings } from '/@/renderer/store';
import { ContextMenu } from '/@/shared/components/context-menu/context-menu';
import { Rating } from '/@/shared/components/rating/rating';
import { toast } from '/@/shared/components/toast/toast';
import {
    LibraryItem,
    ServerType as DomainServerType,
    Song,
} from '/@/shared/types/domain-types';
import { ServerType } from '/@/shared/types/types';

interface SetRatingActionProps {
    ids: string[];
    itemType: LibraryItem;
    songs?: Song[];
}

const setYoutubeRating = (songs: Song[], rating: number) => {
    const raw = window.localStorage.getItem('roofy-youtube-music-user-state');
    const state = raw ? JSON.parse(raw) : {};

    for (const song of songs) {
        state[song.id] = {
            ...(state[song.id] || {}),
            rating,
            sourceTrackId: song.id,
            updatedAt: new Date().toISOString(),
            videoId: song.youtubeMusic?.videoId,
        };
    }

    window.localStorage.setItem('roofy-youtube-music-user-state', JSON.stringify(state));
};

export const SetRatingAction = ({ ids, itemType, songs = [] }: SetRatingActionProps) => {
    const { t } = useTranslation();
    const server = useCurrentServer();
    const serverId = useCurrentServerId();
    const showRatings = useShowRatings();

    const setRating = useSetRating();

    const isRatingSupported = useMemo(() => {
        return server?.type === ServerType.NAVIDROME || server?.type === ServerType.SUBSONIC;
    }, [server?.type]);

    const youtubeSongs = songs.filter((song) => song._serverType === DomainServerType.YOUTUBE_MUSIC);
    const isYoutubeOnlySelection = youtubeSongs.length > 0 && youtubeSongs.length === ids.length;

    const onRating = (rating: number) => {
        if (isYoutubeOnlySelection) {
            setYoutubeRating(youtubeSongs, rating);
            toast.success({ message: 'Saved YouTube Music rating locally' });
            return;
        }

        setRating(serverId, ids, itemType, rating);
    };

    if (!showRatings || (!isRatingSupported && !isYoutubeOnlySelection)) {
        return null;
    }

    return (
        <ContextMenu.Submenu>
            <ContextMenu.SubmenuTarget>
                <ContextMenu.Item
                    leftIcon="star"
                    onSelect={(e) => e.preventDefault()}
                    rightIcon="arrowRightS"
                >
                    {t('action.setRating')}
                </ContextMenu.Item>
            </ContextMenu.SubmenuTarget>
            <ContextMenu.SubmenuContent>
                <ContextMenu.Item onSelect={() => onRating(0)}>
                    <Rating preventDefault={false} readOnly stopPropagation={false} value={0} />
                </ContextMenu.Item>
                <ContextMenu.Item onSelect={() => onRating(1)}>
                    <Rating preventDefault={false} readOnly stopPropagation={false} value={1} />
                </ContextMenu.Item>
                <ContextMenu.Item onSelect={() => onRating(2)}>
                    <Rating preventDefault={false} readOnly stopPropagation={false} value={2} />
                </ContextMenu.Item>
                <ContextMenu.Item onSelect={() => onRating(3)}>
                    <Rating preventDefault={false} readOnly stopPropagation={false} value={3} />
                </ContextMenu.Item>
                <ContextMenu.Item onSelect={() => onRating(4)}>
                    <Rating preventDefault={false} readOnly stopPropagation={false} value={4} />
                </ContextMenu.Item>
                <ContextMenu.Item onSelect={() => onRating(5)}>
                    <Rating preventDefault={false} readOnly stopPropagation={false} value={5} />
                </ContextMenu.Item>
            </ContextMenu.SubmenuContent>
        </ContextMenu.Submenu>
    );
};
