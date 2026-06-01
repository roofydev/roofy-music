import { FormEvent, useEffect, useRef, useState } from 'react';
import { Badge, Button, Group, ScrollArea, Stack, Text, TextInput } from '@mantine/core';

import { usePartyRoomState } from '/@/renderer/features/party/party-store';
import { PartyChatMessage } from '/@/shared/types/party-types';

const party = window.api?.party ?? null;

export const PartyChatPanel = () => {
    const state = usePartyRoomState();
    const [messages, setMessages] = useState<PartyChatMessage[]>(state?.chat || []);
    const [input, setInput] = useState('');
    const endRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (state?.chat) setMessages(state.chat);
    }, [state?.chat]);

    useEffect(() => {
        if (!party) return undefined;
        const off = party.onChatMessage((_event, message) => {
            setMessages((current) => [...current, message].slice(-100));
        });
        return () => {
            off();
        };
    }, []);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages.length]);

    const handleSubmit = (event: FormEvent) => {
        event.preventDefault();
        const trimmed = input.trim();
        if (!trimmed || !party) return;
        party.sendChat(trimmed);
        setInput('');
    };

    if (!state) {
        return (
            <Text c="dimmed" size="sm">
                Start a party to chat with guests.
            </Text>
        );
    }

    return (
        <Stack gap="sm" style={{ height: '100%', minHeight: 0 }}>
            <ScrollArea flex={1} offsetScrollbars type="auto">
                <Stack gap="xs" pr="xs">
                    {messages.length ? (
                        messages.map((message) => (
                            <Stack gap={2} key={message.id}>
                                <Group gap="xs">
                                    <Text fw={600} size="sm">
                                        {message.senderName}
                                    </Text>
                                    {message.role === 'host' && (
                                        <Badge color="blue" size="xs" variant="light">
                                            DJ
                                        </Badge>
                                    )}
                                </Group>
                                <Text size="sm">{message.body}</Text>
                            </Stack>
                        ))
                    ) : (
                        <Text c="dimmed" size="sm">
                            No messages yet. Say hello to your guests.
                        </Text>
                    )}
                    <div ref={endRef} />
                </Stack>
            </ScrollArea>
            <form onSubmit={handleSubmit}>
                <Stack gap="xs">
                    <TextInput
                        maxLength={400}
                        onChange={(event) => setInput(event.currentTarget.value)}
                        placeholder="Message the room…"
                        value={input}
                    />
                    <Button disabled={!input.trim()} type="submit">
                        Send
                    </Button>
                </Stack>
            </form>
        </Stack>
    );
};
