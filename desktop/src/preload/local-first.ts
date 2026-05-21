import { ipcRenderer } from 'electron';

const status = () => ipcRenderer.invoke('roofy-local-status');
const start = () => ipcRenderer.invoke('roofy-local-start');
const stop = () => ipcRenderer.invoke('roofy-local-stop');
const selectLibrary = () => ipcRenderer.invoke('roofy-local-select-library');
const openLibraryFolder = () => ipcRenderer.invoke('roofy-local-open-library-folder');
const credentials = () => ipcRenderer.invoke('roofy-local-credentials');
const createUser = (args: {
    email?: string;
    isAdmin?: boolean;
    name?: string;
    password: string;
    username: string;
}) => ipcRenderer.invoke('roofy-local-create-user', args);

const previewImport = (args: { cookieBrowser?: string; input: string; playlist?: boolean }) => {
    return ipcRenderer.invoke('roofy-local-preview-import', args);
};

const createImport = (args: {
    album?: string;
    artist?: string;
    audioFormat?: string;
    cookieBrowser?: string;
    createPlaylist?: boolean;
    imageUrl?: string;
    input: string;
    playlist?: boolean;
    playlistName?: string;
    source?: 'youtube_music';
    sourceTrackId?: string;
    title?: string;
    videoId?: string;
}) => {
    return ipcRenderer.invoke('roofy-local-create-import', args);
};

const cancelImport = (id: string) => {
    return ipcRenderer.invoke('roofy-local-cancel-import', id);
};
const removeImport = (id: string) => {
    return ipcRenderer.invoke('roofy-local-remove-import', id);
};
const clearImports = (status: 'completed' | 'failed') => {
    return ipcRenderer.invoke('roofy-local-clear-imports', status);
};

const onPlaylistImported = (cb: () => void) => {
    ipcRenderer.on('roofy-local-playlist-imported', cb);
    return () => {
        ipcRenderer.removeListener('roofy-local-playlist-imported', cb);
    };
};

export const localFirst = {
    cancelImport,
    clearImports,
    createImport,
    createUser,
    credentials,
    onPlaylistImported,
    openLibraryFolder,
    previewImport,
    removeImport,
    selectLibrary,
    start,
    status,
    stop,
};

export type LocalFirst = typeof localFirst;
