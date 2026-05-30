import isElectron from 'is-electron';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import styles from '/@/renderer/features/devices/components/devices-picker.module.css';
import { useRemoteSettings } from '/@/renderer/store';
import { Button } from '/@/shared/components/button/button';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';

interface WebControlShareProps {
    compact?: boolean;
}

export const WebControlShare = ({ compact = false }: WebControlShareProps) => {
    const { t } = useTranslation();
    const remote = useRemoteSettings();
    const [primaryUrl, setPrimaryUrl] = useState('');
    const [qrDataUrl, setQrDataUrl] = useState<null | string>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!remote.enabled || !isElectron() || !window.api?.remote?.getRemoteControlLinks) {
            setPrimaryUrl('');
            setQrDataUrl(null);
            return;
        }

        let cancelled = false;
        setLoading(true);

        window.api.remote
            .getRemoteControlLinks()
            .then((links) => {
                if (cancelled) return;
                setPrimaryUrl(links.primary);
            })
            .finally(() => {
                if (!cancelled) {
                    setLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [remote.enabled, remote.password, remote.port]);

    useEffect(() => {
        if (!primaryUrl) {
            setQrDataUrl(null);
            return;
        }

        let cancelled = false;
        import('qrcode')
            .then(({ default: QRCode }) =>
                QRCode.toDataURL(primaryUrl, {
                    errorCorrectionLevel: 'M',
                    margin: 2,
                    width: compact ? 160 : 200,
                }),
            )
            .then((dataUrl) => {
                if (!cancelled) {
                    setQrDataUrl(dataUrl);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setQrDataUrl(null);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [compact, primaryUrl]);

    const copyLink = async () => {
        if (!primaryUrl) return;
        await navigator.clipboard.writeText(primaryUrl);
    };

    const openBrowser = () => {
        if (!primaryUrl) return;
        window.open(primaryUrl, '_blank', 'noopener,noreferrer');
    };

    if (!remote.enabled) {
        return null;
    }

    return (
        <Stack align="center" gap="sm" w="100%">
            <Text className={styles.hint} ta="center">
                {t('productUx.devices.webControlShareHint')}
            </Text>

            {qrDataUrl ? (
                <img
                    alt={t('productUx.devices.webControlQrAlt')}
                    height={compact ? 160 : 200}
                    src={qrDataUrl}
                    style={{ borderRadius: 8 }}
                    width={compact ? 160 : 200}
                />
            ) : (
                <Text isMuted size="sm" ta="center">
                    {loading
                        ? t('productUx.devices.webControlPreparing')
                        : t('productUx.devices.webControlQrFailed')}
                </Text>
            )}

            <Stack gap="xs" w="100%">
                <Button
                    disabled={!primaryUrl}
                    onClick={openBrowser}
                    size="compact-sm"
                    variant="filled"
                >
                    {t('productUx.devices.openWebControl')}
                </Button>
                <Button
                    disabled={!primaryUrl}
                    onClick={() => copyLink()}
                    size="compact-sm"
                    variant="default"
                >
                    {t('productUx.devices.webControlCopyLink')}
                </Button>
            </Stack>
        </Stack>
    );
};
