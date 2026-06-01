import { ipcMain } from 'electron';

import { getMainWindow } from '/@/main/index';
import { HandoffSnapshot } from '/@/shared/types/handoff-types';

let pendingStateResolve: ((state: HandoffSnapshot) => void) | null = null;
let pendingStateReject: ((error: Error) => void) | null = null;

const clearPending = () => {
    pendingStateResolve = null;
    pendingStateReject = null;
};

export const requestHandoffState = (): Promise<HandoffSnapshot> =>
    new Promise((resolve, reject) => {
        const win = getMainWindow();
        if (!win) {
            reject(new Error('Desktop player is not ready.'));
            return;
        }

        if (pendingStateResolve) {
            reject(new Error('A handoff request is already in progress.'));
            return;
        }

        const timeout = setTimeout(() => {
            clearPending();
            reject(new Error('Timed out waiting for desktop player state.'));
        }, 8000);

        pendingStateResolve = (state) => {
            clearTimeout(timeout);
            clearPending();
            resolve(state);
        };

        pendingStateReject = (error) => {
            clearTimeout(timeout);
            clearPending();
            reject(error);
        };

        win.webContents.send('handoff:collect-state');
    });

export const applyHandoffState = (snapshot: HandoffSnapshot) => {
    getMainWindow()?.webContents.send('handoff:apply-state', snapshot);
};

ipcMain.on('handoff:state-response', (_event, state: HandoffSnapshot) => {
    pendingStateResolve?.(state);
});

ipcMain.on('handoff:state-error', (_event, message: string) => {
    pendingStateReject?.(new Error(message || 'Failed to read player state.'));
});
