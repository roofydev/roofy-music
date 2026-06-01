import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { isTrackActionVisible } from '/@/shared/product-ux';
import { ContextMenu } from '/@/shared/components/context-menu/context-menu';
import { Song, ServerType } from '/@/shared/types/domain-types';

interface OpenYoutubeSourceActionProps {
    songs: Song[];
}

export const OpenYoutubeSourceAction = ({ songs }: OpenYoutubeSourceActionProps) => {
    const { t } = useTranslation();
    const song = songs[0];
    const isSingleYt = songs.length === 1 && song?._serverType === ServerType.YOUTUBE_MUSIC;
    const videoId = song?.youtubeMusic?.videoId;

    const onSelect = useCallback(() => {
        if (!videoId) return;
        window.open(`https://music.youtube.com/watch?v=${videoId}`, '_blank');
    }, [videoId]);

    if (!isSingleYt || !videoId || !isTrackActionVisible(songs, 'watchVideo')) return null;

    return (
        <ContextMenu.Item leftIcon="externalLink" onSelect={onSelect}>
            {t('productUx.action.watchVideo')}
        </ContextMenu.Item>
    );
};
