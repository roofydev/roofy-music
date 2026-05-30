import isElectron from 'is-electron';
import { useCallback, useEffect, useState } from 'react';

export type PhoneLinkState = 'connected' | 'disabled' | 'starting' | 'unavailable';

export type PhoneLinkStatus = {
    error?: string;
    mode: 'auto' | 'lan' | 'tunnel';
    phonePaired?: boolean;
    pairingUrl?: string;
    state: PhoneLinkState;
};

const defaultPhoneLink: PhoneLinkStatus = {
    mode: 'tunnel',
    phonePaired: false,
    state: 'disabled',
};

export const usePhoneLink = (pollMs = 2000) => {
    const [phoneLink, setPhoneLink] = useState<PhoneLinkStatus>(defaultPhoneLink);
    const [busy, setBusy] = useState(false);

    const refresh = useCallback(async () => {
        if (!isElectron() || !window.api?.localFirst?.status) {
            setPhoneLink(defaultPhoneLink);
            return;
        }

        try {
            const local = await window.api.localFirst.status();
            if (!local.phoneLink) {
                setPhoneLink({
                    error: 'Restart Roofy Music to enable phone linking, then try again.',
                    mode: 'tunnel',
                    state: 'unavailable',
                });
                return;
            }
            setPhoneLink({
                ...local.phoneLink,
                phonePaired: Boolean(local.phoneLink.phonePaired),
            });
        } catch {
            setPhoneLink({
                error: 'Could not read connection status.',
                mode: 'tunnel',
                state: 'unavailable',
            });
        }
    }, []);

    const start = useCallback(
        async (mode: 'auto' | 'lan' | 'tunnel' = 'auto') => {
            if (!isElectron() || !window.api?.localFirst?.startPhoneLink) return;
            setBusy(true);
            try {
                await window.api.localFirst.startPhoneLink(mode);
                await refresh();
            } finally {
                setBusy(false);
            }
        },
        [refresh],
    );

    const stop = useCallback(async () => {
        if (!isElectron() || !window.api?.localFirst?.stopPhoneLink) return;
        setBusy(true);
        try {
            await window.api.localFirst.stopPhoneLink();
            await refresh();
        } finally {
            setBusy(false);
        }
    }, [refresh]);

    useEffect(() => {
        refresh();
        if (!isElectron()) return;
        const delay =
            phoneLink.state === 'starting' ? Math.min(pollMs, 1000) : pollMs > 0 ? pollMs : 8000;
        const id = window.setInterval(refresh, delay);
        return () => window.clearInterval(id);
    }, [phoneLink.state, pollMs, refresh]);

    useEffect(() => {
        if (!busy || !isElectron()) return;
        const id = window.setInterval(refresh, 500);
        return () => window.clearInterval(id);
    }, [busy, refresh]);

    return {
        busy,
        phoneLink,
        refresh,
        start,
        stop,
    };
};
