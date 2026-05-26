import clsx from 'clsx';
import isElectron from 'is-electron';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import styles from './fullscreen-video-overlay.module.css';

import { Playerbar } from '/@/renderer/features/player/components/playerbar';
import {
    VideoModeOverlay,
    type LocalVideoMetadata,
} from '/@/renderer/features/player/components/local-video-player';

const CHROME_IDLE_MS = 2500;

interface FullscreenVideoOverlayProps {
    metadata: NonNullable<LocalVideoMetadata>;
    onExit: () => void;
}

export const FullscreenVideoOverlay = ({ metadata, onExit }: FullscreenVideoOverlayProps) => {
    const onExitRef = useRef(onExit);
    onExitRef.current = onExit;
    const [chromeVisible, setChromeVisible] = useState(true);
    const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const revealChrome = useCallback(() => {
        setChromeVisible(true);
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        idleTimerRef.current = setTimeout(() => setChromeVisible(false), CHROME_IDLE_MS);
    }, []);

    useEffect(() => {
        revealChrome();
        return () => {
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        };
    }, [revealChrome]);

    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        if (isElectron() && window.api?.browser?.setVideoFullscreen) {
            window.api.browser.setVideoFullscreen(true);
        }

        const unsubscribeNativeExit = window.api?.browser?.onVideoFullscreenExited?.(() => {
            onExitRef.current();
        });

        return () => {
            document.body.style.overflow = previousOverflow;
            unsubscribeNativeExit?.();
            if (isElectron() && window.api?.browser?.setVideoFullscreen) {
                window.api.browser.setVideoFullscreen(false);
            }
        };
    }, []);

    return createPortal(
        <div
            className={styles.overlay}
            data-video-fullscreen
            onMouseMove={revealChrome}
            onPointerDown={revealChrome}
        >
            <div className={styles.videoStage}>
                <VideoModeOverlay metadata={metadata} />
            </div>
            <div className={styles.chrome}>
                <div
                    className={clsx(styles.chromePanel, {
                        [styles.chromePanelVisible]: chromeVisible,
                    })}
                >
                    <div className={styles.playerBar}>
                        <Playerbar />
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
};
