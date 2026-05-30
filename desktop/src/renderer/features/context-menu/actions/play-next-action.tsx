import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { usePlayer } from '/@/renderer/features/player/context/player-context';
import { useCurrentServerId } from '/@/renderer/store';
import { ContextMenu } from '/@/shared/components/context-menu/context-menu';
import { LibraryItem, Song } from '/@/shared/types/domain-types';
import { Play } from '/@/shared/types/types';

interface PlayNextActionProps {
    ids: string[];
    itemType: LibraryItem;
    songs?: Song[];
}

export const PlayNextAction = ({ ids, itemType, songs }: PlayNextActionProps) => {
    const { t } = useTranslation();
    const player = usePlayer();
    const serverId = useCurrentServerId();

    const handlePlayNext = useCallback(() => {
        if (ids.length === 0 || !serverId) return;

        if (
            itemType === LibraryItem.SONG ||
            itemType === LibraryItem.PLAYLIST_SONG ||
            itemType === LibraryItem.QUEUE_SONG
        ) {
            player.addToQueueByData(songs || [], Play.NEXT);
        } else {
            player.addToQueueByFetch(serverId, ids, itemType, Play.NEXT);
        }
    }, [ids, itemType, player, serverId, songs]);

    if (ids.length === 0) return null;

    return (
        <ContextMenu.Item leftIcon="mediaPlayNext" onSelect={handlePlayNext}>
            {t('player.addNext')}
        </ContextMenu.Item>
    );
};
