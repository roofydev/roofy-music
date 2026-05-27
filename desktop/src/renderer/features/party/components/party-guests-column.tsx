import { useState } from 'react';
import {
    ActionIcon,
    Badge,
    Button,
    Group,
    Menu,
    Modal,
    Select,
    Stack,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { RiVipCrownLine, RiMore2Fill } from 'react-icons/ri';

import styles from '/@/renderer/features/party/party-dashboard.module.css';
import { usePartyRoomState } from '/@/renderer/features/party/party-store';
import { guestInitials, hashAvatarColor } from '/@/renderer/features/party/utils/party-utils';

const party = window.api?.party ?? null;

export const PartyGuestsColumn = () => {
    const state = usePartyRoomState();
    const [expanded, setExpanded] = useState(false);
    const [grantGuestId, setGrantGuestId] = useState<null | string>(null);

    if (!state) return null;

    const pendingGuests = state.guests.filter((guest) => guest.status === 'pending');
    const listeners = state.guests.filter((guest) => guest.status === 'approved');
    const visibleListeners = expanded ? listeners : listeners.slice(0, 8);

    const confirmKickAll = () => {
        modals.openConfirmModal({
            centered: true,
            confirmProps: { color: 'red' },
            labels: { cancel: 'Cancel', confirm: 'Kick all' },
            onConfirm: () => party?.kickAllGuests(),
            title: 'Kick all guests?',
        });
    };

    return (
        <div className={`${styles.partyColumn} ${styles.partyGuestsColumn}`}>
            <div className={styles.partyColumnHeader}>
                <span>Guests ({listeners.length})</span>
            </div>

            <div className={styles.partyBulkActions}>
                {state.settings.controlMode === 'selected' && (
                    <Button onClick={() => setGrantGuestId('picker')} size="compact-xs" variant="default">
                        Grant control
                    </Button>
                )}
                <Button onClick={() => party?.muteAllChat(true)} size="compact-xs" variant="default">
                    Mute all
                </Button>
                <Button color="red" onClick={confirmKickAll} size="compact-xs" variant="subtle">
                    Kick all
                </Button>
            </div>

            <div className={styles.partyColumnScroll}>
                <Stack gap={0}>
                    <div className={styles.partyGuestRow}>
                        <span
                            className={styles.partyAvatar}
                            style={{ background: hashAvatarColor(state.hostDisplayName) }}
                        >
                            <RiVipCrownLine size={14} />
                        </span>
                        <div className={styles.partyGuestInfo}>
                            <div className={styles.partyGuestName}>{state.hostDisplayName}</div>
                            <div className={styles.partyGuestRole}>Host / DJ</div>
                        </div>
                        <Badge color="blue" size="xs" variant="light">
                            Owner
                        </Badge>
                    </div>

                    {pendingGuests.map((guest) => (
                        <Stack gap={4} key={guest.id} mb="xs">
                            <div className={styles.partyGuestRow}>
                                <span
                                    className={styles.partyAvatar}
                                    style={{ background: guest.avatarColor }}
                                >
                                    {guestInitials(guest.displayName)}
                                </span>
                                <div className={styles.partyGuestInfo}>
                                    <div className={styles.partyGuestName}>{guest.displayName}</div>
                                    <div className={styles.partyGuestRole}>Waiting to join</div>
                                </div>
                            </div>
                            <Group gap="xs" pl={44}>
                                <Button onClick={() => party?.approveJoin(guest.id)} size="compact-xs">
                                    Approve
                                </Button>
                                <Button
                                    color="red"
                                    onClick={() => party?.rejectJoin(guest.id)}
                                    size="compact-xs"
                                    variant="subtle"
                                >
                                    Reject
                                </Button>
                            </Group>
                        </Stack>
                    ))}

                    {visibleListeners.map((guest) => (
                        <div className={styles.partyGuestRow} key={guest.id}>
                            <span
                                className={styles.partyAvatar}
                                style={{ background: guest.avatarColor }}
                            >
                                {guestInitials(guest.displayName)}
                            </span>
                            <div className={styles.partyGuestInfo}>
                                <div className={styles.partyGuestName}>{guest.displayName}</div>
                                <div className={styles.partyGuestRole}>
                                    {guest.role === 'codj'
                                        ? 'Co-DJ'
                                        : guest.canControlPlayer
                                          ? 'Can control player'
                                          : 'Listener'}
                                </div>
                            </div>
                            {guest.role === 'codj' && (
                                <Badge color="yellow" size="xs" variant="light">
                                    VIP
                                </Badge>
                            )}
                            <Menu position="bottom-end" withinPortal>
                                <Menu.Target>
                                    <ActionIcon size="sm" variant="subtle">
                                        <RiMore2Fill />
                                    </ActionIcon>
                                </Menu.Target>
                                <Menu.Dropdown>
                                    {state.settings.controlMode === 'selected' && (
                                        <Menu.Item
                                            onClick={() =>
                                                party?.setGuestControl(guest.id, !guest.canControlPlayer)
                                            }
                                        >
                                            {guest.canControlPlayer ? 'Revoke control' : 'Grant control'}
                                        </Menu.Item>
                                    )}
                                    <Menu.Item onClick={() => party?.promoteCoDj(guest.id)}>
                                        Promote to Co-DJ
                                    </Menu.Item>
                                    <Menu.Item
                                        onClick={() =>
                                            party?.muteGuestChat(guest.id, !guest.isChatMuted)
                                        }
                                    >
                                        {guest.isChatMuted ? 'Unmute chat' : 'Mute chat'}
                                    </Menu.Item>
                                    <Menu.Item color="red" onClick={() => party?.kickGuest(guest.id)}>
                                        Kick guest
                                    </Menu.Item>
                                </Menu.Dropdown>
                            </Menu>
                        </div>
                    ))}
                </Stack>
            </div>

            {listeners.length > 8 && (
                <div className={styles.partyColumnFooter}>
                    <Button onClick={() => setExpanded((value) => !value)} size="compact-xs" variant="subtle">
                        {expanded ? 'Show fewer guests' : 'View all guests'}
                    </Button>
                </div>
            )}

            <Modal
                centered
                onClose={() => setGrantGuestId(null)}
                opened={grantGuestId === 'picker'}
                title="Grant control to guest"
            >
                <Select
                    data={listeners.map((guest) => ({ label: guest.displayName, value: guest.id }))}
                    onChange={(value) => {
                        if (value) {
                            party?.setGuestControl(value, true);
                            setGrantGuestId(null);
                        }
                    }}
                    placeholder="Choose a guest"
                />
            </Modal>
        </div>
    );
};
