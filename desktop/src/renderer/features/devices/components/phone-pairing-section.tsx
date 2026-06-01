import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import styles from '/@/renderer/features/devices/components/connect-desktop-panel.module.css';
import { usePhoneLink } from '/@/renderer/features/devices/hooks/use-phone-link';
import { Button } from '/@/shared/components/button/button';

const STUCK_STARTING_MS = 45_000;
const QR_SIZE = 168;

interface PhonePairingSectionProps {
    /** When set, scrolls the QR into view (e.g. after tapping Your phone). */
    focusNonce?: number;
    onPairingReady?: () => void;
    pollMs?: number;
    startWhenMounted?: boolean;
}

export const PhonePairingSection = ({
    focusNonce = 0,
    onPairingReady,
    pollMs = 0,
    startWhenMounted = true,
}: PhonePairingSectionProps) => {
    const { t } = useTranslation();
    const { busy, phoneLink, start } = usePhoneLink(pollMs);
    const [qrDataUrl, setQrDataUrl] = useState<null | string>(null);
    const [qrError, setQrError] = useState(false);
    const [stuckTimedOut, setStuckTimedOut] = useState(false);
    const [startAttempted, setStartAttempted] = useState(false);
    const startingSinceRef = useRef<null | number>(null);
    const qrWrapRef = useRef<HTMLDivElement>(null);

    const phoneReachable = Boolean(phoneLink.phoneReachable);
    const phoneAvailable =
        Boolean(phoneLink.phonePaired) && phoneReachable && phoneLink.state === 'connected';
    const phoneStalePaired = Boolean(phoneLink.phonePaired) && !phoneReachable;
    const qrReady = Boolean(phoneLink.pairingUrl);
    const showError =
        phoneLink.state === 'unavailable' ||
        stuckTimedOut ||
        (startAttempted && !busy && !qrReady && phoneLink.state === 'disabled');

    useEffect(() => {
        if (!startWhenMounted) return;

        let cancelled = false;
        void (async () => {
            setStartAttempted(true);
            if (!cancelled) {
                await start('auto');
            }
        })();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- start tunnels when section mounts
    }, [startWhenMounted]);

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
                    onPairingReady?.();
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
    }, [onPairingReady, phoneLink.pairingUrl]);

    useEffect(() => {
        if (!focusNonce) return;
        qrWrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, [focusNonce]);

    const copyLink = async () => {
        if (!phoneLink.pairingUrl) return;
        await navigator.clipboard.writeText(phoneLink.pairingUrl);
    };

    const handleRetry = () => {
        setStuckTimedOut(false);
        startingSinceRef.current = null;
        void start('auto');
    };

    const handleLanOnly = () => {
        setStuckTimedOut(false);
        startingSinceRef.current = null;
        void start('lan');
    };

    const handleForgetPhone = () => {
        void window.api?.localFirst?.disconnectPhoneLink?.().then(() => start('auto'));
    };

    return (
        <>
            {phoneAvailable ? (
                <p className={styles.pairedBadge}>
                    {t('productUx.devices.connectPanel.phoneConnected')}
                </p>
            ) : phoneStalePaired ? (
                <p className={styles.staleBadge}>
                    {t('productUx.devices.connectPanel.phoneNotReachable')}
                </p>
            ) : null}

            <p className={styles.subtitle}>
                {phoneStalePaired
                    ? t('productUx.devices.connectPanel.pairedStaleSubtitle')
                    : phoneAvailable
                      ? t('productUx.devices.connectPanel.importAgainSubtitle')
                      : t('productUx.devices.connectPanel.subtitle')}
            </p>

            {showError && (
                <p className={styles.error}>
                    {phoneLink.error || t('productUx.devices.linkWizard.errorBody')}
                </p>
            )}

            <div className={styles.qrWrap} ref={qrWrapRef}>
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
                    ? t('productUx.devices.linkWizard.importScanHint')
                    : t('productUx.devices.linkWizard.preparing')}
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
                {phoneLink.phonePaired && (
                    <Button
                        classNames={{ label: styles.actionLabel, root: styles.actionButton }}
                        onClick={handleForgetPhone}
                        size="compact-sm"
                        variant="light"
                    >
                        {t('productUx.devices.connectPanel.forgetPhone')}
                    </Button>
                )}
                {showError && (
                    <>
                        <Button
                            classNames={{
                                label: styles.actionLabel,
                                root: styles.actionButton,
                            }}
                            disabled={busy}
                            onClick={handleRetry}
                            size="compact-sm"
                        >
                            {t('productUx.error.recovery.tryAgain')}
                        </Button>
                        <Button
                            classNames={{
                                label: styles.actionLabel,
                                root: styles.actionButton,
                            }}
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
        </>
    );
};

export const usePhoneSessionActive = (pollMs = 4000) => {
    const { phoneLink } = usePhoneLink(pollMs);
    return Boolean(phoneLink.phonePaired) && phoneLink.state === 'connected';
};
