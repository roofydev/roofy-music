import isElectron from 'is-electron';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import styles from '/@/renderer/features/devices/components/connect-desktop-panel.module.css';
import { PhonePairingSection } from '/@/renderer/features/devices/components/phone-pairing-section';
import { usePhoneLink } from '/@/renderer/features/devices/hooks/use-phone-link';
import { openLinkPhoneModal } from '/@/renderer/features/devices/utils/open-link-phone-modal';
import { RemoteSettings } from '/@/renderer/features/settings/components/window/remote-settings';
import { Button } from '/@/shared/components/button/button';
import { Divider } from '/@/shared/components/divider/divider';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';

export const DevicesSettingsTab = () => {
    const { t } = useTranslation();
    const { busy, phoneLink } = usePhoneLink(4000);
    const [showConnectionCode, setShowConnectionCode] = useState(false);

    const phonePaired = Boolean(phoneLink.phonePaired);
    const phoneReachable = Boolean(phoneLink.phoneReachable);
    const phoneAvailable = phonePaired && phoneReachable && phoneLink.state === 'connected';
    const phoneName = phoneLink.phoneName || t('productUx.devices.yourPhone');

    const handleForgetPhone = () => {
        void window.api?.localFirst?.disconnectPhoneLink?.();
    };

    if (!isElectron()) {
        return (
            <Stack gap="lg">
                <Text fw={700} size="lg">
                    {t('page.setting.devices')}
                </Text>
                <Text c="dimmed" size="sm">
                    {t('productUx.devices.desktopOnly')}
                </Text>
            </Stack>
        );
    }

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

            <Stack className={styles.settingsCard} gap="sm">
                <Text fw={700} size="md">
                    {t('productUx.devices.importLibraryToPhone')}
                </Text>
                <Text c="dimmed" size="sm">
                    {t('productUx.devices.importLibrarySettingsHint')}
                </Text>
                <Button
                    disabled={busy}
                    onClick={() => setShowConnectionCode((open) => !open)}
                    size="compact-sm"
                    variant="filled"
                >
                    {showConnectionCode
                        ? t('productUx.devices.hideConnectionCode')
                        : t('productUx.devices.showConnectionCode')}
                </Button>
                {showConnectionCode && <PhonePairingSection pollMs={1000} startWhenMounted />}
            </Stack>

            <Stack className={styles.settingsCard} gap="sm">
                <Text fw={600} size="sm">
                    {t('productUx.devices.pairedPhoneTitle')}
                </Text>
                {phonePaired ? (
                    <>
                        <Text fw={600}>{phoneName}</Text>
                        <Text c="dimmed" size="sm">
                            {phoneAvailable
                                ? t('productUx.devices.phoneLinked')
                                : t('productUx.devices.phonePairedStale')}
                        </Text>
                        {phonePaired && !phoneReachable && (
                            <Text c="dimmed" size="sm">
                                {t('productUx.devices.phoneUnreachableHint')}
                            </Text>
                        )}
                        <Button onClick={handleForgetPhone} size="compact-sm" variant="light">
                            {t('productUx.devices.forgetPhone')}
                        </Button>
                    </>
                ) : (
                    <Text c="dimmed" size="sm">
                        {t('productUx.devices.phoneNotLinked')}
                    </Text>
                )}
                <Button
                    disabled={busy}
                    onClick={() => openLinkPhoneModal()}
                    size="compact-sm"
                    variant="light"
                >
                    {phonePaired
                        ? t('productUx.devices.showConnectionCode')
                        : t('productUx.devices.linkYourPhone')}
                </Button>
            </Stack>

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
        </Stack>
    );
};
