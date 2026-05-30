import isElectron from 'is-electron';
import { useTranslation } from 'react-i18next';

import { DevicesPicker } from '/@/renderer/features/devices/components/devices-picker';
import { RemoteSettings } from '/@/renderer/features/settings/components/window/remote-settings';
import { Divider } from '/@/shared/components/divider/divider';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';

export const DevicesSettingsTab = () => {
    const { t } = useTranslation();

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
                    <DevicesPicker embedded />
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
