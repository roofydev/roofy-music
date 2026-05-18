import { ipcRenderer } from 'electron';

const SEND_CHANNELS = new Set<string>([
    'app-restart',
    'set-global-shortcuts',
    'settings-set',
    'update-playback',
    'update-private-mode',
    'update-repeat',
    'update-shuffle',
    'update-sidebar-collapsed',
]);
const INVOKE_CHANNELS = new Set<string>([
    'power-save-blocker-start',
    'power-save-blocker-stop',
]);
const LISTEN_CHANNELS = new Set<string>([
    'custom-font-error',
    'mpris-request-toggle-repeat',
    'mpris-request-toggle-shuffle',
    'renderer-open-command-palette',
    'renderer-open-manage-servers',
    'renderer-open-release-notes',
    'renderer-open-settings',
    'renderer-player-auto-next',
    'renderer-player-error',
    'renderer-player-next',
    'renderer-player-pause',
    'renderer-player-play',
    'renderer-player-play-pause',
    'renderer-player-previous',
    'renderer-player-skip-backward',
    'renderer-player-skip-forward',
    'renderer-player-stop',
    'renderer-player-toggle-repeat',
    'renderer-player-toggle-shuffle',
    'renderer-player-volume-down',
    'renderer-player-volume-mute',
    'renderer-player-volume-up',
    'renderer-toggle-private-mode',
    'renderer-toggle-sidebar',
    'request-favorite',
    'request-position',
    'request-rating',
    'request-seek',
    'request-volume',
    'update-available',
]);

const assertAllowed = (allowed: Set<string>, channel: string) => {
    if (!allowed.has(channel)) {
        throw new Error(`IPC channel is not exposed to the renderer: ${channel}`);
    }
};

const removeAllListeners = (channel: string) => {
    assertAllowed(LISTEN_CHANNELS, channel);
    ipcRenderer.removeAllListeners(channel);
};

const send = (channel: string, ...args: any[]) => {
    assertAllowed(SEND_CHANNELS, channel);
    ipcRenderer.send(channel, ...args);
};

const invoke = (channel: string, ...args: any[]) => {
    assertAllowed(INVOKE_CHANNELS, channel);
    return ipcRenderer.invoke(channel, ...args);
};

const on = (channel: string, listener: (event: any, ...args: any[]) => void) => {
    assertAllowed(LISTEN_CHANNELS, channel);
    ipcRenderer.on(channel, listener);
};

const removeListener = (channel: string, listener: (event: any, ...args: any[]) => void) => {
    assertAllowed(LISTEN_CHANNELS, channel);
    ipcRenderer.removeListener(channel, listener);
};

export const ipc = {
    invoke,
    on,
    removeAllListeners,
    removeListener,
    send,
};

export type Ipc = typeof ipc;
