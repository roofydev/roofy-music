import clsx from 'clsx';

import styles from './player-bar.module.css';

import { Playerbar } from '/@/renderer/features/player/components/playerbar';
import { useFullScreenPlayerStore, usePlayerbarOpenDrawer } from '/@/renderer/store';

export const PlayerBar = () => {
    const playerbarOpenDrawer = usePlayerbarOpenDrawer();
    const videoFullscreen = useFullScreenPlayerStore((state) => state.videoFullscreen);

    if (videoFullscreen) {
        return null;
    }

    return (
        <div
            className={clsx({
                [styles.container]: true,
                [styles.openDrawer]: playerbarOpenDrawer,
            })}
            id="player-bar"
        >
            <Playerbar />
        </div>
    );
};
