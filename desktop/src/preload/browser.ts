import { ipcRenderer } from 'electron';

const exit = () => {
    ipcRenderer.send('window-close');
};

const maximize = () => {
    ipcRenderer.send('window-maximize');
};

const minimize = () => {
    ipcRenderer.send('window-minimize');
};

const unmaximize = () => {
    ipcRenderer.send('window-unmaximize');
};

const quit = () => {
    ipcRenderer.send('window-quit');
};

const devtools = () => {
    ipcRenderer.send('window-dev-tools');
};

const clearCache = (): Promise<void> => {
    return ipcRenderer.invoke('window-clear-cache');
};

const setVideoFullscreen = (enabled: boolean) => {
    ipcRenderer.send('window-video-fullscreen', enabled);
};

const onVideoFullscreenExited = (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on('window-video-fullscreen-exited', listener);
    return () => {
        ipcRenderer.removeListener('window-video-fullscreen-exited', listener);
    };
};

export const browser = {
    clearCache,
    devtools,
    exit,
    maximize,
    minimize,
    onVideoFullscreenExited,
    quit,
    setVideoFullscreen,
    unmaximize,
};

export type Browser = typeof browser;
