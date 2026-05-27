import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ActionIcon, Badge, Group, Popover, ScrollArea, Text, TextInput } from '@mantine/core';
import { RiArrowRightLine, RiEmotionLine } from 'react-icons/ri';

import styles from '/@/renderer/features/party/party-dashboard.module.css';
import { usePartyRoomState } from '/@/renderer/features/party/party-store';
import {
    COMMON_PARTY_EMOJIS,
    formatChatTime,
    guestInitials,
    hashAvatarColor,
} from '/@/renderer/features/party/utils/party-utils';
import { PartyChatMessage } from '/@/shared/types/party-types';

const party = window.api?.party ?? null;

const roleBadge = (message: PartyChatMessage, hostName: string) => {
    if (message.role === 'host' || message.senderName === hostName) {
        return (
            <Badge color="blue" size="xs" variant="light">
                Owner
            </Badge>
        );
    }
    return (
        <Badge color="gray" size="xs" variant="light">
            Listener
        </Badge>
    );
};

export const PartyChatColumn = () => {
    const state = usePartyRoomState();
    const [messages, setMessages] = useState<PartyChatMessage[]>(state?.chat || []);
    const [input, setInput] = useState('');
    const [emojiOpen, setEmojiOpen] = useState(false);
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

    const handleSubmit = (event?: FormEvent) => {
        event?.preventDefault();
        const trimmed = input.trim();
        if (!trimmed || !party) return;
        party.sendChat(trimmed);
        setInput('');
    };

    const appendEmoji = (emoji: string) => {
        setInput((current) => `${current}${emoji}`);
        setEmojiOpen(false);
    };

    const hostName = state?.hostDisplayName || 'Host';

    const renderedMessages = useMemo(() => messages, [messages]);

    if (!state) return null;

    return (
        <div className={`${styles.partyColumn} ${styles.partyChatColumn}`}>
            <div className={styles.partyColumnHeader}>
                <span>Live chat</span>
            </div>

            <ScrollArea className={styles.partyColumnBody} offsetScrollbars type="auto">
                <div className={styles.partyColumnScroll}>
                    {renderedMessages.length ? (
                        renderedMessages.map((message) => (
                            <div className={styles.partyChatMessage} key={message.id}>
                                <span
                                    className={styles.partyAvatar}
                                    style={{
                                        background: hashAvatarColor(message.senderName),
                                    }}
                                >
                                    {guestInitials(message.senderName)}
                                </span>
                                <div className={styles.partyChatBody}>
                                    <div className={styles.partyChatMeta}>
                                        <Text fw={600} size="sm">
                                            {message.senderName}
                                        </Text>
                                        {roleBadge(message, hostName)}
                                        <Text c="dimmed" size="xs">
                                            {formatChatTime(message.sentAt)}
                                        </Text>
                                    </div>
                                    <Text size="sm">{message.body}</Text>
                                </div>
                            </div>
                        ))
                    ) : (
                        <Text c="dimmed" size="sm">
                            No messages yet. Say hello to your guests.
                        </Text>
                    )}
                    <div ref={endRef} />
                </div>
            </ScrollArea>

            <form className={styles.partyChatInputRow} onSubmit={handleSubmit}>
                <TextInput
                    flex={1}
                    maxLength={400}
                    onChange={(event) => setInput(event.currentTarget.value)}
                    placeholder="Message the room…"
                    value={input}
                />
                <Popover onChange={setEmojiOpen} opened={emojiOpen} position="top-end" width={220}>
                    <Popover.Target>
                        <ActionIcon onClick={() => setEmojiOpen((value) => !value)} variant="subtle">
                            <RiEmotionLine />
                        </ActionIcon>
                    </Popover.Target>
                    <Popover.Dropdown>
                        <Group gap={6}>
                            {COMMON_PARTY_EMOJIS.map((emoji) => (
                                <ActionIcon key={emoji} onClick={() => appendEmoji(emoji)} variant="subtle">
                                    {emoji}
                                </ActionIcon>
                            ))}
                        </Group>
                    </Popover.Dropdown>
                </Popover>
                <ActionIcon disabled={!input.trim()} onClick={() => handleSubmit()} type="submit" variant="filled">
                    <RiArrowRightLine />
                </ActionIcon>
            </form>
        </div>
    );
};
