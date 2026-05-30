import { useTranslation } from 'react-i18next';

import { usePlayerStore } from '/@/renderer/store';
import { toast } from '/@/shared/components/toast/toast';
import { PlayerStatus } from '/@/shared/types/types';

export const useListenOnHandoff = () => {
    const { t } = useTranslation();

    const promptContinueOnPhone = () => {
        const currentSong = usePlayerStore.getState().getCurrentSong();
        const isPlaying = usePlayerStore.getState().player.status === PlayerStatus.PLAYING;

        if (!currentSong) {
            toast.info({
                message: t('productUx.devices.listenOnPhoneIdle'),
                title: t('productUx.devices.yourPhone'),
            });
            return;
        }

        toast.info({
            message: t('productUx.devices.listenOnPhoneHint'),
            title: isPlaying
                ? t('productUx.devices.switchOnPhoneTitle')
                : t('productUx.devices.yourPhone'),
        });
    };

    return { promptContinueOnPhone };
};
