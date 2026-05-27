import { NumberInput, SegmentedControl, Switch, TextInput } from '@mantine/core';

import { usePartyActions } from '/@/renderer/features/party/hooks/use-party-actions';
import styles from '/@/renderer/features/party/party-dashboard.module.css';
import { usePartyRoomState } from '/@/renderer/features/party/party-store';
import { PartyControlMode, PartyExposureMode } from '/@/shared/types/party-types';

type PartySettingsPanelProps = {
    layout?: 'stack' | 'setup';
};

export const PartySettingsPanel = ({ layout = 'stack' }: PartySettingsPanelProps) => {
    const state = usePartyRoomState();
    const { partySettings, persistSettings, updateLiveSettings } = usePartyActions();

    const settings = state?.settings || partySettings;
    const isLive = Boolean(state);

    const apply = async (updates: Partial<typeof partySettings>) => {
        if (isLive) {
            await updateLiveSettings(updates);
        } else {
            persistSettings(updates);
        }
    };

    const exposureControl = !isLive ? (
        <div className={styles.partySettingField}>
            <label className={styles.partySettingLabel} htmlFor="party-exposure">
                Connection
            </label>
            <p className={styles.partySettingHint}>
                Tunnel shares a public link via Cloudflare. LAN is for guests on the same network.
            </p>
            <SegmentedControl
                data={[
                    { label: 'Tunnel', value: 'tunnel' },
                    { label: 'LAN', value: 'lan' },
                ]}
                fullWidth
                id="party-exposure"
                onChange={(value) =>
                    persistSettings({ exposureMode: value as PartyExposureMode })
                }
                value={partySettings.exposureMode}
            />
        </div>
    ) : null;

    const accessControl = (
        <div className={styles.partySettingField}>
            <label className={styles.partySettingLabel} htmlFor="party-access">
                Room access
            </label>
            <p className={styles.partySettingHint}>
                Public rooms let guests join immediately. Private rooms require your approval.
            </p>
            <SegmentedControl
                data={[
                    { label: 'Public', value: 'public' },
                    { label: 'Private', value: 'private' },
                ]}
                fullWidth
                id="party-access"
                onChange={(value) => apply({ autoApproveJoins: value === 'public' })}
                value={settings.autoApproveJoins ? 'public' : 'private'}
            />
        </div>
    );

    const controlModeField = (
        <div className={styles.partySettingField}>
            <label className={styles.partySettingLabel} htmlFor="party-control">
                Playback control
            </label>
            <p className={styles.partySettingHint}>
                Who can pause, skip, and seek during the session.
            </p>
            <SegmentedControl
                data={[
                    { label: 'DJ only', value: 'host' },
                    { label: 'Selected', value: 'selected' },
                    { label: 'Everyone', value: 'all' },
                ]}
                fullWidth
                id="party-control"
                onChange={(value) => apply({ controlMode: value as PartyControlMode })}
                value={settings.controlMode}
            />
        </div>
    );

    const guestOptions = (
        <div className={styles.partySettingSwitches}>
            <Switch
                checked={settings.allowGuestQueueReorder ?? false}
                label="Allow guests to reorder the queue"
                onChange={(event) =>
                    apply({ allowGuestQueueReorder: event.currentTarget.checked })
                }
            />
            <Switch
                checked={settings.autoApproveSuggestions ?? false}
                label="Auto-approve song requests"
                onChange={(event) =>
                    apply({ autoApproveSuggestions: event.currentTarget.checked })
                }
            />
            <Switch
                checked={settings.chatRateLimitEnabled ?? false}
                label="Limit chat speed (2s between messages)"
                onChange={(event) =>
                    apply({ chatRateLimitEnabled: event.currentTarget.checked })
                }
            />
            {isLive && (
                <Switch
                    checked={settings.queueLocked ?? false}
                    label="Lock queue (no new requests)"
                    onChange={(event) => apply({ queueLocked: event.currentTarget.checked })}
                />
            )}
        </div>
    );

    const hostFields = (
        <div className={styles.partySettingHostRow}>
            <TextInput
                classNames={{ root: styles.partySettingInput }}
                label="DJ display name"
                onChange={(event) => apply({ hostDisplayName: event.currentTarget.value })}
                value={partySettings.hostDisplayName}
            />
            <NumberInput
                classNames={{ root: styles.partySettingInput }}
                label="Max guests"
                max={100}
                min={1}
                onChange={(value) =>
                    apply({ maxGuests: Number(value) || partySettings.maxGuests })
                }
                value={settings.maxGuests}
            />
        </div>
    );

    if (layout === 'setup') {
        return (
            <div className={styles.partySetupForm}>
                <div className={styles.partySetupSection}>
                    <h3 className={styles.partySetupSectionTitle}>Connection &amp; access</h3>
                    {exposureControl}
                    {accessControl}
                </div>

                <div className={styles.partySetupSection}>
                    <h3 className={styles.partySetupSectionTitle}>Permissions</h3>
                    {controlModeField}
                    {guestOptions}
                </div>

                <div className={styles.partySetupSection}>
                    <h3 className={styles.partySetupSectionTitle}>Host details</h3>
                    {hostFields}
                </div>
            </div>
        );
    }

    return (
        <div className={styles.partySettingsStack}>
            {exposureControl}
            {accessControl}
            {controlModeField}
            {guestOptions}
            {hostFields}
        </div>
    );
};
