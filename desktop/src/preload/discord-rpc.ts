import type { SetActivity } from '@xhayper/discord-rpc';

import { ipcRenderer } from 'electron';

const initialize = (clientId: string) => {
    const client = ipcRenderer.invoke('discord-rpc-initialize', clientId);
    return client;
};

const isConnected = () => {
    const isConnected = ipcRenderer.invoke('discord-rpc-is-connected');
    return isConnected;
};

const clearActivity = () => {
    ipcRenderer.invoke('discord-rpc-clear-activity');
};

const setActivity = (activity: SetActivity) => {
    ipcRenderer.invoke('discord-rpc-set-activity', activity);
};

const quit = () => {
    ipcRenderer.invoke('discord-rpc-quit');
};

const uploadArtwork = (args: { cacheKey?: string; imageUrl: string; webhookUrl?: string }) => {
    return ipcRenderer.invoke('discord-rpc-upload-artwork', args) as Promise<null | string>;
};

export const discordRpc = {
    clearActivity,
    initialize,
    isConnected,
    quit,
    setActivity,
    uploadArtwork,
};

export type DiscordRpc = typeof discordRpc;
