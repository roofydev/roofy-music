import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import styles from './retro-top-bar.module.css';

import { Group } from '/@/shared/components/group/group';
import { Text } from '/@/shared/components/text/text';

export const RetroTopBar = memo(function RetroTopBar() {
    const { t } = useTranslation();

    return (
        <div className={styles.container} id="retro-top-bar">
            <Group align="center" gap="sm">
                <Text className={styles.title} fw={700} size="lg">
                    ROOFY<span className={styles.cursor}>_</span>
                </Text>
            </Group>
            <Group align="center" gap="sm">
                <span className={styles.separator}>|</span>
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
