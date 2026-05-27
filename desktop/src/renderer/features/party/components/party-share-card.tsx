import { Badge, Button, Group, Stack, Text } from '@mantine/core';

import { usePartyRoomState } from '/@/renderer/features/party/party-store';
import { usePartyActions } from '/@/renderer/features/party/hooks/use-party-actions';

export const PartyShareCard = () => {
    const state = usePartyRoomState();
    const { copyLink } = usePartyActions();

    if (!state) return null;

    const listeners = state.guests.filter((guest) => guest.status === 'approved').length;

    return (
        <Stack gap="sm">
            <Group justify="space-between">
                <div>
                    <Text c="dimmed" size="xs">
                        Room code
                    </Text>
                    <Text fw={800} size="xl">
                        {state.code}
                    </Text>
                </div>
                <Badge color="green" size="lg" variant="dot">
                    Live
                </Badge>
            </Group>
            <Group grow>
                <Stack gap={0}>
                    <Text c="dimmed" size="xs">
                        Listeners
                    </Text>
                    <Text fw={700}>{listeners}</Text>
                </Stack>
                <Stack gap={0}>
                    <Text c="dimmed" size="xs">
                        Requests
                    </Text>
                    <Text fw={700}>{state.requestQueue.length}</Text>
                </Stack>
            </Group>
            <Text c="dimmed" lineClamp={2} size="xs">
                {state.joinUrl}
            </Text>
            <Button onClick={() => copyLink(state.joinUrl)} variant="light">
                Copy join link
            </Button>
            {state.tunnelStatus.state === 'starting' && (
                <Text c="dimmed" size="xs">
                    Setting up public link…
                </Text>
            )}
            {state.tunnelStatus.state === 'unavailable' && (
                <Text c="red" size="xs">
                    {state.tunnelStatus.error || 'Tunnel unavailable — try LAN mode next time.'}
                </Text>
            )}
        </Stack>
    );
};
