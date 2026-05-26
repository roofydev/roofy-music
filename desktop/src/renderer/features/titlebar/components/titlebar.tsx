import type { ReactNode } from 'react';

import styles from './titlebar.module.css';

import { YoutubeMusicAccountButton } from '/@/renderer/features/youtube-music/components/youtube-music-account-button';
import { WindowControls } from '/@/renderer/features/window-controls/components/window-controls';
import { Group } from '/@/shared/components/group/group';

interface TitlebarProps {
    children?: ReactNode;
}

export const Titlebar = ({ children }: TitlebarProps) => {
    return (
        <>
            <div className={styles.titlebarContainer}>
                <div className={styles.right}>
                    {children}
                    <Group gap="xs">
                        <YoutubeMusicAccountButton compact />
                        <WindowControls />
                    </Group>
                </div>
            </div>
        </>
    );
};
