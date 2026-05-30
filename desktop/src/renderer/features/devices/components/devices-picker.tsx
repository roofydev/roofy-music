import isElectron from 'is-electron';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import {
    type DeviceConnectionState,
    useDevicesStatus,
} from '/@/renderer/features/devices/hooks/use-devices-status';
import { AppRoute } from '/@/renderer/router/routes';
import { useSettingsStoreActions } from '/@/renderer/store/settings.store';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Badge } from '/@/shared/components/badge/badge';
import { Button } from '/@/shared/components/button/button';
import { Group } from '/@/shared/components/group/group';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';

const stateColor = (state: DeviceConnectionState) => {
    switch (state) {
        case 'connected':
            return 'green';
        case 'starting':
            return 'yellow';
        case 'unavailable':
            return 'red';
        default:
            return 'gray';
    }
};

const stateLabelKey = (state: DeviceConnectionState) => {
    switch (state) {
        case 'connected':
            return 'productUx.devices.status.connected';
        case 'starting':
            return 'productUx.devices.status.connecting';
        case 'unavailable':
            return 'productUx.devices.status.unavailable';
        default:
            return 'productUx.devices.status.notConnected';
    }
};

interface DevicesPickerProps {
    embedded?: boolean;
    onClose?: () => void;
}

export const DevicesPicker = ({ embedded = false, onClose }: DevicesPickerProps) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { setSettings } = useSettingsStoreActions();
    const { refresh, status } = useDevicesStatus(4000);

    const openDevicesSettings = () => {
        setSettings({ tab: 'devices' });
        navigate(AppRoute.SETTINGS);
        onClose?.();
    };

    const openPersonalLibrarySettings = () => {
        setSettings({ tab: 'advanced' });
        navigate(AppRoute.SETTINGS);
        onClose?.();
    };

    const openWebRemote = () => {
        if (status.webRemote.enabled) {
            window.open(status.webRemote.url, '_blank', 'noopener,noreferrer');
        } else {
            openDevicesSettings();
        }
        onClose?.();
    };

    return (
        <Stack gap="md" p={embedded ? 0 : 'sm'} w={embedded ? '100%' : 320}>
            {!embedded && (
                <Group justify="space-between" wrap="nowrap">
                    <Text fw={700} size="md">
                        {t('page.setting.devices')}
                    </Text>
                    <ActionIcon
                        icon="refresh"
                        onClick={() => refresh()}
                        size="sm"
                        tooltip={{ label: t('common.refresh'), openDelay: 0 }}
                        variant="subtle"
                    />
                </Group>
            )}

            <Stack gap="xs">
                <Group justify="space-between" wrap="nowrap">
                    <Stack gap={2}>
                        <Text fw={600} size="sm">
                            {t('productUx.devices.thisComputer')}
                        </Text>
                        <Text isMuted size="xs">
                            {t('productUx.devices.thisComputerHint')}
                        </Text>
                    </Stack>
                    <Badge color="green">{t('productUx.devices.status.active')}</Badge>
                </Group>
            </Stack>

            {isElectron() && (
                <>
                    <Stack gap="xs">
                        <Group justify="space-between" wrap="nowrap">
                            <Stack gap={2}>
                                <Text fw={600} size="sm">
                                    {t('productUx.devices.phone')}
                                </Text>
                                <Text isMuted size="xs">
                                    {t('productUx.devices.phoneHint')}
                                </Text>
                            </Stack>
                            <Badge color={stateColor(status.pairing.state)}>
                                {t(stateLabelKey(status.pairing.state))}
                            </Badge>
                        </Group>
                        {status.pairing.error && (
                            <Text size="xs" style={{ color: 'var(--roofy-error-color, #fa5252)' }}>
                                {status.pairing.error}
                            </Text>
                        )}
                    </Stack>

                    <Stack gap="xs">
                        <Group justify="space-between" wrap="nowrap">
                            <Stack gap={2}>
                                <Text fw={600} size="sm">
                                    {t('productUx.devices.phoneImports')}
                                </Text>
                                <Text isMuted size="xs">
                                    {t('productUx.devices.phoneImportsHint')}
                                </Text>
                            </Stack>
                            <Badge color={stateColor(status.mobileImport.state)}>
                                {t(stateLabelKey(status.mobileImport.state))}
                            </Badge>
                        </Group>
                    </Stack>
                </>
            )}

            <Stack gap="xs">
                <Group justify="space-between" wrap="nowrap">
                    <Stack gap={2}>
                        <Text fw={600} size="sm">
                            {t('productUx.devices.webRemote')}
                        </Text>
                        <Text isMuted size="xs">
                            {status.webRemote.enabled
                                ? status.webRemote.url
                                : t('productUx.devices.webRemoteOff')}
                        </Text>
                    </Stack>
                    <Badge color={status.webRemote.enabled ? 'green' : 'gray'}>
                        {status.webRemote.enabled
                            ? t('productUx.devices.status.connected')
                            : t('productUx.devices.status.notConnected')}
                    </Badge>
                </Group>
                <Button onClick={openWebRemote} size="compact-sm" variant="light">
                    {status.webRemote.enabled
                        ? t('productUx.devices.openWebRemote')
                        : t('productUx.devices.enableWebRemote')}
                </Button>
            </Stack>

            <Stack gap="xs">
                <Group justify="space-between" wrap="nowrap">
                    <Stack gap={2}>
                        <Text fw={600} size="sm">
                            {t('productUx.devices.castTitle')}
                        </Text>
                        <Text isMuted size="xs">
                            {t('productUx.devices.castHint')}
                        </Text>
                    </Stack>
                    <Badge variant="light">{t('productUx.devices.comingSoon')}</Badge>
                </Group>
            </Stack>

            <Stack gap="xs">
                <Text fw={600} size="sm">
                    {t('productUx.action.continueOnDevice')}
                </Text>
                <Text isMuted size="xs">
                    {t('productUx.devices.handoffHint')}
                </Text>
            </Stack>

            {!embedded && (
                <Group gap="xs" grow>
                    <Button onClick={openDevicesSettings} size="compact-sm" variant="filled">
                        {t('productUx.devices.manageDevices')}
                    </Button>
                    {isElectron() && (
                        <Button
                            onClick={openPersonalLibrarySettings}
                            size="compact-sm"
                            variant="default"
                        >
                            {t('productUx.personalLibrary.settingsTab')}
                        </Button>
                    )}
                </Group>
            )}
        </Stack>
    );
};
