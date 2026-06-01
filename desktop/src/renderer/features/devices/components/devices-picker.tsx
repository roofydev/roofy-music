import clsx from 'clsx';
import isElectron from 'is-electron';
import { useTranslation } from 'react-i18next';

import styles from '/@/renderer/features/devices/components/devices-picker.module.css';
import {
    type DeviceConnectionState,
    useDevicesStatus,
} from '/@/renderer/features/devices/hooks/use-devices-status';
import { useListenOnHandoff } from '/@/renderer/features/devices/hooks/use-listen-on-handoff';
import { usePlayerStore } from '/@/renderer/store';
import { Icon } from '/@/shared/components/icon/icon';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';
import { PlayerStatus } from '/@/shared/types/types';

interface DeviceRowProps {
    active?: boolean;
    icon: 'appWindow' | 'arrowLeftRight' | 'disc' | 'plus';
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
                <Icon color="muted" icon="arrowRightS" size="sm" />
            )}
        </span>
    </button>
);

const phoneSubtitleKey = (state: DeviceConnectionState, phonePaired: boolean) => {
    if (state === 'connected') {
        return 'productUx.devices.phoneLinked';
    }
    if (phonePaired) {
        return 'productUx.devices.phonePairedStale';
    }
    switch (state) {
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
    onLinkPhone?: () => void;
    onOpenDeviceSettings?: () => void;
}

export const DevicesPicker = ({
    embedded = false,
    onClose,
    onLinkPhone,
    onOpenDeviceSettings,
}: DevicesPickerProps) => {
    const { t } = useTranslation();
    const { status } = useDevicesStatus(4000);
    const { promptContinueOnPhone } = useListenOnHandoff();

    const phonePaired = Boolean(status.phoneLink.phonePaired);
    const phoneReachable = Boolean(status.phoneLink.phoneReachable);
    const phoneAvailable = phonePaired && phoneReachable && status.phoneLink.state === 'connected';
    const phoneControllingDesktop = Boolean(status.phoneLink.phoneControllingDesktop);
    const activeOutput = status.phoneLink.activeOutput;
    const phoneName = status.phoneLink.phoneName || t('productUx.devices.yourPhone');
    const currentSong = usePlayerStore((s) => s.getCurrentSong());
    const playerStatus = usePlayerStore((s) => s.player.status);
    const playingOnComputer =
        Boolean(currentSong) && playerStatus === PlayerStatus.PLAYING && activeOutput !== 'phone';
    const hasQueueOnComputer = Boolean(currentSong);
    const playingOnPhone = activeOutput === 'phone' && !playingOnComputer;

    const statusDeviceName = playingOnPhone
        ? phoneName
        : playingOnComputer || hasQueueOnComputer
          ? t('productUx.devices.thisComputer')
          : t('productUx.devices.thisComputer');

    const handlePhoneClick = () => {
        if (!phonePaired) {
            onLinkPhone?.();
            return;
        }

        if (!phoneAvailable) {
            onLinkPhone?.();
            return;
        }

        promptContinueOnPhone();
        onClose?.();
    };

    const computerSubtitle = playingOnComputer
        ? t('productUx.devices.playingHere')
        : hasQueueOnComputer
          ? t('productUx.devices.pausedHere')
          : phoneControllingDesktop
            ? t('productUx.devices.canControlComputer')
            : t('productUx.devices.thisComputerHint');

    const phoneSubtitle = playingOnPhone
        ? t('productUx.devices.playingHere')
        : phoneControllingDesktop
          ? t('productUx.devices.canControlComputer')
          : phoneAvailable
            ? t('productUx.devices.phoneLinked')
            : phonePaired && !phoneReachable
              ? t('productUx.devices.phonePairedStale')
              : phonePaired
                ? t(phoneSubtitleKey(status.phoneLink.state, phonePaired))
                : t('productUx.devices.addPhoneHint');

    return (
        <Stack className={styles.panel} gap="xs" p={embedded ? 0 : 'sm'}>
            {!embedded && (
                <Text fw={700} size="md">
                    {t('productUx.devices.listenOn')}
                </Text>
            )}

            <Text className={styles.statusLine}>
                {t('productUx.devices.playingOn', { device: statusDeviceName })}
            </Text>

            {phoneControllingDesktop && (
                <div className={styles.controlBanner}>
                    <Icon color="success" icon="appWindow" size="sm" />
                    <div>
                        <div className={styles.controlBannerTitle}>
                            {t('productUx.devices.phoneControlBannerTitle', { device: phoneName })}
                        </div>
                        <div className={styles.controlBannerSubtitle}>
                            {t('productUx.devices.phoneControlBannerSubtitle')}
                        </div>
                    </div>
                </div>
            )}

            <Stack gap={2}>
                <DeviceRow
                    active={!playingOnPhone && (playingOnComputer || phoneControllingDesktop)}
                    icon="disc"
                    interactive={phoneControllingDesktop}
                    onClick={
                        phoneControllingDesktop
                            ? () => {
                                  promptContinueOnPhone();
                                  onClose?.();
                              }
                            : undefined
                    }
                    playingHere={playingOnComputer}
                    subtitle={computerSubtitle}
                    title={t('productUx.devices.thisComputer')}
                />

                {isElectron() && phonePaired && (
                    <DeviceRow
                        icon="arrowLeftRight"
                        interactive
                        onClick={handlePhoneClick}
                        playingHere={playingOnPhone}
                        subtitle={phoneSubtitle}
                        title={phoneName}
                    />
                )}

                {isElectron() && !phonePaired && (
                    <DeviceRow
                        icon="plus"
                        interactive
                        onClick={() => onLinkPhone?.()}
                        subtitle={t('productUx.devices.addPhoneHint')}
                        title={t('productUx.devices.linkPhone')}
                    />
                )}
            </Stack>

            {isElectron() && phonePaired && (
                <button
                    className={styles.libraryAction}
                    onClick={() => onLinkPhone?.()}
                    type="button"
                >
                    <span className={styles.libraryActionIcon}>
                        <Icon icon="arrowLeftRight" size="sm" />
                    </span>
                    <span className={styles.libraryActionBody}>
                        <span className={styles.libraryActionTitle}>
                            {t('productUx.devices.importLibraryToPhone')}
                        </span>
                        <span className={styles.libraryActionSubtitle}>
                            {t('productUx.devices.importLibraryToPhoneHint')}
                        </span>
                    </span>
                </button>
            )}

            {onOpenDeviceSettings && (
                <button className={styles.footerLink} onClick={onOpenDeviceSettings} type="button">
                    {t('productUx.devices.manageDevices')}
                </button>
            )}
        </Stack>
    );
};
