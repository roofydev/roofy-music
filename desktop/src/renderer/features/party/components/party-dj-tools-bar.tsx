import { useEffect, useState } from 'react';

import { Button, Group, Menu, Popover, SegmentedControl, Select, Slider, Switch, Text } from '@mantine/core';
import { RiMicLine, RiSettings3Line } from 'react-icons/ri';

import { usePartyMic } from '/@/renderer/features/party/hooks/use-party-mic';
import { usePartyActions } from '/@/renderer/features/party/hooks/use-party-actions';
import styles from '/@/renderer/features/party/party-dashboard.module.css';
import { usePartyRoomState } from '/@/renderer/features/party/party-store';
import {
    useAutoDJSettings,
    usePartySettings,
    usePlaybackSettings,
    usePlayerActions,
    usePlayerProperties,
    usePlayerStatus,
    useSettingsStoreActions,
} from '/@/renderer/store';
import { toast } from '/@/shared/components/toast/toast';
import { listPartyMicInputDevices } from '/@/shared/party-mic-audio';
import { PlayerStatus, PlayerStyle, PlayerType } from '/@/shared/types/types';

export const PartyDjToolsBar = () => {
    const state = usePartyRoomState();
    const { updateLiveSettings } = usePartyActions();
    const autoDj = useAutoDJSettings();
    const partySettings = usePartySettings();
    const { setSettings } = useSettingsStoreActions();
    const playbackSettings = usePlaybackSettings();
    const status = usePlayerStatus();
    const { crossfadeDuration, transitionType } = usePlayerProperties();
    const { setCrossfadeDuration, setTransitionType } = usePlayerActions();
    const { micEnabled, micError, toggleMic } = usePartyMic();
    const [micDevices, setMicDevices] = useState<{ label: string; value: string }[]>([]);
    const [micSettingsOpen, setMicSettingsOpen] = useState(false);

    useEffect(() => {
        if (!micSettingsOpen) return;

        listPartyMicInputDevices()
            .then((devices) =>
                setMicDevices(
                    devices.map((device) => ({
                        label: device.label,
                        value: device.deviceId,
                    })),
                ),
            )
            .catch(() => {
                setMicDevices([]);
            });
    }, [micSettingsOpen, micEnabled]);

    if (!state) return null;

    const crossfadeSupported = playbackSettings.type === PlayerType.WEB;
    const transitionControlsLocked =
        !crossfadeSupported || status === PlayerStatus.PLAYING;

    const listeners = state.guests.filter((guest) => guest.status === 'approved').length;

    const updateMicSettings = (updates: Partial<typeof partySettings>) => {
        setSettings({ party: { ...partySettings, ...updates } });
    };

    const toggleAutoDj = () => {
        setSettings({
            autoDJ: {
                ...autoDj,
                enabled: !autoDj.enabled,
            },
        });
    };

    const toggleQueueLock = async () => {
        await updateLiveSettings({ queueLocked: !state.settings.queueLocked });
    };

    const setRoomTheme = async (theme: 'dark' | 'dynamic') => {
        await updateLiveSettings({ roomTheme: theme });
    };

    const showBandwidthWarning = () => {
        if (listeners >= 5) {
            toast.warn({
                message: 'Streaming to many guests uses your upload bandwidth.',
                title: 'Bandwidth notice',
            });
        }
    };

    return (
        <div className={styles.partyDjToolsBar}>
            <div className={styles.partyDjToolGroup}>
                <Menu position="top-start" withinPortal>
                    <Menu.Target>
                        <Button leftSection={<RiSettings3Line />} size="compact-xs" variant="default">
                            DJ tools
                        </Button>
                    </Menu.Target>
                    <Menu.Dropdown>
                        <Menu.Item onClick={showBandwidthWarning}>Bandwidth check</Menu.Item>
                        <Menu.Item
                            onClick={() =>
                                updateLiveSettings({
                                    voteToSkipEnabled: !state.settings.voteToSkipEnabled,
                                })
                            }
                        >
                            Vote to skip: {state.settings.voteToSkipEnabled ? 'On' : 'Off'}
                        </Menu.Item>
                        <Menu.Item
                            onClick={() =>
                                updateLiveSettings({
                                    autoApproveSuggestions: !state.settings.autoApproveSuggestions,
                                })
                            }
                        >
                            Auto-approve requests:{' '}
                            {state.settings.autoApproveSuggestions ? 'On' : 'Off'}
                        </Menu.Item>
                        <Menu.Item
                            onClick={() =>
                                updateLiveSettings({
                                    chatRateLimitEnabled: !state.settings.chatRateLimitEnabled,
                                })
                            }
                        >
                            Chat rate limit: {state.settings.chatRateLimitEnabled ? 'On' : 'Off'}
                        </Menu.Item>
                    </Menu.Dropdown>
                </Menu>
            </div>

            <div className={styles.partyDjToolGroup}>
                <Text className={styles.partyDjToolLabel}>Transition</Text>
                <SegmentedControl
                    data={[
                        { label: 'Gapless', value: PlayerStyle.GAPLESS },
                        { label: 'Crossfade', value: PlayerStyle.CROSSFADE },
                    ]}
                    disabled={transitionControlsLocked}
                    onChange={(value) => setTransitionType(value as PlayerStyle)}
                    size="xs"
                    value={transitionType}
                />
                <Slider
                    disabled={
                        transitionControlsLocked ||
                        transitionType !== PlayerStyle.CROSSFADE
                    }
                    max={15}
                    min={3}
                    onChangeEnd={(value) => setCrossfadeDuration(Number(value))}
                    size="xs"
                    style={{ width: 90 }}
                    value={crossfadeDuration}
                />
                <Text c="dimmed" size="xs">
                    {transitionType === PlayerStyle.CROSSFADE
                        ? `${crossfadeDuration}s`
                        : '—'}
                </Text>
                {!crossfadeSupported && (
                    <Text c="dimmed" size="xs">
                        Web player only
                    </Text>
                )}
                {crossfadeSupported && transitionControlsLocked && (
                    <Text c="dimmed" size="xs">
                        Pause to change
                    </Text>
                )}
            </div>

            <div className={styles.partyDjToolGroup}>
                <Text className={styles.partyDjToolLabel}>Auto-DJ</Text>
                <Switch checked={autoDj.enabled} onChange={toggleAutoDj} size="sm" />
            </div>

            <div className={styles.partyDjToolGroup}>
                <Text className={styles.partyDjToolLabel}>Queue lock</Text>
                <Switch checked={state.settings.queueLocked} onChange={toggleQueueLock} size="sm" />
            </div>

            <div className={styles.partyDjToolGroup}>
                <Text className={styles.partyDjToolLabel}>Mic</Text>
                <Switch
                    checked={micEnabled}
                    color={micError ? 'red' : undefined}
                    onChange={toggleMic}
                    size="sm"
                    thumbIcon={micEnabled ? <RiMicLine size={12} /> : undefined}
                />
                <Text c={micEnabled ? 'red' : 'dimmed'} size="xs">
                    {micEnabled ? 'ON' : 'OFF'}
                </Text>
                <Popover
                    onChange={setMicSettingsOpen}
                    opened={micSettingsOpen}
                    position="top-start"
                    width={280}
                    withinPortal
                >
                    <Popover.Target>
                        <Button
                            onClick={() => setMicSettingsOpen((open) => !open)}
                            size="compact-xs"
                            variant="subtle"
                        >
                            Mic setup
                        </Button>
                    </Popover.Target>
                    <Popover.Dropdown className={styles.partyMicSettings}>
                        <Text fw={600} mb="xs" size="sm">
                            DJ microphone
                        </Text>
                        <Text c="dimmed" mb="sm" size="xs">
                            Turn off echo cancellation when music plays through speakers.
                        </Text>

                        <Select
                            clearable
                            comboboxProps={{ withinPortal: true }}
                            data={micDevices}
                            label="Input device"
                            mb="sm"
                            onChange={(value) => updateMicSettings({ micDeviceId: value || undefined })}
                            placeholder="System default"
                            size="xs"
                            value={partySettings.micDeviceId || null}
                        />

                        <Text mb={4} size="xs">
                            Mic gain ({partySettings.micGain}%)
                        </Text>
                        <Slider
                            mb="sm"
                            max={200}
                            min={25}
                            onChangeEnd={(value) => updateMicSettings({ micGain: Number(value) })}
                            size="xs"
                            value={partySettings.micGain}
                        />

                        <Group gap="xs" mb="xs">
                            <Switch
                                checked={partySettings.micEchoCancellation}
                                label="Echo cancellation"
                                onChange={(event) =>
                                    updateMicSettings({
                                        micEchoCancellation: event.currentTarget.checked,
                                    })
                                }
                                size="xs"
                            />
                        </Group>
                        <Group gap="xs" mb="xs">
                            <Switch
                                checked={partySettings.micNoiseSuppression}
                                label="Noise suppression"
                                onChange={(event) =>
                                    updateMicSettings({
                                        micNoiseSuppression: event.currentTarget.checked,
                                    })
                                }
                                size="xs"
                            />
                        </Group>
                        <Switch
                            checked={partySettings.micAutoGainControl}
                            label="Auto gain"
                            onChange={(event) =>
                                updateMicSettings({
                                    micAutoGainControl: event.currentTarget.checked,
                                })
                            }
                            size="xs"
                        />
                    </Popover.Dropdown>
                </Popover>
                {micError && (
                    <Text c="red" size="xs">
                        {micError}
                    </Text>
                )}
            </div>

            <div className={styles.partyDjToolGroup}>
                <Text className={styles.partyDjToolLabel}>Room theme</Text>
                <Select
                    comboboxProps={{ withinPortal: true }}
                    data={[
                        { label: 'Dark', value: 'dark' },
                        { label: 'Dynamic', value: 'dynamic' },
                    ]}
                    onChange={(value) => value && setRoomTheme(value as 'dark' | 'dynamic')}
                    size="xs"
                    value={state.settings.roomTheme}
                    w={110}
                />
            </div>

            <Group gap="xs" ml="auto">
                <Text c="dimmed" size="xs">
                    {listeners} listeners
                </Text>
            </Group>
        </div>
    );
};
