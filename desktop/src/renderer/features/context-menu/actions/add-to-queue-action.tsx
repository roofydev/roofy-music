import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { usePlayer } from '/@/renderer/features/player/context/player-context';
import { useCurrentServerId } from '/@/renderer/store';
import { ContextMenu } from '/@/shared/components/context-menu/context-menu';
import { LibraryItem, Song } from '/@/shared/types/domain-types';
import { Play } from '/@/shared/types/types';

interface AddToQueueActionProps {
    ids: string[];
    itemType: LibraryItem;
    songs?: Song[];
}

export const AddToQueueAction = ({ ids, itemType, songs }: AddToQueueActionProps) => {
    const { t } = useTranslation();
    const player = usePlayer();
    const serverId = useCurrentServerId();

    const handleAddToQueue = useCallback(() => {
        if (ids.length === 0 || !serverId) return;

        if (
            itemType === LibraryItem.SONG ||
            itemType === LibraryItem.PLAYLIST_SONG ||
            itemType === LibraryItem.QUEUE_SONG
        ) {
            player.addToQueueByData(songs || [], Play.LAST);
        } else {
            player.addToQueueByFetch(serverId, ids, itemType, Play.LAST);
        }
    }, [ids, itemType, player, serverId, songs]);

    if (ids.length === 0) return null;

    return (
        <ContextMenu.Item leftIcon="mediaPlayLast" onSelect={handleAddToQueue}>
            {t('player.addLast')}
        </ContextMenu.Item>
    );
};
