import { useCallback, useState } from 'react';

import { usePartySettings, useSettingsStoreActions } from '/@/renderer/store';
import { toast } from '/@/shared/components/toast/toast';
import { PartyControlMode, PartyExposureMode } from '/@/shared/types/party-types';

const party = window.api?.party ?? null;

export const usePartyActions = () => {
    const partySettings = usePartySettings();
    const { setSettings } = useSettingsStoreActions();
    const [starting, setStarting] = useState(false);

    const persistSettings = useCallback(
        (updates: Partial<typeof partySettings>) => {
            setSettings({ party: { ...partySettings, ...updates } });
        },
        [partySettings, setSettings],
    );

    const startParty = useCallback(
        async (overrides?: Partial<typeof partySettings>) => {
            if (!party) return;
            setStarting(true);
            try {
                const config = { ...partySettings, ...overrides };
                persistSettings(config);
                const result = await party.start(config);
                if (result.error) {
                    toast.error({ message: result.error, title: 'Could not start party' });
                }
            } finally {
                setStarting(false);
            }
        },
        [partySettings, persistSettings],
    );

    const stopParty = useCallback(async () => {
        await party?.stop();
    }, []);

    const copyLink = useCallback(async (joinUrl?: string) => {
        if (!joinUrl) return;
        await navigator.clipboard.writeText(joinUrl);
        toast.success({ message: joinUrl, title: 'Party link copied' });
    }, []);

    const updateLiveSettings = useCallback(
        async (updates: Partial<typeof partySettings>) => {
            persistSettings(updates);
            await party?.updateSettings(updates);
        },
        [persistSettings],
    );

    const updateAccessMode = useCallback(
        async (isPublic: boolean) => {
            await updateLiveSettings({ autoApproveJoins: isPublic });
        },
        [updateLiveSettings],
    );

    const updateControlMode = useCallback(
        async (controlMode: PartyControlMode) => {
            await updateLiveSettings({ controlMode });
        },
        [updateLiveSettings],
    );

    const updateExposureMode = useCallback(
        async (exposureMode: PartyExposureMode) => {
            persistSettings({ exposureMode });
        },
        [persistSettings],
    );

    return {
        copyLink,
        partySettings,
        persistSettings,
        starting,
        startParty,
        stopParty,
        updateAccessMode,
        updateControlMode,
        updateExposureMode,
        updateLiveSettings,
    };
};
