import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import isElectron from 'is-electron';
import { KeyboardEvent, MouseEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import styles from './youtube-music-account-button.module.css';

import { queryClient } from '/@/renderer/lib/react-query';
import { Button } from '/@/shared/components/button/button';
import { Group } from '/@/shared/components/group/group';
import { Icon } from '/@/shared/components/icon/icon';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';

interface YoutubeMusicAccountButtonProps {
    compact?: boolean;
    labelMode?: 'auth-only' | 'default';
}

export const youtubeMusicAuthStatusQueryKey = ['youtube-music', 'auth-status'];

const initials = (name: null | string | undefined) => {
    if (!name) return 'YT';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'YT';
    return parts
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join('');
};

export const YoutubeMusicAccountButton = ({
    compact,
    labelMode = 'default',
}: YoutubeMusicAccountButtonProps) => {
    const { t } = useTranslation();
    const [avatarFailed, setAvatarFailed] = useState(false);
    const enabled = isElectron() && Boolean(window.api?.youtubeMusic?.status);
    const statusQuery = useQuery({
        enabled,
        queryFn: () => window.api.youtubeMusic.status(),
        queryKey: youtubeMusicAuthStatusQueryKey,
        staleTime: 30_000,
    });

    const status = statusQuery.data;
    const isConnected = Boolean(status?.connected);
    const avatarUrl = status?.avatarUrl || null;

    useEffect(() => {
        setAvatarFailed(false);
    }, [avatarUrl]);

    if (!enabled) return null;

    const handleConnect = async (event?: MouseEvent<HTMLElement>) => {
        event?.preventDefault();
        event?.stopPropagation();
        try {
            const nextStatus = await window.api.youtubeMusic.connect();
            queryClient.setQueryData(youtubeMusicAuthStatusQueryKey, nextStatus);
            queryClient.invalidateQueries({ queryKey: ['youtube-music'] });
        } catch (error) {
            toast.error({ message: (error as Error).message });
        }
    };

    const handleDisconnect = async (event?: MouseEvent<HTMLElement>) => {
        event?.preventDefault();
        event?.stopPropagation();
        try {
            const nextStatus = await window.api.youtubeMusic.disconnect();
            queryClient.setQueryData(youtubeMusicAuthStatusQueryKey, nextStatus);
            queryClient.invalidateQueries({ queryKey: ['youtube-music'] });
        } catch (error) {
            toast.error({ message: (error as Error).message });
        }
    };

    const handleAuthKeyDown = (
        event: KeyboardEvent<HTMLSpanElement>,
        action: (event?: MouseEvent<HTMLElement>) => Promise<void>,
    ) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        action();
    };

    if (!isConnected) {
        if (labelMode === 'auth-only') {
            return (
                <span
                    aria-disabled={status?.dependencyAvailable === false}
                    className={clsx(styles.authButton, styles.loginButton)}
                    onClick={status?.dependencyAvailable === false ? undefined : handleConnect}
                    onKeyDown={(event) => {
                        if (status?.dependencyAvailable === false) return;
                        handleAuthKeyDown(event, handleConnect);
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    role="button"
                    tabIndex={status?.dependencyAvailable === false ? -1 : 0}
                >
                    Login
                </span>
            );
        }

        return (
            <Button
                className={styles.loginButton}
                disabled={status?.dependencyAvailable === false}
                leftSection={<Icon icon="signIn" size="sm" />}
                onClick={handleConnect}
                size="compact-sm"
                variant="subtle"
            >
                {t('productUx.search.youtubeMusic.loginButton')}
            </Button>
        );
    }

    const displayName =
        status?.displayName || t('productUx.search.youtubeMusic.heading');

    return (
        <Group
            className={clsx(styles.account, { [styles.compact]: compact })}
            gap="xs"
            wrap="nowrap"
        >
            <div className={styles.avatar} title={displayName}>
                {avatarUrl && !avatarFailed ? (
                    <img
                        alt=""
                        className={styles.avatarImage}
                        onError={() => setAvatarFailed(true)}
                        src={avatarUrl}
                    />
                ) : (
                    initials(displayName)
                )}
            </div>
            {!compact && labelMode !== 'auth-only' && (
                <Text className={styles.name} overflow="hidden" size="xs">
                    {displayName}
                </Text>
            )}
            {labelMode === 'auth-only' ? (
                <span
                    className={styles.authButton}
                    onClick={handleDisconnect}
                    onKeyDown={(event) => handleAuthKeyDown(event, handleDisconnect)}
                    onMouseDown={(event) => event.stopPropagation()}
                    role="button"
                    tabIndex={0}
                >
                    Logout
                </span>
            ) : (
                <Button onClick={handleDisconnect} size="compact-sm" variant="subtle">
                    Logout
                </Button>
            )}
        </Group>
    );
};
