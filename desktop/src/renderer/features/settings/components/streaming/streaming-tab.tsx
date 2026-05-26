import { DownloadSettings } from './download-settings';
import { YoutubeMusicSettings } from './youtube-music-settings';

import { Stack } from '/@/shared/components/stack/stack';

export const StreamingTab = () => {
    return (
        <Stack gap="md">
            <YoutubeMusicSettings />
            <DownloadSettings />
        </Stack>
    );
};
