import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import styles from '/@/renderer/features/devices/components/connect-desktop-panel.module.css';
import { DevicesPicker } from '/@/renderer/features/devices/components/devices-picker';
import { PhonePairingSection } from '/@/renderer/features/devices/components/phone-pairing-section';
import { useEnableWebControl } from '/@/renderer/features/devices/hooks/use-enable-web-control';
import { usePhoneLink } from '/@/renderer/features/devices/hooks/use-phone-link';
import { AppRoute } from '/@/renderer/router/routes';
import { useSettingsStoreActions } from '/@/renderer/store';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Divider } from '/@/shared/components/divider/divider';
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
    const { start } = usePhoneLink(1000);
    const [qrFocusNonce, setQrFocusNonce] = useState(0);

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
        // eslint-disable-next-line react-hooks/exhaustive-deps -- prepare link when popover opens
    }, [opened]);

    return (
        <div className={styles.panel}>
            <header className={styles.header}>
                <span className={styles.headerSide} aria-hidden />
                <Text className={styles.headerTitle} fw={700} size="sm">
                    {t('productUx.devices.connectPanel.title')}
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

            <PhonePairingSection
                focusNonce={qrFocusNonce}
                pollMs={1000}
                startWhenMounted={false}
            />

            <Divider my="xs" />

            <Text className={styles.subtitle} fw={600} size="sm">
                {t('productUx.devices.connectPanel.whereToPlay')}
            </Text>

            <DevicesPicker
                embedded
                onClose={onClose}
                onRequestLinkPhone={() => setQrFocusNonce((n) => n + 1)}
            />
        </div>
    );
};
