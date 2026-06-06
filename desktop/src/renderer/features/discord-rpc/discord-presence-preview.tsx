import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import styles from '/@/renderer/features/discord-rpc/discord-presence-preview.module.css';
import { useDiscordSettings } from '/@/renderer/store';
import { Text } from '/@/shared/components/text/text';

export const DiscordPresencePreview = memo(() => {
    const { t } = useTranslation();
    const { enabled } = useDiscordSettings();

    if (!enabled) {
        return null;
    }

    return (
        <div className={styles.preview}>
            <div className={styles.header}>
                <span aria-hidden className={styles.headerDot} />
                {t('setting.discordPresencePreviewHeading')}
            </div>
            <div className={styles.body}>
                <div aria-hidden className={styles.artwork} />
                <div className={styles.meta}>
                    <div className={styles.appName}>Roofy Music Desktop</div>
                    <div className={styles.songTitle}>
                        {t('setting.discordPresencePreviewSong')}
                    </div>
                    <div className={styles.artist}>
                        {t('setting.discordPresencePreviewArtist')}
                    </div>
                    <div className={styles.elapsed}>
                        {t('setting.discordPresencePreviewElapsed')}
                    </div>
                </div>
            </div>
            <div className={styles.actions}>
                <button className={`${styles.button} ${styles.buttonPrimary}`} type="button">
                    {t('setting.discordListenNow')}
                </button>
            </div>
            <div className={styles.footer}>
                <Text isMuted size="sm">
                    {t('setting.discordListenNow_description')}
                </Text>
            </div>
        </div>
    );
});
