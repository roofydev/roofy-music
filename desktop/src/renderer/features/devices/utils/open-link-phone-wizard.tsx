import { openModal } from '@mantine/modals';

import { ConnectDesktopPanel } from '/@/renderer/features/devices/components/connect-desktop-panel';

export const openLinkPhoneWizard = (onClose?: () => void) => {
    openModal({
        children: <ConnectDesktopPanel onClose={onClose} opened />,
        centered: true,
        onClose,
        padding: 0,
        size: 'auto',
        title: null,
        withCloseButton: true,
    });
};
