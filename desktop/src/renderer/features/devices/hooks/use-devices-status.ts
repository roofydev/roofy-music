import isElectron from 'is-electron';
import { useCallback, useEffect, useState } from 'react';

import { useRemoteSettings } from '/@/renderer/store';
import type { DeviceActiveOutput } from '/@/shared/types/device-session-types';

export type DeviceConnectionState = 'connected' | 'disabled' | 'starting' | 'unavailable';

export type DevicesStatus = {
    phoneLink: {
        activeDeviceName?: string;
        activeOutput: DeviceActiveOutput;
        bridgeReady?: boolean;
        error?: string;
        libraryReady?: boolean;
        phoneControllingDesktop: boolean;
        phoneName?: string;
        phonePaired: boolean;
        phoneReachable: boolean;
        remoteReady?: boolean;
        state: DeviceConnectionState;
    };
    webRemote: {
        enabled: boolean;
        url: string;
    };
};

const defaultStatus: DevicesStatus = {
    phoneLink: {
        activeOutput: 'none',
        phoneControllingDesktop: false,
        phonePaired: false,
        phoneReachable: false,
        state: 'disabled',
    },
    webRemote: { enabled: false, url: 'http://localhost:4534' },
};

export const useDevicesStatus = (pollMs = 8000) => {
    const remote = useRemoteSettings();
    const [status, setStatus] = useState<DevicesStatus>(defaultStatus);
    const [loading, setLoading] = useState(false);

    const refresh = useCallback(async () => {
        if (!isElectron() || !window.api?.localFirst?.status) {
            setStatus({
                ...defaultStatus,
                webRemote: {
                    enabled: remote.enabled,
                    url: `http://localhost:${remote.port}`,
                },
            });
            return;
        }

        setLoading(true);
        try {
            const local = await window.api.localFirst.status();
            setStatus({
                phoneLink: {
                    activeDeviceName: local.phoneLink?.activeDeviceName,
                    activeOutput: local.phoneLink?.activeOutput || 'none',
                    bridgeReady: local.phoneLink?.bridgeReady,
                    error: local.phoneLink?.error,
                    libraryReady: local.phoneLink?.libraryReady,
                    phoneControllingDesktop: Boolean(local.phoneLink?.phoneControllingDesktop),
                    phoneName: local.phoneLink?.phoneName,
                    phonePaired: Boolean(local.phoneLink?.phonePaired),
                    phoneReachable: Boolean(local.phoneLink?.phoneReachable),
                    remoteReady: local.phoneLink?.remoteReady,
                    state: local.phoneLink?.state || 'disabled',
                },
                webRemote: {
                    enabled: remote.enabled,
                    url: `http://localhost:${remote.port}`,
                },
            });
        } finally {
            setLoading(false);
        }
    }, [remote.enabled, remote.port]);

    useEffect(() => {
        refresh();
        if (!isElectron()) return;
        const id = window.setInterval(refresh, pollMs);
        return () => window.clearInterval(id);
    }, [pollMs, refresh]);

    return { loading, refresh, status };
};
