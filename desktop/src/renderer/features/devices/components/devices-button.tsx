import isElectron from 'is-electron';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DevicesPicker } from '/@/renderer/features/devices/components/devices-picker';
import { useDevicesStatus } from '/@/renderer/features/devices/hooks/use-devices-status';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Popover } from '/@/shared/components/popover/popover';

export const DevicesButton = () => {
    const { t } = useTranslation();
    const [opened, setOpened] = useState(false);
    const { status } = useDevicesStatus();

    const hasActiveConnection =
        status.pairing.state === 'connected' ||
        status.mobileImport.state === 'connected' ||
        status.webRemote.enabled;

    if (!isElectron()) {
        return null;
    }

    return (
        <Popover
            onChange={setOpened}
            opened={opened}
            position="top-end"
            shadow="md"
            width={340}
            withArrow
        >
            <Popover.Target>
                <ActionIcon
                    icon="arrowLeftRight"
                    iconProps={{
                        color: hasActiveConnection ? 'primary' : undefined,
                        size: 'lg',
                    }}
                    onClick={(e) => {
                        e.stopPropagation();
                        setOpened((value) => !value);
                    }}
                    size="sm"
                    tooltip={{
                        label: t('page.setting.devices'),
                        openDelay: 0,
                    }}
                    variant="subtle"
                />
            </Popover.Target>
            <Popover.Dropdown onClick={(e) => e.stopPropagation()}>
                <DevicesPicker onClose={() => setOpened(false)} />
            </Popover.Dropdown>
        </Popover>
    );
};
