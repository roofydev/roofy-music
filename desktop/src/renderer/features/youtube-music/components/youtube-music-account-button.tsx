import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import isElectron from 'is-electron';
import { useEffect, useState } from 'react';

import styles from './youtube-music-account-button.module.css';

import { queryClient } from '/@/renderer/lib/react-query';
import { Button } from '/@/shared/components/button/button';
import { Group } from '/@/shared/components/group/group';
import { Icon } from '/@/shared/components/icon/icon';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';

interface YoutubeMusicAccountButtonProps {
    compact?: boolean;
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

export const YoutubeMusicAccountButton = ({ compact }: YoutubeMusicAccountButtonProps) => {
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

    const handleConnect = async () => {
        try {
            const nextStatus = await window.api.youtubeMusic.connect();
            queryClient.setQueryData(youtubeMusicAuthStatusQueryKey, nextStatus);
            queryClient.invalidateQueries({ queryKey: ['youtube-music'] });
        } catch (error) {
            toast.error({ message: (error as Error).message });
        }
    };

    const handleDisconnect = async () => {
        try {
            const nextStatus = await window.api.youtubeMusic.disconnect();
            queryClient.setQueryData(youtubeMusicAuthStatusQueryKey, nextStatus);
            queryClient.invalidateQueries({ queryKey: ['youtube-music'] });
        } catch (error) {
            toast.error({ message: (error as Error).message });
        }
    };

    if (!isConnected) {
        return (
            <Button
                className={styles.loginButton}
                disabled={status?.dependencyAvailable === false}
                leftSection={<Icon icon="signIn" size="sm" />}
                onClick={handleConnect}
                size="compact-sm"
                variant="subtle"
            >
                YouTube Music Login
            </Button>
        );
    }

    const displayName = status?.displayName || 'YouTube Music';

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
            {!compact && (
                <Text className={styles.name} overflow="hidden" size="xs">
                    {displayName}
                </Text>
            )}
            <Button onClick={handleDisconnect} size="compact-sm" variant="subtle">
                Logout
            </Button>
        </Group>
    );
};
