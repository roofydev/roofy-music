import isElectron from 'is-electron';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import styles from '/@/renderer/features/devices/components/connect-desktop-panel.module.css';
import { DevicesPicker } from '/@/renderer/features/devices/components/devices-picker';
import { PhonePairingSection } from '/@/renderer/features/devices/components/phone-pairing-section';
import { RemoteSettings } from '/@/renderer/features/settings/components/window/remote-settings';
import { Divider } from '/@/shared/components/divider/divider';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';

export const DevicesSettingsTab = () => {
    const { t } = useTranslation();
    const [qrFocusNonce, setQrFocusNonce] = useState(0);

    return (
        <Stack gap="lg">
            <Stack gap={4}>
                <Text fw={700} size="lg">
                    {t('page.setting.devices')}
                </Text>
                <Text c="dimmed" size="sm">
                    {t('productUx.devices.settingsIntroShort')}
                </Text>
            </Stack>

            {isElectron() ? (
                <>
                    <Stack className={styles.panel} gap="md" p={0}>
                        <PhonePairingSection
                            focusNonce={qrFocusNonce}
                            pollMs={4000}
                        />
                    </Stack>
                    <DevicesPicker
                        embedded
                        onRequestLinkPhone={() => setQrFocusNonce((n) => n + 1)}
                    />
                    <Divider />
                    <Stack gap="xs">
                        <Text c="dimmed" size="sm">
                            {t('productUx.devices.webControlAdvancedHint')}
                        </Text>
                        <Text fw={600} size="sm">
                            {t('productUx.devices.advancedSection')}
                        </Text>
                        <RemoteSettings advanced />
                    </Stack>
                </>
            ) : (
                <Text c="dimmed" size="sm">
                    {t('productUx.devices.desktopOnly')}
                </Text>
            )}
        </Stack>
    );
};
