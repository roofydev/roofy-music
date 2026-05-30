import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import styles from '/@/renderer/features/devices/components/connect-desktop-panel.module.css';
import { DevicesPicker } from '/@/renderer/features/devices/components/devices-picker';
import { WebControlShare } from '/@/renderer/features/devices/components/web-control-share';
import { useEnableWebControl } from '/@/renderer/features/devices/hooks/use-enable-web-control';
import { usePhoneLink } from '/@/renderer/features/devices/hooks/use-phone-link';
import { AppRoute } from '/@/renderer/router/routes';
import { useSettingsStoreActions } from '/@/renderer/store';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Button } from '/@/shared/components/button/button';
import { Text } from '/@/shared/components/text/text';

const STUCK_STARTING_MS = 45_000;
const QR_SIZE = 168;

interface ConnectDesktopPanelProps {
    onClose?: () => void;
    opened: boolean;
}

export const ConnectDesktopPanel = ({ onClose, opened }: ConnectDesktopPanelProps) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { setSettings } = useSettingsStoreActions();
    const { setWebControlEnabled } = useEnableWebControl();
    const { busy, phoneLink, start } = usePhoneLink(1000);
    const [qrDataUrl, setQrDataUrl] = useState<null | string>(null);
    const [qrError, setQrError] = useState(false);
    const [stuckTimedOut, setStuckTimedOut] = useState(false);
    const [startAttempted, setStartAttempted] = useState(false);
    const startingSinceRef = useRef<null | number>(null);

    const qrReady = Boolean(phoneLink.pairingUrl);
    const showError =
        phoneLink.state === 'unavailable' ||
        stuckTimedOut ||
        (startAttempted && !busy && !qrReady && phoneLink.state === 'disabled');

    const openDevicesSettings = () => {
        setSettings({ tab: 'devices' });
        navigate(AppRoute.SETTINGS);
        onClose?.();
    };

    useEffect(() => {
        if (!opened) return;

        let cancelled = false;
        void (async () => {
            setStartAttempted(true);
            await setWebControlEnabled(true);
            if (!cancelled) {
                await start('auto');
            }
        })();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- prepare link when popover opens
    }, [opened]);

    useEffect(() => {
        if (phoneLink.state === 'starting') {
            if (!startingSinceRef.current) {
                startingSinceRef.current = Date.now();
            }
            return;
        }
        startingSinceRef.current = null;
        setStuckTimedOut(false);
    }, [phoneLink.state]);

    useEffect(() => {
        if (!startAttempted || qrReady || phoneLink.state !== 'starting') {
            return;
        }

        const id = window.setInterval(() => {
            const since = startingSinceRef.current;
            if (!since) return;
            if (Date.now() - since >= STUCK_STARTING_MS) {
                setStuckTimedOut(true);
            }
        }, 1000);

        return () => window.clearInterval(id);
    }, [phoneLink.state, qrReady, startAttempted]);

    useEffect(() => {
        const pairingUrl = phoneLink.pairingUrl;
        if (!pairingUrl) {
            setQrDataUrl(null);
            setQrError(false);
            return;
        }

        let cancelled = false;
        import('qrcode')
            .then(({ default: QRCode }) =>
                QRCode.toDataURL(pairingUrl, {
                    color: { dark: '#111111', light: '#ffffff' },
                    errorCorrectionLevel: 'M',
                    margin: 1,
                    width: QR_SIZE,
                }),
            )
            .then((dataUrl) => {
                if (!cancelled) {
                    setQrDataUrl(dataUrl);
                    setQrError(false);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setQrDataUrl(null);
                    setQrError(true);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [phoneLink.pairingUrl]);

    const copyLink = async () => {
        if (!phoneLink.pairingUrl) return;
        await navigator.clipboard.writeText(phoneLink.pairingUrl);
    };

    const handleRetry = () => {
        setStuckTimedOut(false);
        startingSinceRef.current = null;
        void (async () => {
            await setWebControlEnabled(true);
            await start('auto');
        })();
    };

    const handleLanOnly = () => {
        setStuckTimedOut(false);
        startingSinceRef.current = null;
        void start('lan');
    };

    return (
        <div className={styles.panel}>
            <header className={styles.header}>
                <span className={styles.headerSide} aria-hidden />
                <Text className={styles.headerTitle} fw={700} size="sm">
                    {t('productUx.devices.connectPanel.title')}
                </Text>
                <span className={styles.headerSide}>
                    <ActionIcon
                        icon="settings2"
                        onClick={openDevicesSettings}
                        size="sm"
                        tooltip={{ label: t('productUx.devices.manageDevices'), openDelay: 0 }}
                        variant="subtle"
                    />
                </span>
            </header>

            <p className={styles.subtitle}>{t('productUx.devices.connectPanel.subtitle')}</p>

            {phoneLink.phonePaired && (
                <p className={styles.pairedBadge}>{t('productUx.devices.connectPanel.phoneConnected')}</p>
            )}

            {showError && (
                <p className={styles.error}>
                    {phoneLink.error || t('productUx.devices.linkWizard.errorBody')}
                </p>
            )}

            <div className={styles.qrWrap}>
                {qrDataUrl ? (
                    <div className={styles.qrFrame}>
                        <img
                            alt={t('productUx.devices.connectPanel.qrAlt')}
                            className={styles.qrImage}
                            src={qrDataUrl}
                        />
                    </div>
                ) : (
                    <div className={styles.qrPlaceholder}>
                        {qrError
                            ? t('productUx.devices.linkWizard.qrFailed')
                            : busy || phoneLink.state === 'starting'
                              ? t('productUx.devices.linkWizard.preparing')
                              : t('productUx.devices.linkWizard.preparing')}
                    </div>
                )}
            </div>

            <p className={styles.hint}>
                {qrReady
                    ? t('productUx.devices.connectPanel.scanHint')
                    : t('productUx.devices.connectPanel.waitingForCode')}
            </p>

            <div className={styles.actions}>
                <Button
                    classNames={{ label: styles.actionLabel, root: styles.actionButton }}
                    disabled={!phoneLink.pairingUrl}
                    onClick={() => copyLink()}
                    size="compact-sm"
                    variant="default"
                >
                    {t('productUx.devices.linkWizard.copyLink')}
                </Button>
                {showError && (
                    <>
                        <Button
                            classNames={{ label: styles.actionLabel, root: styles.actionButton }}
                            disabled={busy}
                            onClick={handleRetry}
                            size="compact-sm"
                        >
                            {t('productUx.error.recovery.tryAgain')}
                        </Button>
                        <Button
                            classNames={{ label: styles.actionLabel, root: styles.actionButton }}
                            disabled={busy}
                            onClick={handleLanOnly}
                            size="compact-sm"
                            variant="light"
                        >
                            {t('productUx.devices.linkWizard.sameWifiOnly')}
                        </Button>
                    </>
                )}
            </div>

            {phoneLink.phonePaired && (
                <>
                    <DevicesPicker embedded onClose={onClose} />
                    <WebControlShare compact />
                </>
            )}
        </div>
    );
};
