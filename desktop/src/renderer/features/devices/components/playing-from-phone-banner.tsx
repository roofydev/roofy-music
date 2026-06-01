import isElectron from 'is-electron';
import { useTranslation } from 'react-i18next';

import styles from '/@/renderer/features/devices/components/playing-from-phone-banner.module.css';
import { useDevicesStatus } from '/@/renderer/features/devices/hooks/use-devices-status';
import { Icon } from '/@/shared/components/icon/icon';
import { Text } from '/@/shared/components/text/text';

export const PlayingFromPhoneBanner = () => {
    const { t } = useTranslation();
    const { status } = useDevicesStatus(4000);

    if (!isElectron()) {
        return null;
    }

    const phoneControllingDesktop = Boolean(status.phoneLink.phoneControllingDesktop);

    if (!phoneControllingDesktop) {
        return null;
    }

    const phoneName = status.phoneLink.phoneName || t('productUx.devices.yourPhone');

    return (
        <div className={styles.banner} data-phone-banner role="status">
            <Icon color="success" icon="appWindow" size="sm" />
            <Text className={styles.text} size="sm">
                {t('productUx.devices.phoneControlBannerTitle', { device: phoneName })}
            </Text>
        </div>
    );
};
