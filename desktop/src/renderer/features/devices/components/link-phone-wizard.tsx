import { closeAllModals } from '@mantine/modals';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePhoneLink } from '/@/renderer/features/devices/hooks/use-phone-link';
import { Button } from '/@/shared/components/button/button';
import { Group } from '/@/shared/components/group/group';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';

const STUCK_STARTING_MS = 45_000;

interface LinkPhoneWizardProps {
    onClose?: () => void;
}

export const LinkPhoneWizard = ({ onClose }: LinkPhoneWizardProps) => {
    const { t } = useTranslation();
    const { busy, phoneLink, refresh, start } = usePhoneLink(1000);
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

    useEffect(() => {
        void (async () => {
            setStartAttempted(true);
            await start('auto');
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
    }, []);

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
                    errorCorrectionLevel: 'M',
                    margin: 2,
                    width: 260,
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

    const handleClose = () => {
        onClose?.();
        closeAllModals();
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

    return (
        <Stack align="center" gap="md" p="md" w={340}>
            <Stack align="center" gap={6} w="100%">
                <Text fw={700} size="lg" ta="center">
                    {t('productUx.devices.linkWizard.title')}
                </Text>
                <Text isMuted size="sm" ta="center">
                    {qrReady
                        ? t('productUx.devices.linkWizard.scanHint')
                        : t('productUx.devices.linkWizard.body')}
                </Text>
            </Stack>

            {showError && (
                <Text
                    size="sm"
                    style={{ color: 'var(--roofy-error-color, #fa5252)' }}
                    ta="center"
                >
                    {phoneLink.error || t('productUx.devices.linkWizard.errorBody')}
                </Text>
            )}

            {qrDataUrl ? (
                <img
                    alt={t('productUx.devices.linkWizard.qrAlt')}
                    height={260}
                    src={qrDataUrl}
                    style={{ borderRadius: 8 }}
                    width={260}
                />
            ) : (
                <Stack
                    align="center"
                    gap="xs"
                    justify="center"
                    style={{
                        border: '1px solid var(--mantine-color-gray-4)',
                        borderRadius: 8,
                        height: 260,
                        width: 260,
                    }}
                >
                    <Text isMuted size="sm" ta="center">
                        {qrError
                            ? t('productUx.devices.linkWizard.qrFailed')
                            : busy || phoneLink.state === 'starting'
                              ? t('productUx.devices.linkWizard.preparing')
                              : t('productUx.devices.linkWizard.preparing')}
                    </Text>
                </Stack>
            )}

            {qrReady && (
                <Text isMuted size="xs" ta="center">
                    {t('productUx.devices.linkWizard.waiting')}
                </Text>
            )}

            <Group grow w="100%">
                <Button
                    disabled={!phoneLink.pairingUrl}
                    onClick={() => copyLink()}
                    size="compact-sm"
                    variant="default"
                >
                    {t('productUx.devices.linkWizard.copyLink')}
                </Button>
                {showError && (
                    <>
                        <Button disabled={busy} onClick={handleRetry} size="compact-sm" variant="filled">
                            {t('productUx.error.recovery.tryAgain')}
                        </Button>
                        <Button disabled={busy} onClick={handleLanOnly} size="compact-sm" variant="light">
                            {t('productUx.devices.linkWizard.sameWifiOnly')}
                        </Button>
                    </>
                )}
            </Group>

            <Button onClick={handleClose} variant="subtle">
                {t('common.close')}
            </Button>
        </Stack>
    );
};
