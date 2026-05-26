import isElectron from 'is-electron';
import { useEffect, useState } from 'react';

import {
    SettingOption,
    SettingsSection,
} from '/@/renderer/features/settings/components/settings-section';
import { Badge } from '/@/shared/components/badge/badge';
import { Button } from '/@/shared/components/button/button';
import { Group } from '/@/shared/components/group/group';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';
import { YoutubeMusicAuthStatus } from '/@/shared/types/youtube-music-types';

export const YoutubeMusicSettings = () => {
    const [status, setStatus] = useState<null | YoutubeMusicAuthStatus>(null);
    const [busy, setBusy] = useState(false);

    const refresh = async () => {
        if (!isElectron() || !window.api?.youtubeMusic) return;
        setStatus(await window.api.youtubeMusic.status());
    };

    useEffect(() => {
        refresh().catch((error) => {
            toast.error({ message: (error as Error).message });
        });
    }, []);

    const run = async (action: () => Promise<YoutubeMusicAuthStatus>) => {
        setBusy(true);
        try {
            setStatus(await action());
        } catch (error) {
            toast.error({ message: (error as Error).message });
        } finally {
            setBusy(false);
        }
    };

    const options: SettingOption[] = [
        {
            control: (
                <Group>
                    <Badge variant={status?.connected ? 'filled' : 'default'}>
                        {status?.connected ? 'Connected' : 'Disconnected'}
                    </Badge>
                    {status?.connected ? (
                        <Button
                            disabled={busy}
                            loading={busy}
                            onClick={() => run(window.api.youtubeMusic.disconnect)}
                        >
                            Disconnect
                        </Button>
                    ) : (
                        <Button
                            disabled={busy || status?.dependencyAvailable === false}
                            loading={busy}
                            onClick={() => run(window.api.youtubeMusic.connect)}
                            variant="state-info"
                        >
                            Connect
                        </Button>
                    )}
                </Group>
            ),
            description: (
                <Stack gap="xs">
                    <Text isMuted size="sm">
                        Uses your local Google session to enable native YouTube Music search,
                        recommendations, and streaming inside Roofy Music.
                    </Text>
                    {status?.dependencyAvailable === false && (
                        <Text color="error" size="sm">
                            youtubei.js is not available. Reinstall desktop dependencies before
                            connecting.
                        </Text>
                    )}
                    {status?.connectedAt && (
                        <Text isMuted size="sm">
                            Connected {new Date(status.connectedAt).toLocaleString()}
                        </Text>
                    )}
                </Stack>
            ),
            title: 'Google account sync',
        },
    ];

    return <SettingsSection options={options} title="YouTube Music" />;
};
