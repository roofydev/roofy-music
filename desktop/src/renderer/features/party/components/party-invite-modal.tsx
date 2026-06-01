import { useEffect, useState } from 'react';
import { Button, Modal, Text } from '@mantine/core';
import { RiCheckLine, RiFileCopyLine } from 'react-icons/ri';

import { usePartyActions } from '/@/renderer/features/party/hooks/use-party-actions';
import styles from '/@/renderer/features/party/party-dashboard.module.css';

interface PartyInviteModalProps {
    joinUrl: string;
    onClose: () => void;
    opened: boolean;
    roomCode: string;
}

export const PartyInviteModal = ({ joinUrl, onClose, opened, roomCode }: PartyInviteModalProps) => {
    const { copyLink } = usePartyActions();
    const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
    const [qrError, setQrError] = useState(false);
    const [copiedLink, setCopiedLink] = useState(false);
    const [copiedCode, setCopiedCode] = useState(false);

    useEffect(() => {
        if (!opened) {
            setQrDataUrl(null);
            setQrError(false);
            setCopiedLink(false);
            setCopiedCode(false);
            return;
        }

        let cancelled = false;

        import('qrcode')
            .then(({ default: QRCode }) =>
                QRCode.toDataURL(joinUrl, {
                    color: { dark: '#111111', light: '#ffffff' },
                    margin: 2,
                    width: 220,
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
    }, [joinUrl, opened]);

    const handleCopyLink = async () => {
        await copyLink(joinUrl);
        setCopiedLink(true);
        window.setTimeout(() => setCopiedLink(false), 2000);
    };

    const handleCopyCode = async () => {
        await navigator.clipboard.writeText(roomCode);
        setCopiedCode(true);
        window.setTimeout(() => setCopiedCode(false), 2000);
    };

    return (
        <Modal
            centered
            classNames={{
                body: styles.partyInviteModalBody,
                content: styles.partyInviteModalContent,
                header: styles.partyInviteModalHeader,
                title: styles.partyInviteModalTitle,
            }}
            onClose={onClose}
            opened={opened}
            size="lg"
            title="Invite to party"
        >
            <Text className={styles.partyInviteLead}>
                Share the link or scan the QR code to join room{' '}
                <span className={styles.partyInviteCodeInline}>{roomCode}</span>.
            </Text>

            <div className={styles.partyInviteLayout}>
                <div aria-label="Party join QR code" className={styles.partyInviteQrBlock}>
                    {qrDataUrl ? (
                        <img alt="" className={styles.partyInviteQrImage} src={qrDataUrl} />
                    ) : qrError ? (
                        <div className={styles.partyInviteQrFallback}>
                            <Text size="sm">Could not generate QR code</Text>
                        </div>
                    ) : (
                        <div className={styles.partyInviteQrSkeleton} />
                    )}
                    <Text className={styles.partyInviteQrCaption} size="xs">
                        Scan with a phone camera
                    </Text>
                </div>

                <div className={styles.partyInviteDetails}>
                    <div className={styles.partyInviteRoomCode}>
                        <span className={styles.partyInviteRoomCodeLabel}>Room code</span>
                        <span className={styles.partyInviteRoomCodeValue}>{roomCode}</span>
                        <Button
                            leftSection={
                                copiedCode ? <RiCheckLine size={16} /> : <RiFileCopyLine size={16} />
                            }
                            onClick={handleCopyCode}
                            size="compact-sm"
                            variant="default"
                        >
                            {copiedCode ? 'Copied' : 'Copy code'}
                        </Button>
                    </div>

                    <div className={styles.partyInviteLinkBlock}>
                        <span className={styles.partyInviteLinkLabel}>Join link</span>
                        <div className={styles.partyInviteLinkBox}>{joinUrl}</div>
                        <Button
                            fullWidth
                            leftSection={
                                copiedLink ? <RiCheckLine size={16} /> : <RiFileCopyLine size={16} />
                            }
                            onClick={handleCopyLink}
                            variant="light"
                        >
                            {copiedLink ? 'Link copied' : 'Copy link'}
                        </Button>
                    </div>
                </div>
            </div>
        </Modal>
    );
};
