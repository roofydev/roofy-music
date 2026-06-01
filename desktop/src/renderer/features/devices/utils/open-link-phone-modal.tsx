import { openModal } from '@mantine/modals';

import { LinkPhoneModal } from '/@/renderer/features/devices/components/link-phone-modal';

export const openLinkPhoneModal = (onClose?: () => void) => {
    openModal({
        children: <LinkPhoneModal onClose={onClose} />,
        centered: true,
        onClose,
        padding: 0,
        size: 420,
        title: null,
        withCloseButton: true,
    });
};
