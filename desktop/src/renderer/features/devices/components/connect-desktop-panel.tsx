import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import styles from '/@/renderer/features/devices/components/connect-desktop-panel.module.css';
import { DevicesPicker } from '/@/renderer/features/devices/components/devices-picker';
import { useEnableWebControl } from '/@/renderer/features/devices/hooks/use-enable-web-control';
import { usePhoneLink } from '/@/renderer/features/devices/hooks/use-phone-link';
import { openLinkPhoneModal } from '/@/renderer/features/devices/utils/open-link-phone-modal';
import { AppRoute } from '/@/renderer/router/routes';
import { useSettingsStoreActions } from '/@/renderer/store';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Text } from '/@/shared/components/text/text';

interface ConnectDesktopPanelProps {
    onClose?: () => void;
    opened: boolean;
}

export const ConnectDesktopPanel = ({ onClose, opened }: ConnectDesktopPanelProps) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { setSettings } = useSettingsStoreActions();
    const { setWebControlEnabled } = useEnableWebControl();
    const { start } = usePhoneLink(0);

    const openDevicesSettings = () => {
        setSettings({ tab: 'devices' });
        navigate(AppRoute.SETTINGS);
        onClose?.();
    };

    useEffect(() => {
        if (!opened) return;

        void (async () => {
            await setWebControlEnabled(true);
            await start('auto');
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- warm bridge silently when sheet opens
    }, [opened]);

    return (
        <div className={styles.panel}>
            <header className={styles.header}>
                <span className={styles.headerSide} aria-hidden />
                <Text className={styles.headerTitle} fw={700} size="sm">
                    {t('productUx.devices.listenOn')}
                </Text>
                <span className={styles.headerSide}>
                    <ActionIcon
                        icon="settings2"
                        onClick={openDevicesSettings}
                        size="sm"
                        tooltip={{ label: t('productUx.devices.manageDevices'), openDelay: 0 }}
                        variant="subtle"
                    />
                </span>
            </header>

            <DevicesPicker
                embedded
                onClose={onClose}
                onLinkPhone={() => {
                    openLinkPhoneModal(onClose);
                }}
                onOpenDeviceSettings={openDevicesSettings}
            />
        </div>
    );
};
