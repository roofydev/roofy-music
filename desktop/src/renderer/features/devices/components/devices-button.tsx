import clsx from 'clsx';
import isElectron from 'is-electron';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import panelStyles from '/@/renderer/features/devices/components/connect-desktop-panel.module.css';
import popoverStyles from '/@/shared/components/popover/popover.module.css';
import { ConnectDesktopPanel } from '/@/renderer/features/devices/components/connect-desktop-panel';
import { useDevicesStatus } from '/@/renderer/features/devices/hooks/use-devices-status';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Popover } from '/@/shared/components/popover/popover';

export const DevicesButton = () => {
    const { t } = useTranslation();
    const [opened, setOpened] = useState(false);
    const { status } = useDevicesStatus();

    const phoneAvailable =
        Boolean(status.phoneLink.phonePaired) &&
        Boolean(status.phoneLink.phoneReachable) &&
        status.phoneLink.state === 'connected';
    const phoneControllingDesktop = Boolean(status.phoneLink.phoneControllingDesktop);

    if (!isElectron()) {
        return null;
    }

    return (
        <Popover
            middlewares={{ flip: true, shift: { padding: 8 } }}
            offset={12}
            onChange={setOpened}
            opened={opened}
            position="top"
            shadow="md"
        >
            <Popover.Target>
                <ActionIcon
                    aria-label={t('productUx.devices.listenOn')}
                    icon="arrowLeftRight"
                    iconProps={{
                        color: phoneAvailable || phoneControllingDesktop ? 'primary' : undefined,
                        size: 'lg',
                    }}
                    onClick={(e) => {
                        e.stopPropagation();
                        setOpened((value) => !value);
                    }}
                    size="sm"
                    tooltip={{
                        label: t('productUx.devices.listenOn'),
                        openDelay: 0,
                    }}
                    variant="subtle"
                />
            </Popover.Target>
            <Popover.Dropdown
                classNames={{
                    dropdown: clsx(popoverStyles.dropdown, panelStyles.popoverDropdown),
                }}
                onClick={(e) => e.stopPropagation()}
                p={0}
            >
                <ConnectDesktopPanel onClose={() => setOpened(false)} opened={opened} />
            </Popover.Dropdown>
        </Popover>
    );
};
