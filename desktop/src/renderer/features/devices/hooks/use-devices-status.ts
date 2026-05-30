import isElectron from 'is-electron';
import { useCallback, useEffect, useState } from 'react';

import { useRemoteSettings } from '/@/renderer/store';

export type DeviceConnectionState = 'connected' | 'disabled' | 'starting' | 'unavailable';

export type DevicesStatus = {
    phoneLink: {
        error?: string;
        phonePaired: boolean;
        state: DeviceConnectionState;
    };
    webRemote: {
        enabled: boolean;
        url: string;
    };
};

const defaultStatus: DevicesStatus = {
    phoneLink: { phonePaired: false, state: 'disabled' },
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
                    error: local.phoneLink?.error,
                    phonePaired: Boolean(local.phoneLink?.phonePaired),
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
