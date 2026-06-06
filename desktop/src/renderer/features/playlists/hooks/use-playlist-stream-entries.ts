import isElectron from 'is-electron';
import { useCallback, useEffect, useState } from 'react';

import type { PlaylistStreamEntry } from '/@/preload/local-first';

export const usePlaylistStreamEntries = (playlistId: string) => {
    const [entries, setEntries] = useState<PlaylistStreamEntry[]>([]);

    const refresh = useCallback(async () => {
        if (!isElectron() || !window.api?.localFirst?.getPlaylistStreamEntries || !playlistId) {
            setEntries([]);
            return;
        }

        try {
            const next = await window.api.localFirst.getPlaylistStreamEntries(playlistId);
            setEntries(Array.isArray(next) ? next : []);
        } catch {
            setEntries([]);
        }
    }, [playlistId]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    useEffect(() => {
        if (!isElectron() || !window.api?.localFirst?.onPlaylistStreamEntriesUpdated) {
            return;
        }

        return window.api.localFirst.onPlaylistStreamEntriesUpdated((_event, updatedPlaylistId) => {
            if (!updatedPlaylistId || updatedPlaylistId === playlistId) {
                void refresh();
            }
        });
    }, [playlistId, refresh]);

    return entries;
};
