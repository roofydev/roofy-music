import isElectron from 'is-electron';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';

import styles from '/@/renderer/features/devices/components/devices-picker.module.css';
import { useListenOnHandoff } from '/@/renderer/features/devices/hooks/use-listen-on-handoff';
import {
    type DeviceConnectionState,
    useDevicesStatus,
} from '/@/renderer/features/devices/hooks/use-devices-status';
import { usePlayerStore } from '/@/renderer/store';
import { Icon } from '/@/shared/components/icon/icon';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';
import { PlayerStatus } from '/@/shared/types/types';

interface DeviceRowProps {
    active?: boolean;
    icon: 'arrowLeftRight' | 'disc';
    interactive?: boolean;
    onClick?: () => void;
    playingHere?: boolean;
    subtitle?: string;
    title: string;
}

const DeviceRow = ({
    active,
    icon,
    interactive,
    onClick,
    playingHere,
    subtitle,
    title,
}: DeviceRowProps) => (
    <button
        className={clsx(
            styles.row,
            interactive && styles.rowInteractive,
            active && styles.rowActive,
        )}
        disabled={!interactive}
        onClick={onClick}
        type="button"
    >
        <span className={styles.rowIcon}>
            <Icon icon={icon} size="md" />
        </span>
        <span className={styles.rowBody}>
            <div className={styles.rowTitle}>{title}</div>
            {subtitle && <div className={styles.rowSubtitle}>{subtitle}</div>}
        </span>
        <span className={styles.rowStatus}>
            {playingHere ? (
                <span aria-hidden className={styles.playingDot} />
            ) : active ? (
                <Icon color="success" icon="check" size="sm" />
            ) : (
                <Icon color="muted" icon="circle" size="sm" />
            )}
        </span>
    </button>
);

const phoneSubtitleKey = (state: DeviceConnectionState, phonePaired: boolean) => {
    if (phonePaired) {
        return 'productUx.devices.phoneLinked';
    }
    switch (state) {
        case 'connected':
            return 'productUx.devices.phoneReadyToScan';
        case 'starting':
            return 'productUx.devices.status.connecting';
        case 'unavailable':
            return 'productUx.devices.phoneLinkFailed';
        default:
            return 'productUx.devices.phoneNotLinked';
    }
};

interface DevicesPickerProps {
    embedded?: boolean;
    onClose?: () => void;
    onRequestLinkPhone?: () => void;
}

export const DevicesPicker = ({
    embedded = false,
    onClose,
    onRequestLinkPhone,
}: DevicesPickerProps) => {
    const { t } = useTranslation();
    const { status } = useDevicesStatus(4000);
    const { promptContinueOnPhone } = useListenOnHandoff();

    const phoneLinked = status.phoneLink.phonePaired;
    const currentSong = usePlayerStore((s) => s.getCurrentSong());
    const playerStatus = usePlayerStore((s) => s.player.status);
    const playingOnComputer = Boolean(currentSong) && playerStatus === PlayerStatus.PLAYING;
    const hasQueueOnComputer = Boolean(currentSong);

    const handlePhoneClick = () => {
        if (!phoneLinked) {
            onRequestLinkPhone?.();
            onClose?.();
            return;
        }

        if (hasQueueOnComputer) {
            promptContinueOnPhone();
            onClose?.();
            return;
        }

        promptContinueOnPhone();
    };

    const computerSubtitle = playingOnComputer
        ? t('productUx.devices.playingHere')
        : hasQueueOnComputer
          ? t('productUx.devices.pausedHere')
          : t('productUx.devices.thisComputerHint');

    const phoneSubtitle = phoneLinked
        ? hasQueueOnComputer
            ? t('productUx.devices.tapToSwitchOnPhone')
            : t('productUx.devices.phoneLinked')
        : t(phoneSubtitleKey(status.phoneLink.state, phoneLinked));

    return (
        <Stack className={styles.panel} gap="xs" p={embedded ? 0 : 'sm'}>
            {!embedded && (
                <Text fw={700} size="md">
                    {t('productUx.devices.listenOn')}
                </Text>
            )}

            <Stack gap={2}>
                <DeviceRow
                    active
                    icon="disc"
                    playingHere={playingOnComputer}
                    subtitle={computerSubtitle}
                    title={t('productUx.devices.thisComputer')}
                />

                {isElectron() && (
                    <DeviceRow
                        active={phoneLinked}
                        icon="arrowLeftRight"
                        interactive
                        onClick={handlePhoneClick}
                        subtitle={phoneSubtitle}
                        title={t('productUx.devices.yourPhone')}
                    />
                )}
            </Stack>
        </Stack>
    );
};
