import isElectron from 'is-electron';
import { memo } from 'react';

import { DiscordPresencePreview } from '/@/renderer/features/discord-rpc/discord-presence-preview';
import { DiscordSettings } from '/@/renderer/features/settings/components/window/discord-settings';
import { Stack } from '/@/shared/components/stack/stack';

export const DiscordTab = memo(() => {
    if (!isElectron()) {
        return null;
    }

    return (
        <Stack gap="md">
            <DiscordSettings extra={<DiscordPresencePreview />} />
        </Stack>
    );
});
