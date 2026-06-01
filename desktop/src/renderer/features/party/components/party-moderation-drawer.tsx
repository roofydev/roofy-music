import { Badge, Button, Drawer, Group, Stack, Text } from '@mantine/core';

import { usePartyRoomState } from '/@/renderer/features/party/party-store';

const party = window.api?.party ?? null;

interface PartyModerationDrawerProps {
    onClose: () => void;
    opened: boolean;
}

export const PartyModerationDrawer = ({ onClose, opened }: PartyModerationDrawerProps) => {
    const state = usePartyRoomState();

    const pendingGuests = state?.guests.filter((guest) => guest.status === 'pending') || [];
    const approvedGuests = state?.guests.filter((guest) => guest.status === 'approved') || [];
    const mutedGuests = approvedGuests.filter((guest) => guest.isChatMuted);

    return (
        <Drawer onClose={onClose} opened={opened} position="right" size="md" title="Moderation">
            <Stack gap="lg">
                <div>
                    <Text fw={700} mb="xs" size="sm">
                        Pending joins ({pendingGuests.length})
                    </Text>
                    {pendingGuests.length ? (
                        pendingGuests.map((guest) => (
                            <Group gap="xs" justify="space-between" key={guest.id} mb="xs">
                                <Text size="sm">{guest.displayName}</Text>
                                <Group gap="xs">
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
                            </Group>
                        ))
                    ) : (
                        <Text c="dimmed" size="sm">
                            No pending join requests.
                        </Text>
                    )}
                </div>

                <div>
                    <Text fw={700} mb="xs" size="sm">
                        Muted guests ({mutedGuests.length})
                    </Text>
                    {mutedGuests.length ? (
                        mutedGuests.map((guest) => (
                            <Group justify="space-between" key={guest.id} mb="xs">
                                <Text size="sm">{guest.displayName}</Text>
                                <Button
                                    onClick={() => party?.muteGuestChat(guest.id, false)}
                                    size="compact-xs"
                                    variant="light"
                                >
                                    Unmute
                                </Button>
                            </Group>
                        ))
                    ) : (
                        <Text c="dimmed" size="sm">
                            No muted guests.
                        </Text>
                    )}
                </div>

                <div>
                    <Text fw={700} mb="xs" size="sm">
                        Active listeners ({approvedGuests.length})
                    </Text>
                    {approvedGuests.map((guest) => (
                        <Group justify="space-between" key={guest.id} mb="xs">
                            <Group gap="xs">
                                <Text size="sm">{guest.displayName}</Text>
                                {guest.role === 'codj' && (
                                    <Badge color="yellow" size="xs" variant="light">
                                        Co-DJ
                                    </Badge>
                                )}
                                {guest.isChatMuted && (
                                    <Badge color="gray" size="xs" variant="light">
                                        Muted
                                    </Badge>
                                )}
                            </Group>
                            <Group gap="xs">
                                <Button
                                    color="red"
                                    onClick={() => party?.kickGuest(guest.id)}
                                    size="compact-xs"
                                    variant="subtle"
                                >
                                    Kick
                                </Button>
                            </Group>
                        </Group>
                    ))}
                </div>
            </Stack>
        </Drawer>
    );
};
