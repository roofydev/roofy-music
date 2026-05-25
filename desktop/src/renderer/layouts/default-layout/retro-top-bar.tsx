import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import styles from './retro-top-bar.module.css';

import { AppRoute } from '/@/renderer/router/routes';
import { usePlayerSong } from '/@/renderer/store';
import { Group } from '/@/shared/components/group/group';
import { Icon } from '/@/shared/components/icon/icon';
import { Text } from '/@/shared/components/text/text';

export const RetroTopBar = memo(function RetroTopBar() {
    const { t } = useTranslation();
    const currentTrack = usePlayerSong();

    const playingText = currentTrack
        ? `PLAYING: ${currentTrack.name} — ${currentTrack.artistName || 'UNKNOWN ARTIST'}`
        : undefined;

    return (
        <div className={styles.container} id="retro-top-bar">
            <Group align="center" gap="sm">
                <Text className={styles.brand} size="md">
                    RM
                </Text>
                <span className={styles.separator}>|</span>
                <Text className={styles.title} fw={900} size="lg">
                    ROOFY MUSIC<span className={styles.cursor}>_</span>
                </Text>
                {playingText && (
                    <>
                        <span className={styles.separator}>|</span>
                        <Text className={styles.playing} size="xs">
                            {playingText}
                        </Text>
                    </>
                )}
            </Group>
            <Group align="center" gap="sm">
                <Link
                    aria-label="Open imports"
                    className={styles.importsButton}
                    to={AppRoute.IMPORTS}
                >
                    <Icon icon="download" size="md" />
                </Link>
                <Text className={styles.meta} size="xs">
                    {t('common.server', { count: 1 })}
                </Text>
                <span className={styles.separator}>|</span>
                <Text className={styles.meta} size="xs">
                    v2.0
                </Text>
            </Group>
        </div>
    );
});
