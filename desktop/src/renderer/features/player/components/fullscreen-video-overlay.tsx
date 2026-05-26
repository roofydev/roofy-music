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
import { useNativeAspectRatio } from '/@/renderer/store';

const CHROME_IDLE_MS = 2500;

interface FullscreenVideoOverlayProps {
    imageExplicit?: boolean;
    imageSrc?: string;
    metadata?: NonNullable<LocalVideoMetadata>;
    mode: 'image' | 'video';
    onExit: () => void;
}

export const FullscreenVideoOverlay = ({
    imageExplicit = false,
    imageSrc,
    metadata,
    mode,
    onExit,
}: FullscreenVideoOverlayProps) => {
    const nativeAspectRatio = useNativeAspectRatio();
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

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onExitRef.current();
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', handleKeyDown);
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
            <div className={styles.mediaStage}>
                {mode === 'video' && metadata ? (
                    <VideoModeOverlay metadata={metadata} />
                ) : (
                    imageSrc && (
                        <img
                            alt=""
                            className={clsx(styles.fullscreenImage, {
                                [styles.fullscreenImageCensored]: imageExplicit,
                            })}
                            draggable={false}
                            src={imageSrc}
                            style={{
                                objectFit: nativeAspectRatio ? 'contain' : 'cover',
                            }}
                        />
                    )
                )}
                <div aria-hidden className={styles.stageScrim} />
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
