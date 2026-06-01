import { Badge, Button, Group, Stack, Text } from '@mantine/core';

import { usePartyRoomState } from '/@/renderer/features/party/party-store';

const party = window.api?.party ?? null;

export const PartyRequestsPanel = () => {
    const state = usePartyRoomState();

    if (!state) {
        return (
            <Text c="dimmed" size="sm">
                Song requests appear when a party is live.
            </Text>
        );
    }

    const requestQueue = state.requestQueue || [];

    return (
        <Stack gap="xs">
            {requestQueue.length === 0 ? (
                <Text c="dimmed" size="sm">
                    No song requests yet.
                </Text>
            ) : (
                requestQueue.map((suggestion) => (
                    <Stack gap={5} key={suggestion.id}>
                        <Group justify="space-between" wrap="nowrap">
                            <div style={{ minWidth: 0 }}>
                                <Text lineClamp={1} size="sm">
                                    {suggestion.track?.title || suggestion.query}
                                </Text>
                                <Text
                                    c={suggestion.error ? 'red' : 'dimmed'}
                                    lineClamp={1}
                                    size="xs"
                                >
                                    {suggestion.error ||
                                        `${suggestion.status} by ${suggestion.guestDisplayName}`}
                                </Text>
                            </div>
                            <Badge
                                color={suggestion.status === 'approved' ? 'green' : 'yellow'}
                                variant="light"
                            >
                                {suggestion.status}
                            </Badge>
                        </Group>
                        {suggestion.status === 'pending' && (
                            <Group gap="xs">
                                <Button
                                    disabled={!suggestion.track}
                                    onClick={() => party?.approveSuggestion(suggestion.id)}
                                    size="compact-xs"
                                >
                                    Add to queue
                                </Button>
                                <Button
                                    color="red"
                                    onClick={() => party?.rejectSuggestion(suggestion.id)}
                                    size="compact-xs"
                                    variant="subtle"
                                >
                                    Reject
                                </Button>
                            </Group>
                        )}
                    </Stack>
                ))
            )}
        </Stack>
    );
};
