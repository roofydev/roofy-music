import { Badge, Button, Group, Stack, Text } from '@mantine/core';

import { usePartyRoomState } from '/@/renderer/features/party/party-store';

const party = window.api?.party ?? null;

export const PartyGuestsPanel = () => {
    const state = usePartyRoomState();

    if (!state) {
        return (
            <Text c="dimmed" size="sm">
                Guest list appears when a party is live.
            </Text>
        );
    }

    const pendingGuests = state.guests.filter((guest) => guest.status === 'pending');
    const listeners = state.guests.filter((guest) => guest.status === 'approved');

    return (
        <Stack gap="xs">
            {pendingGuests.map((guest) => (
                <Group gap="xs" justify="space-between" key={guest.id}>
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
            ))}
            {listeners.map((guest) => (
                <Group justify="space-between" key={guest.id}>
                    <div style={{ minWidth: 0 }}>
                        <Text lineClamp={1} size="sm">
                            {guest.displayName}
                        </Text>
                        <Text c="dimmed" lineClamp={1} size="xs">
                            {state.settings.controlMode === 'all' || guest.canControlPlayer
                                ? 'Can control player'
                                : state.settings.allowGuestQueueReorder
                                  ? 'Can reorder queue'
                                  : 'Requests only'}
                        </Text>
                    </div>
                    {state.settings.controlMode === 'selected' ? (
                        <Button
                            onClick={() =>
                                party?.setGuestControl(guest.id, !guest.canControlPlayer)
                            }
                            size="compact-xs"
                            variant={guest.canControlPlayer ? 'light' : 'subtle'}
                        >
                            {guest.canControlPlayer ? 'Remove control' : 'Grant control'}
                        </Button>
                    ) : (
                        <Badge color="green" variant="light">
                            Listening
                        </Badge>
                    )}
                </Group>
            ))}
            {pendingGuests.length === 0 && listeners.length === 0 && (
                <Text c="dimmed" size="sm">
                    No guests connected.
                </Text>
            )}
        </Stack>
    );
};
