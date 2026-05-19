import { memo } from 'react';

import styles from './retro-status-bar.module.css';

import { Group } from '/@/shared/components/group/group';
import { Text } from '/@/shared/components/text/text';
import { usePlayerSong } from '/@/renderer/store';
import { usePlayerTimestamp } from '/@/renderer/store/timestamp.store';

export const RetroStatusBar = memo(function RetroStatusBar() {
    const currentTrack = usePlayerSong();
    const currentTime = usePlayerTimestamp();

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const duration = (currentTrack?.duration ?? 0) / 1000;

    const statusText = currentTrack
        ? `PLAYING: ${currentTrack.name} | ${formatTime(currentTime)} / ${formatTime(duration)}`
        : 'READY | NO TRACK SELECTED';

    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    return (
        <div className={styles.container} id="retro-status-bar">
            <Group align="center" gap="md">
                <Text className={styles.text} size="xs">
                    {statusText}
                </Text>
            </Group>
            <Group align="center" gap="md">
                <Text className={styles.text} size="xs">
                    {timeStr}
                </Text>
                <Text className={styles.text} size="xs">
                    MODE: LOCAL
                </Text>
            </Group>
        </div>
    );
});
