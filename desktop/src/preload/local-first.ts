import { ipcRenderer } from 'electron';

const status = () => ipcRenderer.invoke('roofy-local-status');
const start = () => ipcRenderer.invoke('roofy-local-start');
const stop = () => ipcRenderer.invoke('roofy-local-stop');
const startPairing = (mode: 'lan' | 'tunnel' = 'tunnel') =>
    ipcRenderer.invoke('roofy-local-start-pairing', mode);
const stopPairing = () => ipcRenderer.invoke('roofy-local-stop-pairing');
const startMobileImport = (mode: 'lan' | 'tunnel' = 'tunnel') =>
    ipcRenderer.invoke('roofy-local-start-mobile-import', mode);
const stopMobileImport = () => ipcRenderer.invoke('roofy-local-stop-mobile-import');
const startPhoneLink = (mode: 'auto' | 'lan' | 'tunnel' = 'auto') =>
    ipcRenderer.invoke('roofy-local-start-phone-link', mode);
const stopPhoneLink = () => ipcRenderer.invoke('roofy-local-stop-phone-link');
const selectLibrary = () => ipcRenderer.invoke('roofy-local-select-library');
const openLibraryFolder = () => ipcRenderer.invoke('roofy-local-open-library-folder');
const setAutoEnrichMetadata = (enabled: boolean) =>
    ipcRenderer.invoke('roofy-local-set-auto-enrich-metadata', enabled);
const enrichAudioFile = (filePath: string) =>
    ipcRenderer.invoke('roofy-local-enrich-audio-file', filePath);
const probeAudioTags = (filePath: string) =>
    ipcRenderer.invoke('roofy-local-probe-audio-tags', filePath);
const writeAudioTags = (args: {
    album?: string;
    albumArtist?: string;
    artist?: string;
    artworkUrl?: string;
    filePath: string;
    title: string;
}) => ipcRenderer.invoke('roofy-local-write-audio-tags', args);
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

type ImportSource = 'soundcloud' | 'spotify' | 'youtube_music';

type ImportSourceTrack = {
    album?: string;
    albumArtist?: string;
    artist?: string;
    artists?: string[];
    artworkUrl?: string;
    discNumber?: number;
    durationMs?: number;
    explicit?: boolean;
    isrc?: string;
    matchConfidence?: number;
    matchState?: 'in_library' | 'matched' | 'needs_review' | 'unavailable';
    releaseDate?: string;
    resolvedSource?: ImportSource;
    resolvedSourceTrackId?: string;
    resolvedSourceUrl?: string;
    source?: ImportSource;
    sourceTrackId?: string;
    sourceUrl?: string;
    title: string;
    trackNumber?: number;
};

const createImport = (args: {
    album?: string;
    albumArtist?: string;
    artist?: string;
    artists?: string[];
    artworkUrl?: string;
    audioFormat?: string;
    cookieBrowser?: string;
    createPlaylist?: boolean;
    discNumber?: number;
    imageUrl?: string;
    input: string;
    playlist?: boolean;
    playlistName?: string;
    releaseDate?: string;
    saveVideo?: boolean;
    source?: ImportSource;
    sourcePlaylistId?: string;
    sourceTrackId?: string;
    sourceTracks?: ImportSourceTrack[];
    sourceUrl?: string;
    title?: string;
    trackNumber?: number;
    videoId?: string;
}) => {
    return ipcRenderer.invoke('roofy-local-create-import', args);
};

const spotifyStatus = () => ipcRenderer.invoke('roofy-local-spotify-status');
const connectSpotify = () => ipcRenderer.invoke('roofy-local-spotify-connect');
const disconnectSpotify = () => ipcRenderer.invoke('roofy-local-spotify-disconnect');
const setSpotifyClientId = (clientId: string) =>
    ipcRenderer.invoke('roofy-local-spotify-client-id', clientId);
const cancelImport = (id: string) => {
    return ipcRenderer.invoke('roofy-local-cancel-import', id);
};
const removeImport = (id: string) => {
    return ipcRenderer.invoke('roofy-local-remove-import', id);
};
const clearImports = (status: 'completed' | 'failed') => {
    return ipcRenderer.invoke('roofy-local-clear-imports', status);
};
const deleteTracks = (songIds: string[]) => {
    return ipcRenderer.invoke('roofy-local-delete-tracks', songIds);
};

const getVideoMetadata = (args: {
    path?: null | string;
    songId?: string;
    youtubeMusic?: {
        videoId?: string;
        watchUrl?: string;
    };
}) => {
    return ipcRenderer.invoke('roofy-local-get-video-metadata', args);
};

const downloadVideoForSong = (args: {
    path?: null | string;
    songId: string;
    title?: string;
    youtubeMusic?: {
        videoId?: string;
        watchUrl?: string;
    };
}) => {
    return ipcRenderer.invoke('roofy-local-download-video-for-song', args);
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
    connectSpotify,
    createImport,
    createUser,
    credentials,
    deleteTracks,
    disconnectSpotify,
    enrichAudioFile,
    downloadVideoForSong,
    getVideoMetadata,
    onPlaylistImported,
    openLibraryFolder,
    previewImport,
    removeImport,
    selectLibrary,
    setAutoEnrichMetadata,
    setSpotifyClientId,
    spotifyStatus,
    start,
    startMobileImport,
    startPairing,
    startPhoneLink,
    status,
    stop,
    stopMobileImport,
    stopPairing,
    stopPhoneLink,
    probeAudioTags,
    writeAudioTags,
};

export type LocalFirst = typeof localFirst;
