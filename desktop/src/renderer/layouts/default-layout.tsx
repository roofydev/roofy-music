import clsx from 'clsx';
import isElectron from 'is-electron';

import styles from './default-layout.module.css';

import { ContextMenuController } from '/@/renderer/features/context-menu/context-menu-controller';
import { MainContent } from '/@/renderer/layouts/default-layout/main-content';
import { PlayerBar } from '/@/renderer/layouts/default-layout/player-bar';
import { RetroStatusBar } from '/@/renderer/layouts/default-layout/retro-status-bar';
import { RetroTopBar } from '/@/renderer/layouts/default-layout/retro-top-bar';
import { WindowBar } from '/@/renderer/layouts/window-bar';
import { useSettingsStore, useWindowBarStyle } from '/@/renderer/store/settings.store';
import { useAppTheme } from '/@/renderer/themes/use-app-theme';
import { AppTheme } from '/@/shared/themes/app-theme-types';
import { Platform, PlayerType } from '/@/shared/types/types';

if (!isElectron()) {
    useSettingsStore.getState().actions.setSettings({
        playback: {
            type: PlayerType.WEB,
        },
    });
}

interface DefaultLayoutProps {
    shell?: boolean;
}

export const DefaultLayout = ({ shell }: DefaultLayoutProps) => {
    const windowBarStyle = useWindowBarStyle();
    const { selectedTheme } = useAppTheme();
    const isRetro = selectedTheme === AppTheme.RETRO_MONOCHROME;

    return (
        <>
            <div
                className={clsx(styles.layout, {
                    [styles.macos]: windowBarStyle === Platform.MACOS,
                    [styles.retro]: isRetro,
                    retro: isRetro,
                    [styles.windows]: windowBarStyle === Platform.WINDOWS,
                })}
                id="default-layout"
            >
                <WindowBar />
                {isRetro && <RetroTopBar />}
                <MainContent shell={shell} />
                <PlayerBar />
                {isRetro && <RetroStatusBar />}
            </div>
            <ContextMenuController.Root />
        </>
    );
};
