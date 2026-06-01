import { closeAllModals } from '@mantine/modals';
import { useTranslation } from 'react-i18next';

import styles from '/@/renderer/features/devices/components/connect-desktop-panel.module.css';
import { PhonePairingSection } from '/@/renderer/features/devices/components/phone-pairing-section';
import { Text } from '/@/shared/components/text/text';

interface LinkPhoneModalProps {
    onClose?: () => void;
}

export const LinkPhoneModal = ({ onClose }: LinkPhoneModalProps) => {
    const { t } = useTranslation();

    const handleClose = () => {
        onClose?.();
        closeAllModals();
    };

    return (
        <div className={styles.linkModal}>
            <Text className={styles.linkModalTitle} fw={700} size="lg" ta="center">
                {t('productUx.devices.linkWizard.importTitle')}
            </Text>
            <PhonePairingSection pollMs={1000} startWhenMounted />
            <button className={styles.linkModalClose} onClick={handleClose} type="button">
                {t('common.close')}
            </button>
        </div>
    );
};
