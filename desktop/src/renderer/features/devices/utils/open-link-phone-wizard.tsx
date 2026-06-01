import { openLinkPhoneModal } from '/@/renderer/features/devices/utils/open-link-phone-modal';

/** @deprecated Use openLinkPhoneModal — opens QR setup only, not the Listen on sheet. */
export const openLinkPhoneWizard = (onClose?: () => void) => {
    openLinkPhoneModal(onClose);
};
