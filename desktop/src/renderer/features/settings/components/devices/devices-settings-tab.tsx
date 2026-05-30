import isElectron from 'is-electron';
import { useTranslation } from 'react-i18next';
import { DevicesPicker } from '/@/renderer/features/devices/components/devices-picker';
import { RemoteSettings } from '/@/renderer/features/settings/components/window/remote-settings';
import { useSettingsStoreActions } from '/@/renderer/store/settings.store';
import { Button } from '/@/shared/components/button/button';
import { Divider } from '/@/shared/components/divider/divider';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';

export const DevicesSettingsTab = () => {
    const { t } = useTranslation();
    const { setSettings } = useSettingsStoreActions();

    const openPersonalLibrary = () => {
        setSettings({ tab: 'advanced' });
    };

    return (
        <Stack gap="md">
            <Stack gap={4}>
                <Text fw={700} size="lg">
                    {t('page.setting.devices')}
                </Text>
                <Text c="dimmed" size="sm">
                    {t('productUx.devices.settingsIntro')}
                </Text>
            </Stack>

            {isElectron() ? (
                <DevicesPicker embedded />
            ) : (
                <Text c="dimmed" size="sm">
                    {t('productUx.devices.desktopOnly')}
                </Text>
            )}

            <Divider />

            {isElectron() && <RemoteSettings />}

            <Divider />

            <Stack gap="xs">
                <Text fw={600} size="sm">
                    {t('productUx.personalLibrary.settingsTab')}
                </Text>
                <Text c="dimmed" size="sm">
                    {t('productUx.devices.personalLibraryHint')}
                </Text>
                <Button onClick={openPersonalLibrary} variant="light">
                    {t('productUx.devices.openPersonalLibrarySetup')}
                </Button>
            </Stack>
        </Stack>
    );
};
