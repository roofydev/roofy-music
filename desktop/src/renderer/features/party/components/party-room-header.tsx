import { useState } from 'react';
import { Button, Drawer, Group, Modal, Text } from '@mantine/core';
import {
    RiAddLine,
    RiSettings3Line,
    RiShieldLine,
    RiStopCircleLine,
} from 'react-icons/ri';

import { PartyInviteModal } from '/@/renderer/features/party/components/party-invite-modal';
import { PartyModerationDrawer } from '/@/renderer/features/party/components/party-moderation-drawer';
import { PartySettingsPanel } from '/@/renderer/features/party/components/party-settings-panel';
import { usePartyActions } from '/@/renderer/features/party/hooks/use-party-actions';
import { usePartyUptime } from '/@/renderer/features/party/hooks/use-party-uptime';
import styles from '/@/renderer/features/party/party-dashboard.module.css';
import { usePartyRoomState } from '/@/renderer/features/party/party-store';

export const PartyRoomHeader = () => {
    const state = usePartyRoomState();
    const { stopParty } = usePartyActions();
    const uptime = usePartyUptime(state?.sessionStartedAt);
    const [inviteOpen, setInviteOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [moderationOpen, setModerationOpen] = useState(false);
    const [endConfirmOpen, setEndConfirmOpen] = useState(false);

    if (!state) return null;

    const listeners = state.guests.filter((guest) => guest.status === 'approved').length;
    const pendingCount =
        state.guests.filter((guest) => guest.status === 'pending').length +
        state.requestQueue.filter((item) => item.status === 'pending').length;

    return (
        <>
            <div className={styles.partyRoomHeader}>
                <div className={styles.partyRoomMeta}>
                    <Text className={styles.partyRoomCode} component="span">
                        {state.code}
                    </Text>
                    <span className={styles.partyLiveBadge}>
                        <span className={styles.partyLiveDot} />
                        Live
                    </span>
                    <div className={styles.partyMetaStat}>
                        Listeners
                        <strong>{listeners}</strong>
                    </div>
                    <div className={styles.partyMetaStat}>
                        Uptime
                        <strong>{uptime}</strong>
                    </div>
                    {state.tunnelStatus.state !== 'connected' && state.settings.exposureMode === 'tunnel' && (
                        <div className={styles.partyMetaStat}>
                            Tunnel
                            <strong>{state.tunnelStatus.state}</strong>
                        </div>
                    )}
                    {state.hostMicActive && (
                        <div className={styles.partyMetaStat}>
                            Mic
                            <strong style={{ color: '#f87171' }}>ON</strong>
                        </div>
                    )}
                </div>

                <Group className={styles.partyHeaderActions} gap="xs">
                    <Button leftSection={<RiAddLine />} onClick={() => setInviteOpen(true)} variant="default">
                        Invite
                    </Button>
                    <Button
                        leftSection={<RiSettings3Line />}
                        onClick={() => setSettingsOpen(true)}
                        variant="default"
                    >
                        Room settings
                    </Button>
                    <Button
                        leftSection={<RiShieldLine />}
                        onClick={() => setModerationOpen(true)}
                        variant="default"
                    >
                        Moderation{pendingCount > 0 ? ` (${pendingCount})` : ''}
                    </Button>
                    <Button
                        color="red"
                        leftSection={<RiStopCircleLine />}
                        onClick={() => setEndConfirmOpen(true)}
                        variant="light"
                    >
                        End room
                    </Button>
                </Group>
            </div>

            <PartyInviteModal
                joinUrl={state.joinUrl}
                onClose={() => setInviteOpen(false)}
                opened={inviteOpen}
                roomCode={state.code}
            />

            <Drawer
                onClose={() => setSettingsOpen(false)}
                opened={settingsOpen}
                position="right"
                size="md"
                title="Room settings"
            >
                <PartySettingsPanel />
            </Drawer>

            <PartyModerationDrawer onClose={() => setModerationOpen(false)} opened={moderationOpen} />

            <Modal
                centered
                onClose={() => setEndConfirmOpen(false)}
                opened={endConfirmOpen}
                title="End party room?"
            >
                <Text mb="md" size="sm">
                    All guests will be disconnected and the public link will stop working.
                </Text>
                <Group justify="flex-end">
                    <Button onClick={() => setEndConfirmOpen(false)} variant="default">
                        Cancel
                    </Button>
                    <Button
                        color="red"
                        onClick={() => {
                            setEndConfirmOpen(false);
                            stopParty();
                        }}
                    >
                        End room
                    </Button>
                </Group>
            </Modal>
        </>
    );
};
