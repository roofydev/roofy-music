import { ChildProcessWithoutNullStreams, spawn, spawnSync } from 'child_process';
import { randomBytes, randomUUID } from 'crypto';
import { app, dialog, ipcMain, shell } from 'electron';
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

import { store } from '../settings';

import { getMainWindow } from '/@/main/index';

type CreateLocalUserArgs = {
    email?: string;
    isAdmin?: boolean;
    name?: string;
    password: string;
    username: string;
};

type ImportJob = {
    album?: string;
    artist?: string;
    audioFormat: string;
    cookieBrowser: string;
    createdAt: string;
    createPlaylist: boolean;
    downloadedCount?: number;
    error: string;
    expectedFiles?: string[];
    id: string;
    imageUrl?: string;
    input: string;
    message: string;
    name?: string;
    playlist: boolean;
    playlistName?: string;
    progress: number;
    saveVideo?: boolean;
    skippedCount?: number;
    source?: 'youtube_music';
    sourceTrackId?: string;
    status: 'cancelled' | 'completed' | 'failed' | 'queued' | 'running';
    targetPlaylistIds?: string[];
    targetPlaylistNames?: string[];
    title?: string;
    updatedAt: string;
    videoDownloadedCount?: number;
    videoId?: string;
    warning?: string;
};

type LocalFirstStatus = {
    dataPath: string;
    imports: ImportJob[];
    libraryPath: string;
    navidrome: {
        available: boolean;
        binaryPath: null | string;
        configPath: string;
        message: string;
        password?: string;
        pid: null | number;
        running: boolean;
        url: string;
        username: string;
    };
    tools: {
        deno: boolean;
        ffmpeg: boolean;
        navidrome: boolean;
        ytDlp: boolean;
    };
};

type LocalVideoMetadata = {
    audioPath: string;
    songId?: string;
    sourceUrl?: string;
    title?: string;
    updatedAt: string;
    videoId?: string;
    videoPath?: string;
};

type SourceImportMetadata = {
    album?: string;
    artist?: string;
    imageUrl?: string;
    source?: 'youtube_music';
    sourceTrackId?: string;
    title?: string;
    videoId?: string;
};

const LOCAL_SERVER_ID = 'roofy-local-navidrome';
const LOCAL_SERVER_USERNAME = 'admin';
const IMPORT_JOBS_KEY = 'roofy.importJobs';
const LOCAL_VIDEO_METADATA_KEY = 'roofy.localVideoMetadata';
const DEFAULT_PORT = 4533;
const DEFAULT_IMPORT_FORMAT = 'best';
const COOKIE_BROWSER_ALLOWLIST = new Set([
    '',
    'auto',
    'brave',
    'chrome',
    'chromium',
    'edge',
    'firefox',
    'opera',
    'vivaldi',
]);
const COOKIE_BROWSER_AUTO_ATTEMPTS = [
    'edge',
    'chrome',
    'brave',
    'firefox',
    'vivaldi',
    'chromium',
    'opera',
];

const now = () => new Date().toISOString();

let navidromeProcess: ChildProcessWithoutNullStreams | null = null;
let activeImport: null | { child: ChildProcessWithoutNullStreams; id: string } = null;

const loadImportJobs = (): ImportJob[] => {
    const savedJobs = store.get(IMPORT_JOBS_KEY) as ImportJob[] | undefined;
    if (!Array.isArray(savedJobs)) return [];

    return savedJobs
        .filter((job) => job?.id)
        .map((job) => ({
            ...job,
            error: job.error || '',
            message: job.status === 'running' ? 'Interrupted when Roofy closed' : job.message || '',
            progress: job.status === 'completed' ? 100 : job.progress || 0,
            status: job.status === 'running' ? 'failed' : job.status,
            updatedAt: job.updatedAt || now(),
            warning: job.warning || '',
        }));
};

const importJobs: ImportJob[] = loadImportJobs();

const loadLocalVideoMetadata = (): LocalVideoMetadata[] => {
    const saved = store.get(LOCAL_VIDEO_METADATA_KEY) as LocalVideoMetadata[] | undefined;
    if (!Array.isArray(saved)) return [];

    return saved.filter((item) => item?.audioPath);
};

const localVideoMetadata = loadLocalVideoMetadata();

const persistLocalVideoMetadata = () => {
    store.set(LOCAL_VIDEO_METADATA_KEY, localVideoMetadata.slice(0, 10000));
};

const persistImportJobs = () => {
    store.set(IMPORT_JOBS_KEY, importJobs.slice(0, 500));
};

const getLocalRoot = () => path.join(app.getPath('userData'), 'local-first');
const getDataPath = () => path.join(getLocalRoot(), 'navidrome-data');
const getDefaultLibraryPath = () => path.join(app.getPath('music'), 'Roofy Music');
const getConfigPath = () => path.join(app.getPath('userData'), 'config.json');

const getLibraryPath = () => {
    const configured = store.get('roofy.libraryPath') as string | undefined;
    return configured || getDefaultLibraryPath();
};

const toLibraryRelativePath = (filePath: string) => {
    const relative = path.relative(getLibraryPath(), filePath);
    return relative.split(path.sep).join('/');
};

const toLibraryAbsolutePath = (filePath: string) => {
    if (!filePath) return '';
    return path.isAbsolute(filePath) ? filePath : path.join(getLibraryPath(), filePath);
};

const normalizeMetadataPath = (filePath: string) =>
    toLibraryRelativePath(toLibraryAbsolutePath(filePath));

const extractYoutubeVideoId = (input?: null | string) => {
    if (!input) return '';

    const trimmed = input.trim();
    const bracketMatch = /\[([a-zA-Z0-9_-]{11})\](?:\.[^.]+)?$/.exec(trimmed);
    if (bracketMatch) return bracketMatch[1];

    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;

    try {
        const url = new URL(trimmed);
        if (url.searchParams.get('v')) return url.searchParams.get('v') || '';
        if (url.hostname === 'youtu.be') return url.pathname.replace(/^\//, '').slice(0, 11);
        const embedMatch = /\/embed\/([a-zA-Z0-9_-]{11})/.exec(url.pathname);
        if (embedMatch) return embedMatch[1];
    } catch {
        // Not a URL.
    }

    return '';
};

const getYoutubeWatchUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;

const upsertLocalVideoMetadata = (metadata: LocalVideoMetadata) => {
    const audioPath = normalizeMetadataPath(metadata.audioPath);
    const existingIndex = localVideoMetadata.findIndex(
        (item) =>
            normalizeMetadataPath(item.audioPath) === audioPath ||
            Boolean(metadata.songId && item.songId === metadata.songId),
    );
    const nextMetadata = {
        ...(existingIndex >= 0 ? localVideoMetadata[existingIndex] : {}),
        ...metadata,
        audioPath,
        updatedAt: now(),
    };

    if (existingIndex >= 0) {
        localVideoMetadata[existingIndex] = nextMetadata;
    } else {
        localVideoMetadata.unshift(nextMetadata);
    }

    persistLocalVideoMetadata();
    return nextMetadata;
};

const findLocalVideoMetadata = (args: {
    path?: null | string;
    songId?: string;
    youtubeMusic?: { videoId?: string; watchUrl?: string };
}) => {
    const audioPath = args.path ? normalizeMetadataPath(args.path) : '';
    const byStoredMetadata =
        localVideoMetadata.find(
            (item) =>
                (args.songId && item.songId === args.songId) ||
                (audioPath && normalizeMetadataPath(item.audioPath) === audioPath),
        ) || null;

    const videoId =
        byStoredMetadata?.videoId ||
        args.youtubeMusic?.videoId ||
        extractYoutubeVideoId(args.youtubeMusic?.watchUrl) ||
        extractYoutubeVideoId(args.path);
    const sourceUrl = byStoredMetadata?.sourceUrl || args.youtubeMusic?.watchUrl || '';
    const videoPath = byStoredMetadata?.videoPath
        ? toLibraryAbsolutePath(byStoredMetadata.videoPath)
        : '';
    const hasVideoFile = Boolean(videoPath && existsSync(videoPath));

    if (!videoId && !hasVideoFile) return null;

    return {
        audioPath: audioPath || byStoredMetadata?.audioPath || '',
        canDownloadVideo: Boolean(videoId && audioPath && !hasVideoFile),
        embedUrl: videoId
            ? `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&modestbranding=1&rel=0`
            : '',
        sourceUrl: sourceUrl || (videoId ? getYoutubeWatchUrl(videoId) : ''),
        videoFilePath: hasVideoFile ? videoPath : '',
        videoFileUrl: hasVideoFile ? pathToFileURL(videoPath).toString() : '',
        videoId,
    };
};

const ensureLocalFolders = () => {
    mkdirSync(getLocalRoot(), { recursive: true });
    mkdirSync(getDataPath(), { recursive: true });
    mkdirSync(getLibraryPath(), { recursive: true });
};

const getPassword = () => {
    let password = store.get('roofy.navidromePassword') as string | undefined;
    if (!password) {
        password = randomBytes(18).toString('base64url');
        store.set('roofy.navidromePassword', password);
    }
    return password;
};

const getPort = () => {
    return (store.get('roofy.navidromePort') as number | undefined) || DEFAULT_PORT;
};

const getUrl = () => `http://127.0.0.1:${getPort()}`;

const commandExists = (command: string) => {
    const result = spawnSync(command, ['--version'], {
        encoding: 'utf8',
        timeout: 5000,
        windowsHide: true,
    });

    return !result.error && result.status === 0;
};

const bundledExecutableName = (baseName: string) => {
    return process.platform === 'win32' ? `${baseName}.exe` : baseName;
};

const findExecutable = (baseName: string, envName: string) => {
    const configured = process.env[envName] || (store.get(`roofy.${baseName}Path`) as string);
    if (configured && existsSync(configured)) {
        return configured;
    }

    const binaryName = bundledExecutableName(baseName);
    const candidates = [
        path.join(process.resourcesPath || '', 'bin', process.platform, process.arch, binaryName),
        path.join(process.resourcesPath || '', 'bin', binaryName),
        path.join(app.getAppPath(), 'resources/bin', process.platform, process.arch, binaryName),
        path.join(app.getAppPath(), 'resources/bin', binaryName),
        path.join(app.getAppPath(), '../resources/bin', process.platform, process.arch, binaryName),
        path.join(app.getAppPath(), '../resources/bin', binaryName),
        path.join(
            __dirname,
            '../../../../../resources/bin',
            process.platform,
            process.arch,
            binaryName,
        ),
        path.join(__dirname, '../../../../../resources/bin', binaryName),
    ];

    return candidates.find((candidate) => candidate && existsSync(candidate)) || null;
};

const navidromeBinaryPath = () => findExecutable('navidrome', 'ROOFY_NAVIDROME_PATH');
const ffmpegBinaryPath = () => findExecutable('ffmpeg', 'ROOFY_FFMPEG_PATH');
const denoBinaryPath = () => findExecutable('deno', 'ROOFY_DENO_PATH');

const toolAvailable = (tool: string, envName: string) => {
    const configured = findExecutable(tool, envName);
    return Boolean(configured) || commandExists(tool);
};

const configureRendererServerLock = () => {
    process.env.SERVER_LOCK = 'true';
    process.env.SERVER_NAME = 'Roofy Local Library';
    process.env.SERVER_TYPE = 'navidrome';
    process.env.SERVER_URL = getUrl();
};

const waitForNavidrome = async (timeoutMs = 25000) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        try {
            const response = await fetch(`${getUrl()}/app`);
            if (response.ok || response.status < 500) return true;
        } catch {
            // Keep polling until the sidecar binds the port.
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return false;
};

const parseResponseBody = async (response: Response) => {
    const text = await response.text();
    if (!text) return null;

    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
};

const summarizeNavidromeError = (body: any, fallback: string) => {
    if (!body) return fallback;
    if (typeof body === 'string') return body;
    if (typeof body.error === 'string') return body.error;
    if (typeof body.message === 'string') return body.message;
    if (Array.isArray(body.errors)) return body.errors.join(', ');
    if (body.errors && typeof body.errors === 'object') {
        return Object.entries(body.errors)
            .map(
                ([key, value]) =>
                    `${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`,
            )
            .join('; ');
    }
    return fallback;
};

const loginAsLocalAdmin = async () => {
    const response = await fetch(`${getUrl()}/auth/login`, {
        body: JSON.stringify({
            password: getPassword(),
            username: LOCAL_SERVER_USERNAME,
        }),
        headers: {
            'Content-Type': 'application/json',
        },
        method: 'POST',
    });
    const body = await parseResponseBody(response);

    if (!response.ok) {
        throw new Error(
            summarizeNavidromeError(body, 'Could not log in to the local Navidrome admin account.'),
        );
    }

    const token = body?.token;
    if (!token) {
        throw new Error('Local Navidrome login did not return an admin token.');
    }

    return token as string;
};

const createLocalUser = async (args: CreateLocalUserArgs) => {
    const username = args.username.trim();
    const password = args.password;
    const name = (args.name || username).trim();
    const email = (args.email || '').trim();

    if (!username) throw new Error('Enter a username.');
    if (!password) throw new Error('Enter a password.');
    if (!name) throw new Error('Enter a display name.');

    if (!navidromeProcess || navidromeProcess.killed) {
        await startLocalFirst();
    }

    const token = await loginAsLocalAdmin();
    const response = await fetch(`${getUrl()}/api/user`, {
        body: JSON.stringify({
            email,
            isAdmin: Boolean(args.isAdmin),
            name,
            password,
            userName: username,
        }),
        headers: {
            'Content-Type': 'application/json',
            'X-ND-Authorization': `Bearer ${token}`,
        },
        method: 'POST',
    });
    const body = await parseResponseBody(response);

    if (!response.ok) {
        throw new Error(summarizeNavidromeError(body, 'Could not create the local user.'));
    }

    return {
        id: body?.id || username,
        isAdmin: Boolean(body?.isAdmin ?? args.isAdmin),
        name: body?.name || name,
        username: body?.userName || username,
    };
};

export const startLocalFirst = async () => {
    ensureLocalFolders();

    if (navidromeProcess && !navidromeProcess.killed) {
        return getLocalFirstStatus();
    }

    const binaryPath = navidromeBinaryPath();
    if (!binaryPath) {
        dialog.showErrorBox(
            'Roofy Local Engine Not Available',
            'The bundled Navidrome binary was not found.\n\n' +
                'To fix this, either:\n' +
                '1. Download navidrome.exe and place it under resources/bin/<platform>/<arch>/\n' +
                '2. Set the ROOFY_NAVIDROME_PATH environment variable to the binary location.',
        );
        return getLocalFirstStatus(
            'Navidrome binary not found. Set ROOFY_NAVIDROME_PATH or add a bundled binary under resources/bin.',
        );
    }

    const ffmpegPath = ffmpegBinaryPath();
    const ffmpegDir = ffmpegPath ? path.dirname(ffmpegPath) : '';

    navidromeProcess = spawn(binaryPath, [], {
        cwd: getDataPath(),
        env: {
            ...process.env,
            ND_ADDRESS: '127.0.0.1',
            ND_DATAFOLDER: getDataPath(),
            ND_DEVAUTOCREATEADMINPASSWORD: getPassword(),
            ND_ENABLEEXTERNALSERVICES: 'false',
            ND_ENABLEINSIGHTSCOLLECTOR: 'false',
            ND_ENABLESHARING: 'false',
            ND_FFMPEGPATH: ffmpegPath || '',
            ND_LOGLEVEL: 'info',
            ND_MUSICFOLDER: getLibraryPath(),
            ND_PORT: String(getPort()),
            ND_SCANNER_SCANONSTARTUP: 'true',
            PATH: ffmpegDir
                ? `${ffmpegDir}${path.delimiter}${process.env.PATH || ''}`
                : process.env.PATH,
        },
        windowsHide: true,
    });

    navidromeProcess.stdout.on('data', (chunk) => {
        console.log(`[navidrome] ${chunk.toString().trim()}`);
    });

    navidromeProcess.stderr.on('data', (chunk) => {
        console.warn(`[navidrome] ${chunk.toString().trim()}`);
    });

    navidromeProcess.on('exit', () => {
        navidromeProcess = null;
    });

    const ready = await waitForNavidrome();
    if (!ready) {
        if (navidromeProcess) {
            navidromeProcess.kill();
            navidromeProcess = null;
        }
        dialog.showErrorBox(
            'Roofy Local Engine Failed to Start',
            'The local Navidrome engine did not start within 25 seconds.\n\n' +
                'This may be caused by a port conflict, antivirus blocking the binary, or a corrupted data folder.\n' +
                'Try restarting the app, or delete the data folder at:\n' +
                getDataPath(),
        );
        return getLocalFirstStatus('Navidrome failed to start within 25 seconds.');
    }

    configureRendererServerLock();
    return getLocalFirstStatus();
};

export const shutdownLocalFirst = () => {
    if (activeImport) {
        activeImport.child.kill();
        activeImport = null;
    }

    if (navidromeProcess) {
        navidromeProcess.kill();
        navidromeProcess = null;
    }
};

const sendImportJobEvent = (job: ImportJob) => {
    try {
        const mainWindow = getMainWindow();
        if (!mainWindow) return;
        mainWindow.webContents.send('roofy-import-job-updated', job);
        if (job.status === 'completed') {
            mainWindow.webContents.send('roofy-import-job-completed', job);
        } else if (job.status === 'failed') {
            mainWindow.webContents.send('roofy-import-job-failed', job);
        }
    } catch {
        // ignore
    }
};

const updateJob = (id: string, patch: Partial<ImportJob>) => {
    const job = importJobs.find((item) => item.id === id);
    if (!job) return null;
    Object.assign(job, patch, { updatedAt: now() });
    persistImportJobs();
    sendImportJobEvent(job);
    return job;
};

const removeImportJob = (id: string) => {
    const index = importJobs.findIndex((job) => job.id === id);
    if (index < 0) return getLocalFirstStatus();
    importJobs.splice(index, 1);
    persistImportJobs();
    return getLocalFirstStatus();
};

const clearImportJobs = (status: 'completed' | 'failed') => {
    for (let index = importJobs.length - 1; index >= 0; index -= 1) {
        if (importJobs[index].status === status) {
            importJobs.splice(index, 1);
        }
    }
    persistImportJobs();
    return getLocalFirstStatus();
};

const normalizeImportInput = (input: string) => {
    const value = input.trim();
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;
    return `ytsearch1:${value}`;
};

const normalizeYoutubePlaylistId = (listId: string) => {
    if (listId.startsWith('VL') && listId.length > 2) {
        return listId.slice(2);
    }

    return listId;
};

const normalizeDownloadUrl = (input: string, playlist: boolean) => {
    const value = normalizeImportInput(input);
    if (!/^https?:\/\//i.test(value)) return value;

    try {
        const url = new URL(value);
        const hostname = url.hostname.replace(/^www\./, '');
        const listId = url.searchParams.get('list');

        if (playlist && listId) {
            return `https://www.youtube.com/playlist?list=${normalizeYoutubePlaylistId(listId)}`;
        }

        if (playlist) return value;

        if (
            (hostname === 'youtube.com' || hostname === 'm.youtube.com') &&
            url.searchParams.has('v')
        ) {
            return `https://www.youtube.com/watch?v=${url.searchParams.get('v')}`;
        }
        if (hostname === 'youtu.be') {
            return `https://www.youtube.com/watch?v=${url.pathname.replace(/^\//, '')}`;
        }
    } catch {
        return value;
    }

    return value;
};

const inferPlaylistImport = (input: string, explicit?: boolean) => {
    if (typeof explicit === 'boolean') return explicit;

    const value = normalizeImportInput(input);
    if (!/^https?:\/\//i.test(value)) return false;

    try {
        const url = new URL(value);
        const hostname = url.hostname.replace(/^www\./, '');
        const listId = url.searchParams.get('list') || '';

        if (
            (hostname === 'youtube.com' || hostname === 'm.youtube.com') &&
            url.pathname === '/playlist'
        ) {
            return Boolean(listId);
        }

        if (!listId) return false;

        // YouTube radio URLs include an RD list next to a video id. Treat those as a single video.
        if (listId.toUpperCase().startsWith('RD')) return false;

        return true;
    } catch {
        return false;
    }
};

const normalizeCookieBrowser = (value?: string) => {
    const browser = (value || '').trim().toLowerCase();
    if (!COOKIE_BROWSER_ALLOWLIST.has(browser)) return '';
    return browser;
};

const getToolCommand = (tool: string, envName: string) => {
    return findExecutable(tool, envName) || tool;
};

const findCommandOnPath = (command: string) => {
    const lookup = process.platform === 'win32' ? 'where.exe' : 'command';
    const args = process.platform === 'win32' ? [command] : ['-v', command];
    const result = spawnSync(lookup, args, {
        encoding: 'utf8',
        timeout: 5000,
        windowsHide: true,
    });
    const firstLine = result.stdout
        ?.split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean);
    return result.status === 0 && firstLine ? firstLine : null;
};

const getJsRuntimeArgs = () => {
    const configured =
        process.env.ROOFY_YT_DLP_JS_RUNTIME || (store.get('roofy.ytDlpJsRuntime') as string);
    if (configured) return ['--js-runtimes', configured];

    const deno = denoBinaryPath() || findCommandOnPath('deno');
    if (deno) return ['--js-runtimes', `deno:${deno}`];

    const node = findCommandOnPath('node');
    if (node) return ['--js-runtimes', `node:${node}`];

    return [];
};

const getCookieAttempts = (cookieBrowser: string) => {
    const normalized = normalizeCookieBrowser(cookieBrowser);
    if (normalized === 'auto') return COOKIE_BROWSER_AUTO_ATTEMPTS;
    return [normalized];
};

const getCookieArgs = (cookieBrowser: string, cookiesFilePath?: string) => {
    const args: string[] = [];
    if (cookiesFilePath) {
        args.push('--cookies', cookiesFilePath);
        // When the user provided a cookies file, rely on it exclusively.
        // Mixing in --cookies-from-browser can trigger a locked-database
        // error even though the file would have worked on its own.
        return args;
    }
    if (cookieBrowser) {
        args.push('--cookies-from-browser', cookieBrowser);
    }
    return args;
};

const isCookieDatabaseLockedError = (output: string) => {
    return /could not copy.*cookie database|database is locked/i.test(output);
};

const isAuthBlockedError = (output: string) => {
    return /sign in to confirm|not a bot|http error 429|too many requests|cookies for the authentication/i.test(
        output,
    );
};

const formatYtDlpError = (output: string, cookieBrowser: string, attempts: string[] = []) => {
    const cleanOutput = output.trim();

    if (isCookieDatabaseLockedError(cleanOutput)) {
        const attempted = attempts.filter(Boolean).join(', ');
        return [
            cleanOutput,
            '',
            `The browser's cookie database is locked because the browser is running.`,
            attempted
                ? `Attempted browsers: ${attempted}.`
                : 'No browser cookie extraction was attempted.',
            'Fully close the browser (including background processes) and retry, or provide a cookies.txt file in Import settings.',
        ].join('\n');
    }

    if (!isAuthBlockedError(cleanOutput)) return cleanOutput;

    const attempted = attempts.filter(Boolean).join(', ');
    const cookieHint =
        cookieBrowser === 'auto'
            ? `Checked local signed-in browser sessions: ${attempted || 'available browsers'}.`
            : cookieBrowser
              ? `Checked the local ${cookieBrowser} browser session.`
              : 'No local signed-in browser session was used.';

    return [
        cleanOutput,
        '',
        'YouTube blocked this request as anonymous or rate-limited.',
        cookieHint,
        'Open YouTube in a desktop browser, make sure you are signed in, fully close that browser, then retry the import. You can also set a cookies.txt file in the Import settings below. If YouTube is rate-limiting your network, wait a while before trying again.',
    ].join('\n');
};

const formatPartialImportWarning = (skippedCount: number, playlist: boolean) => {
    const itemLabel = playlist ? 'playlist item' : 'item';
    const skippedCopy =
        skippedCount > 0
            ? `${skippedCount} ${itemLabel}${skippedCount === 1 ? '' : 's'}`
            : playlist
              ? 'Some playlist items'
              : 'Some items';

    return `${skippedCopy} could not be downloaded. Available tracks were imported.`;
};

const runYtDlpVideoDownload = (
    input: string,
    outputTemplate: string,
    cookieBrowser?: string,
): Promise<string[]> => {
    const ytDlp = getToolCommand('yt-dlp', 'ROOFY_YT_DLP_PATH');
    const ffmpegPath = ffmpegBinaryPath();
    const cookiesFilePath = store.get('roofy.cookiesFilePath') as string | undefined;
    const effectiveBrowser = normalizeCookieBrowser(
        cookieBrowser ?? (store.get('roofy.cookieBrowser') as string | undefined),
    );
    const cookieArgs = cookiesFilePath
        ? getCookieArgs('', cookiesFilePath)
        : getCookieArgs(effectiveBrowser === 'auto' ? '' : effectiveBrowser, cookiesFilePath);
    const destinationPaths: string[] = [];
    const finalPaths: string[] = [];

    const resolveCandidatePath = (filePath: string) =>
        path.isAbsolute(filePath) ? filePath : path.resolve(getLibraryPath(), filePath);

    const isUsableMp4 = (filePath: string) => {
        try {
            return (
                path.extname(filePath).toLowerCase() === '.mp4' &&
                existsSync(filePath) &&
                statSync(filePath).size > 0
            );
        } catch {
            return false;
        }
    };

    return new Promise((resolve, reject) => {
        const child = spawn(
            ytDlp,
            [
                '--newline',
                '--progress',
                '--format',
                'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
                '--merge-output-format',
                'mp4',
                '--no-playlist',
                '--no-mtime',
                ...cookieArgs,
                ...getJsRuntimeArgs(),
                ...(ffmpegPath ? ['--ffmpeg-location', path.dirname(ffmpegPath)] : []),
                '-o',
                outputTemplate,
                input,
            ],
            {
                cwd: getLibraryPath(),
                windowsHide: true,
            },
        );

        const output: string[] = [];
        const handleLine = (line: string) => {
            const clean = line.trim();
            if (!clean) return;
            output.push(clean);
            if (output.length > 48) output.shift();

            const destination = /\[download\] Destination:\s*(.+)/.exec(clean);
            if (destination) destinationPaths.push(destination[1]);

            const merge = /\[Merger\] Merging formats into "([^"]+)"/.exec(clean);
            if (merge) finalPaths.push(merge[1]);

            const alreadyDownloaded = /\[download\]\s*(.+?)\s+has already been downloaded/.exec(
                clean,
            );
            if (alreadyDownloaded) finalPaths.push(alreadyDownloaded[1]);
        };

        child.stdout.on('data', (chunk) => chunk.toString().split(/\r?\n/).forEach(handleLine));
        child.stderr.on('data', (chunk) => chunk.toString().split(/\r?\n/).forEach(handleLine));
        child.on('error', reject);
        child.on('close', (code) => {
            const preferredPaths = finalPaths.concat(destinationPaths);
            const videoFiles = [...new Set(preferredPaths)]
                .map(resolveCandidatePath)
                .filter(isUsableMp4);

            if (code === 0 && videoFiles.length > 0) {
                resolve(videoFiles);
                return;
            }

            reject(new Error(output.join('\n') || `yt-dlp exited with code ${code}`));
        });
    });
};

const downloadVideoForAudioFile = async (
    audioFilePath: string,
    args: {
        cookieBrowser?: string;
        songId?: string;
        sourceUrl?: string;
        title?: string;
        videoId?: string;
    },
) => {
    const inferredVideoId =
        args.videoId ||
        extractYoutubeVideoId(args.sourceUrl) ||
        extractYoutubeVideoId(audioFilePath);

    if (!inferredVideoId) {
        throw new Error('No original video link is available for this local track.');
    }

    const audioAbsolutePath = toLibraryAbsolutePath(audioFilePath);
    const sourceUrl = extractYoutubeVideoId(args.sourceUrl)
        ? args.sourceUrl || getYoutubeWatchUrl(inferredVideoId)
        : getYoutubeWatchUrl(inferredVideoId);
    const dir = path.dirname(audioAbsolutePath);
    const baseName = path.basename(audioAbsolutePath, path.extname(audioAbsolutePath));
    const outputTemplate = path.join(dir, `${baseName}.video.%(ext)s`);
    const existingPath = path.join(dir, `${baseName}.video.mp4`);
    const videoFiles =
        existsSync(existingPath) && statSync(existingPath).size > 0
            ? [existingPath]
            : await runYtDlpVideoDownload(sourceUrl, outputTemplate, args.cookieBrowser);
    const videoPath = videoFiles[0];

    return upsertLocalVideoMetadata({
        audioPath: audioAbsolutePath,
        songId: args.songId,
        sourceUrl,
        title: args.title,
        updatedAt: now(),
        videoId: inferredVideoId,
        videoPath: toLibraryRelativePath(videoPath),
    });
};

const processImportQueue = () => {
    if (activeImport) return;
    const nextJob = importJobs
        .slice()
        .reverse()
        .find((job) => job.status === 'queued');
    if (!nextJob) return;
    runImport(nextJob);
};

const runImport = (
    job: ImportJob,
    attemptIndex = 0,
    attemptedBrowsers: string[] = [],
    triedWithoutCookies = false,
) => {
    const ytDlp = getToolCommand('yt-dlp', 'ROOFY_YT_DLP_PATH');
    const ffmpegPath = ffmpegBinaryPath();
    const libraryPath = getLibraryPath();
    const cookieAttempts = getCookieAttempts(job.cookieBrowser);
    const cookiesFilePath = triedWithoutCookies
        ? undefined
        : (store.get('roofy.cookiesFilePath') as string | undefined);
    const hasCookieFile = Boolean(cookiesFilePath);
    const cookieBrowser =
        hasCookieFile || triedWithoutCookies ? '' : cookieAttempts[attemptIndex] || '';
    const outputTemplate = path.join(
        libraryPath,
        'Downloads',
        '%(uploader|Unknown Artist)s',
        '%(title).200B [%(id)s].%(ext)s',
    );

    const args = [
        '--newline',
        '--progress',
        '--format',
        'bestaudio/best',
        '--extract-audio',
        '--audio-quality',
        '0',
        '--embed-thumbnail',
        '--convert-thumbnails',
        'jpg',
        '--add-metadata',
        '--no-mtime',
        '--write-subs',
        '--write-auto-subs',
        '--sub-langs',
        'en,-live_chat',
        '--convert-subs',
        'srt',
        job.playlist ? '--yes-playlist' : '--no-playlist',
        '--audio-format',
        job.audioFormat,
        ...getCookieArgs(cookieBrowser, cookiesFilePath),
        ...getJsRuntimeArgs(),
        ...(ffmpegPath ? ['--ffmpeg-location', path.dirname(ffmpegPath)] : []),
        '-o',
        outputTemplate,
        normalizeDownloadUrl(job.input, job.playlist),
    ];

    updateJob(job.id, {
        error: '',
        message: cookieBrowser ? 'Preparing signed-in import' : 'Starting import',
        progress: 1,
        status: 'running',
    });

    const recentOutput: string[] = [];
    const candidatePaths: string[] = [];
    let failedItemCount = 0;
    const audioExts = new Set([
        '.aac',
        '.flac',
        '.m4a',
        '.mka',
        '.mp3',
        '.ogg',
        '.opus',
        '.wav',
        '.webm',
        '.wma',
    ]);

    const child = spawn(ytDlp, args, {
        cwd: libraryPath,
        windowsHide: true,
    });

    activeImport = { child, id: job.id };

    const handleLine = (line: string) => {
        const clean = line.trim();
        if (!clean) return;
        recentOutput.push(clean);
        if (recentOutput.length > 32) recentOutput.shift();
        if (/^ERROR:/i.test(clean)) failedItemCount += 1;

        const percent = /\[download\]\s+(\d+(?:\.\d+)?)%/.exec(clean);
        if (percent) {
            updateJob(job.id, {
                message: clean,
                progress: Math.min(99, Math.max(1, Number(percent[1]))),
            });
            return;
        }

        const extractAudioDest = /\[ExtractAudio\] Destination:\s*(.+)/.exec(clean);
        if (extractAudioDest) candidatePaths.push(extractAudioDest[1]);

        const extractAudioSkip = /\[ExtractAudio\] Not converting media file "([^"]+)"/.exec(clean);
        if (extractAudioSkip) candidatePaths.push(extractAudioSkip[1]);

        const alreadyDownloaded = /\[download\]\s*(.+?)\s+has already been downloaded/.exec(clean);
        if (alreadyDownloaded) candidatePaths.push(alreadyDownloaded[1]);

        const downloadDest = /\[download\] Destination:\s*(.+)/.exec(clean);
        if (downloadDest) candidatePaths.push(downloadDest[1]);

        updateJob(job.id, { message: clean });
    };

    child.stdout.on('data', (chunk) => chunk.toString().split(/\r?\n/).forEach(handleLine));
    child.stderr.on('data', (chunk) => chunk.toString().split(/\r?\n/).forEach(handleLine));

    child.on('close', async (code) => {
        activeImport = null;
        const current = importJobs.find((item) => item.id === job.id);
        sendImportJobEvent(current || job);

        const uniquePaths = [...new Set(candidatePaths)];
        const audioFiles = uniquePaths
            .filter((p) => audioExts.has(path.extname(p).toLowerCase()))
            .filter((p) => existsSync(p));
        const output = recentOutput.join('\n');
        const canCreateEmptyPlaylist =
            code !== 0 &&
            job.createPlaylist &&
            job.playlist &&
            failedItemCount > 0 &&
            !isAuthBlockedError(output) &&
            !isCookieDatabaseLockedError(output);
        const completedWithSkippedItems =
            code !== 0 && (audioFiles.length > 0 || canCreateEmptyPlaylist);
        const partialWarning = completedWithSkippedItems
            ? formatPartialImportWarning(failedItemCount, job.playlist)
            : '';

        if (code === 0 || completedWithSkippedItems) {
            for (const filePath of audioFiles) {
                try {
                    processSubtitleForFile(filePath);
                } catch (error) {
                    console.error('[local-first] Subtitle conversion failed:', error);
                }
            }
        }

        if (current?.status === 'cancelled') {
            updateJob(job.id, { message: 'Cancelled' });
        } else if (code === 0 || completedWithSkippedItems) {
            let message = completedWithSkippedItems
                ? 'Import complete - skipped unavailable items'
                : 'Import complete';
            let videoDownloadedCount = 0;

            if (audioFiles.length > 0) {
                const needsScan = job.createPlaylist || Boolean(job.targetPlaylistIds?.length);
                try {
                    for (const filePath of audioFiles) {
                        const videoId =
                            job.videoId ||
                            extractYoutubeVideoId(job.input) ||
                            extractYoutubeVideoId(filePath);
                        upsertLocalVideoMetadata({
                            audioPath: filePath,
                            sourceUrl: videoId ? getYoutubeWatchUrl(videoId) : job.input,
                            title: job.title || job.name,
                            updatedAt: now(),
                            videoId,
                        });
                    }

                    if (job.saveVideo) {
                        updateJob(job.id, {
                            error: '',
                            message: 'Import complete - saving video',
                            warning: partialWarning,
                        });

                        for (const filePath of audioFiles) {
                            try {
                                const videoId =
                                    job.videoId ||
                                    extractYoutubeVideoId(job.input) ||
                                    extractYoutubeVideoId(filePath);
                                await downloadVideoForAudioFile(filePath, {
                                    cookieBrowser: job.cookieBrowser,
                                    sourceUrl: videoId ? getYoutubeWatchUrl(videoId) : job.input,
                                    title: job.title || job.name,
                                    videoId,
                                });
                                videoDownloadedCount += 1;
                            } catch (error) {
                                console.error(
                                    '[local-first] Failed to save imported video:',
                                    error,
                                );
                            }
                        }
                    }

                    if (job.createPlaylist) {
                        writePlaylistM3U(job, audioFiles);
                        updateJob(job.id, {
                            error: '',
                            message: 'Import complete - creating playlist',
                            warning: partialWarning,
                        });
                        message = completedWithSkippedItems
                            ? 'Import complete - playlist created with skipped items'
                            : 'Import complete - playlist created';
                    }

                    if (needsScan) {
                        updateJob(job.id, {
                            error: '',
                            message: job.targetPlaylistIds?.length
                                ? 'Import complete - adding to playlist'
                                : 'Import complete - scanning library',
                            warning: partialWarning,
                        });
                        await triggerNavidromeScan();
                    }

                    if (job.createPlaylist) {
                        try {
                            const songIds = await findAllImportedSongIds(audioFiles);
                            if (songIds.length > 0) {
                                await populatePlaylist(
                                    job.playlistName || job.name || 'Imported Playlist',
                                    songIds,
                                );
                                message = completedWithSkippedItems
                                    ? 'Import complete - playlist populated with skipped items'
                                    : 'Import complete - playlist populated';
                            }
                        } catch (error: any) {
                            console.error(
                                '[local-first] Failed to populate playlist via API:',
                                error,
                            );
                        }
                    }

                    if (job.targetPlaylistIds?.length) {
                        await addImportedSongsToTargetPlaylists(job, audioFiles);
                        message = completedWithSkippedItems
                            ? 'Import complete - added to playlist with skipped items'
                            : 'Import complete - added to playlist';
                    }

                    if (job.createPlaylist) {
                        getMainWindow()?.webContents.send('roofy-local-playlist-imported');
                    }
                } catch (error: any) {
                    console.error('[local-first] Failed to finish import post-processing:', error);
                    updateJob(job.id, {
                        error: error.message || 'Import post-processing failed',
                        message: 'Import completed - playlist update failed',
                        status: 'failed',
                    });
                    processImportQueue();
                    return;
                }
            } else if (job.targetPlaylistIds?.length) {
                updateJob(job.id, {
                    error: 'Import completed, but Roofy could not identify the downloaded audio file to add to the selected playlist.',
                    message: 'Import completed - playlist update failed',
                    status: 'failed',
                });
                processImportQueue();
                return;
            } else if (job.createPlaylist) {
                try {
                    writePlaylistM3U(job, audioFiles);
                    if (completedWithSkippedItems) {
                        message = 'Import complete - empty playlist created';
                    }
                    await triggerNavidromeScan();
                    getMainWindow()?.webContents.send('roofy-local-playlist-imported');
                } catch (error: any) {
                    console.error('[local-first] Failed to create empty playlist:', error);
                }
            }

            updateJob(job.id, {
                downloadedCount: audioFiles.length,
                error: '',
                message,
                progress: 100,
                skippedCount: completedWithSkippedItems ? failedItemCount : 0,
                status: 'completed',
                videoDownloadedCount,
                warning: partialWarning,
            });
        } else {
            const nextAttempt = attemptIndex + 1;
            const nextAttemptedBrowsers = cookieBrowser
                ? [...attemptedBrowsers, cookieBrowser]
                : attemptedBrowsers;
            const dbLocked = isCookieDatabaseLockedError(output);

            // If the cookie database is locked, don't waste time trying other
            // Chromium-based browsers — they'll almost certainly fail too.
            const canTryNextBrowser =
                !hasCookieFile &&
                !triedWithoutCookies &&
                !dbLocked &&
                job.cookieBrowser === 'auto' &&
                nextAttempt < cookieAttempts.length &&
                isAuthBlockedError(output);

            if (canTryNextBrowser) {
                updateJob(job.id, {
                    error: '',
                    message: 'Trying another local sign-in source',
                    progress: Math.max(1, current?.progress || 1),
                    status: 'running',
                });
                runImport(job, nextAttempt, nextAttemptedBrowsers, triedWithoutCookies);
                return;
            }

            // Fallback: many public videos work without any cookies.
            const usedBrowserCookies = !triedWithoutCookies && Boolean(cookieBrowser);
            if (usedBrowserCookies) {
                updateJob(job.id, {
                    error: '',
                    message: dbLocked
                        ? 'Browser cookies locked, trying without cookies'
                        : 'Trying without cookies',
                    progress: Math.max(1, current?.progress || 1),
                    status: 'running',
                });
                runImport(job, 0, nextAttemptedBrowsers, true);
                return;
            }

            updateJob(job.id, {
                error:
                    formatYtDlpError(
                        output || `yt-dlp exited with code ${code}`,
                        job.cookieBrowser,
                        nextAttemptedBrowsers,
                    ) || `yt-dlp exited with code ${code}`,
                message: 'Import failed',
                status: 'failed',
            });
        }
        processImportQueue();
    });

    child.on('error', (error) => {
        activeImport = null;
        updateJob(job.id, { error: error.message, message: 'Import failed', status: 'failed' });
        sendImportJobEvent(importJobs.find((item) => item.id === job.id) || job);
        processImportQueue();
    });
};

const runYtDlpPreview = (
    ytDlp: string,
    input: string,
    playlist: boolean,
    cookieBrowser: string,
    cookiesFilePath: string | undefined,
    jsRuntimeArgs: string[],
): Promise<{
    count: number;
    duration: null | number;
    isPlaylist: boolean;
    thumbnail: string;
    title: string;
    uploader: string;
    webpageUrl: string;
}> => {
    return new Promise((resolve, reject) => {
        const child = spawn(
            ytDlp,
            [
                '--dump-single-json',
                '--skip-download',
                '--no-warnings',
                playlist ? '--yes-playlist' : '--no-playlist',
                ...getCookieArgs(cookieBrowser, cookiesFilePath),
                ...jsRuntimeArgs,
                input,
            ],
            { windowsHide: true },
        );

        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
        });
        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        child.on('error', reject);
        child.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(stderr || `yt-dlp exited with code ${code}`));
                return;
            }
            try {
                const data = JSON.parse(stdout);
                const entries = Array.isArray(data.entries) ? data.entries.filter(Boolean) : [data];
                const first = entries[0] || data;
                const isPlaylist = Boolean(data.entries);
                resolve({
                    count: entries.length,
                    duration: first.duration || null,
                    isPlaylist,
                    thumbnail: first.thumbnail || data.thumbnail || '',
                    title: (isPlaylist ? data.title : first.title) || data.title || 'Untitled',
                    uploader: first.uploader || first.channel || data.uploader || 'Unknown',
                    webpageUrl: first.webpage_url || data.webpage_url || '',
                });
            } catch (error) {
                reject(error);
            }
        });
    });
};

const previewImport = async (input: string, playlist?: boolean, cookieBrowser?: string) => {
    const ytDlp = getToolCommand('yt-dlp', 'ROOFY_YT_DLP_PATH');
    const resolvedPlaylist = inferPlaylistImport(input, playlist);
    const normalizedInput = normalizeDownloadUrl(input, resolvedPlaylist);
    const effectiveBrowser =
        cookieBrowser !== undefined
            ? normalizeCookieBrowser(cookieBrowser)
            : normalizeCookieBrowser(store.get('roofy.cookieBrowser') as string | undefined);
    const cookiesFilePath = store.get('roofy.cookiesFilePath') as string | undefined;
    const jsRuntimeArgs = getJsRuntimeArgs();

    if (!normalizedInput) {
        throw new Error('Enter a URL or search query.');
    }

    const attempts = getCookieAttempts(effectiveBrowser);
    const attemptedBrowsers: string[] = [];
    let lastError = '';

    for (let index = 0; index < attempts.length; index += 1) {
        const attemptBrowser = attempts[index] || '';
        if (attemptBrowser) attemptedBrowsers.push(attemptBrowser);

        try {
            return await runYtDlpPreview(
                ytDlp,
                normalizedInput,
                resolvedPlaylist,
                attemptBrowser,
                cookiesFilePath,
                jsRuntimeArgs,
            );
        } catch (error: any) {
            lastError = error?.message || 'yt-dlp preview failed';
            const dbLocked = isCookieDatabaseLockedError(lastError);
            if (
                dbLocked ||
                effectiveBrowser !== 'auto' ||
                !isAuthBlockedError(lastError) ||
                index === attempts.length - 1
            ) {
                break;
            }
        }
    }

    // Fallback: many public videos work without any cookies.
    if (!cookiesFilePath && attemptedBrowsers.length > 0) {
        try {
            return await runYtDlpPreview(
                ytDlp,
                normalizedInput,
                resolvedPlaylist,
                '',
                undefined,
                jsRuntimeArgs,
            );
        } catch (error: any) {
            lastError = error?.message || lastError;
        }
    }

    throw new Error(
        formatYtDlpError(lastError || 'yt-dlp preview failed', effectiveBrowser, attemptedBrowsers),
    );
};

export const createImportJob = async (
    input: string,
    playlist?: boolean,
    audioFormat = DEFAULT_IMPORT_FORMAT,
    cookieBrowser?: string,
    createPlaylist?: boolean,
    playlistName?: string,
    sourceMetadata?: SourceImportMetadata,
    targetPlaylistIds?: string[],
    targetPlaylistNames?: string[],
    saveVideo?: boolean,
) => {
    if (!input.trim()) {
        throw new Error('Enter a URL or search query.');
    }

    const effectiveBrowser =
        cookieBrowser !== undefined
            ? normalizeCookieBrowser(cookieBrowser)
            : normalizeCookieBrowser(store.get('roofy.cookieBrowser') as string | undefined);

    const isPlaylist = inferPlaylistImport(input, playlist);
    let name = '';

    if (isPlaylist) {
        if (playlistName && playlistName.trim()) {
            name = playlistName.trim();
        } else {
            try {
                const preview = await previewImport(input.trim(), true, effectiveBrowser);
                name = preview.title;
            } catch {
                // Ignore preview failures; we'll fall back to a generic name.
            }
        }
    }

    const singleTrackPlaylistName = !isPlaylist && playlistName?.trim() ? playlistName.trim() : '';
    const jobPlaylistName = isPlaylist ? name || undefined : singleTrackPlaylistName || undefined;

    const job: ImportJob = {
        album: sourceMetadata?.album,
        artist: sourceMetadata?.artist,
        audioFormat,
        cookieBrowser: effectiveBrowser,
        createdAt: now(),
        createPlaylist:
            typeof createPlaylist === 'boolean'
                ? createPlaylist
                : isPlaylist || Boolean(jobPlaylistName),
        error: '',
        id: randomUUID(),
        imageUrl: sourceMetadata?.imageUrl,
        input: input.trim(),
        message: 'Queued',
        name: name || sourceMetadata?.title || singleTrackPlaylistName,
        playlist: isPlaylist,
        playlistName: jobPlaylistName,
        progress: 0,
        saveVideo,
        source: sourceMetadata?.source,
        sourceTrackId: sourceMetadata?.sourceTrackId,
        status: 'queued',
        targetPlaylistIds,
        targetPlaylistNames,
        title: sourceMetadata?.title,
        updatedAt: now(),
        videoId: sourceMetadata?.videoId,
        warning: '',
    };

    importJobs.unshift(job);
    persistImportJobs();
    processImportQueue();
    return job;
};

export const getImportJobForSourceTrack = (sourceTrackId: string) => {
    return (
        importJobs.find(
            (job) =>
                job.sourceTrackId === sourceTrackId &&
                ['completed', 'queued', 'running'].includes(job.status),
        ) || null
    );
};

const convertSrtToLrc = (srtContent: string): string => {
    const lines = srtContent.split(/\r?\n/);
    const result: string[] = [];
    let i = 0;

    while (i < lines.length) {
        if (!lines[i].trim()) {
            i++;
            continue;
        }

        if (/^\d+$/.test(lines[i].trim())) {
            i++;
            continue;
        }

        const timeMatch = /^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->/.exec(lines[i]);
        if (!timeMatch) {
            i++;
            continue;
        }

        const mins = parseInt(timeMatch[2], 10);
        const secs = parseInt(timeMatch[3], 10);
        const ms = parseInt(timeMatch[4], 10);
        const hundredths = Math.round(ms / 10);
        const timestamp = `[${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}]`;

        i++;

        const textLines: string[] = [];
        while (i < lines.length && lines[i].trim() !== '') {
            let text = lines[i].trim();
            text = text.replace(/<[^>]+>/g, '');
            if (text) textLines.push(text);
            i++;
        }

        for (const text of textLines) {
            result.push(`${timestamp}${text}`);
        }

        i++;
    }

    return result.join('\n') + '\n';
};

const processSubtitleForFile = (audioPath: string) => {
    const dir = path.dirname(audioPath);
    const base = path.basename(audioPath, path.extname(audioPath));
    const srtPath = path.join(dir, `${base}.en.srt`);

    if (!existsSync(srtPath)) return;

    const srtContent = readFileSync(srtPath, 'utf8');
    const lrcContent = convertSrtToLrc(srtContent);
    const lrcPath = path.join(dir, `${base}.lrc`);
    writeFileSync(lrcPath, lrcContent, 'utf8');
    unlinkSync(srtPath);
};

const writePlaylistM3U = (job: ImportJob, audioFiles: string[]) => {
    const libraryPath = getLibraryPath();
    const playlistDir = path.join(libraryPath, 'Playlists');
    mkdirSync(playlistDir, { recursive: true });

    const playlistName = job.playlistName || job.name || 'Imported Playlist';
    const safeName = playlistName.replace(/[<>:"/\\|?*]/g, '_').trim() || 'playlist';
    const m3uPath = path.join(playlistDir, `${safeName}.m3u`);

    let finalPath = m3uPath;
    let counter = 1;
    while (existsSync(finalPath)) {
        finalPath = path.join(playlistDir, `${safeName} (${counter}).m3u`);
        counter++;
    }

    const lines = ['#EXTM3U', `#PLAYLIST: ${playlistName}`];
    for (const file of audioFiles) {
        // Only include files that actually exist on disk
        if (!existsSync(file)) continue;

        // Write paths relative to the M3U file's directory so Navidrome resolves them correctly
        let relativePath = file;
        try {
            relativePath = path.relative(playlistDir, file);
            // Only fall back to absolute path when relative() genuinely fails.
            // Paths starting with ".." are valid relative paths to sibling/parent dirs.
            if (!relativePath) {
                relativePath = file;
            }
        } catch {
            relativePath = file;
        }
        lines.push(relativePath.split(path.sep).join('/'));
    }

    writeFileSync(finalPath, lines.join('\n') + '\n', 'utf8');
    return finalPath;
};

const triggerNavidromeScan = async () => {
    const url = getUrl();
    const username = LOCAL_SERVER_USERNAME;
    const password = getPassword();
    const baseParams = `u=${encodeURIComponent(username)}&p=${encodeURIComponent(password)}&v=1.16.1&c=roofy&f=json`;

    try {
        await fetch(`${url}/rest/startScan?${baseParams}`);

        const started = Date.now();
        while (Date.now() - started < 120000) {
            await new Promise((resolve) => setTimeout(resolve, 1500));
            const res = await fetch(`${url}/rest/getScanStatus?${baseParams}`);
            const data = await parseResponseBody(res);
            const scanning = data?.['subsonic-response']?.scanStatus?.scanning;
            if (!scanning) break;
        }
    } catch (error) {
        console.error('[local-first] Failed to trigger Navidrome scan:', error);
    }
};

const getSubsonicParams = () =>
    `u=${encodeURIComponent(LOCAL_SERVER_USERNAME)}&p=${encodeURIComponent(getPassword())}&v=1.16.1&c=roofy&f=json`;

const findAllImportedSongIds = async (audioFiles: string[]) => {
    const songIds: string[] = [];
    const seen = new Set<string>();

    for (const file of audioFiles) {
        const basename = path.basename(file, path.extname(file)).trim();
        if (!basename) continue;

        try {
            const response = await fetch(
                `${getUrl()}/rest/search3?${getSubsonicParams()}&query=${encodeURIComponent(basename)}&songCount=50&albumCount=0&artistCount=0`,
            );
            const body = await parseResponseBody(response);
            const songs = body?.['subsonic-response']?.searchResult3?.song || [];

            for (const song of songs) {
                const id = String(song?.id || '');
                if (!id || seen.has(id)) continue;

                const songPath = (song.path || '').toLowerCase();
                const songTitle = (song.title || '').toLowerCase();
                const searchLower = basename.toLowerCase();

                if (
                    songPath.includes(searchLower) ||
                    searchLower.includes(songTitle) ||
                    songTitle.includes(searchLower)
                ) {
                    seen.add(id);
                    songIds.push(id);
                    break;
                }
            }
        } catch (error) {
            console.error(`[local-first] Failed to search for song "${basename}":`, error);
        }
    }

    return songIds;
};

const populatePlaylist = async (playlistName: string, songIds: string[]) => {
    const url = getUrl();
    const params = getSubsonicParams();

    const playlistsResponse = await fetch(`${url}/rest/getPlaylists?${params}`);
    const playlistsBody = await parseResponseBody(playlistsResponse);
    const subsonicResponse = playlistsBody?.['subsonic-response'];

    if (!playlistsResponse.ok || subsonicResponse?.status === 'failed') {
        throw new Error(
            summarizeNavidromeError(subsonicResponse?.error, 'Could not list playlists.'),
        );
    }

    let playlists = subsonicResponse?.playlists?.playlist || [];
    if (!Array.isArray(playlists)) {
        playlists = playlists ? [playlists] : [];
    }

    const existing = playlists.find((p: any) => p.name === playlistName);

    if (existing) {
        const playlistResponse = await fetch(
            `${url}/rest/getPlaylist?${params}&id=${encodeURIComponent(existing.id)}`,
        );
        const playlistBody = await parseResponseBody(playlistResponse);
        const entries = playlistBody?.['subsonic-response']?.playlist?.entry || [];
        const existingIds = new Set((entries || []).map((e: any) => String(e.id)));
        const newSongIds = songIds.filter((id) => !existingIds.has(id));

        if (newSongIds.length > 0) {
            const songParams = newSongIds
                .map((id) => `songIdToAdd=${encodeURIComponent(id)}`)
                .join('&');
            const updateResponse = await fetch(
                `${url}/rest/updatePlaylist.view?${params}&playlistId=${encodeURIComponent(existing.id)}&${songParams}`,
            );
            const updateBody = await parseResponseBody(updateResponse);
            const updateSubsonic = updateBody?.['subsonic-response'];
            if (!updateResponse.ok || updateSubsonic?.status === 'failed') {
                throw new Error(
                    summarizeNavidromeError(
                        updateSubsonic?.error,
                        'Could not add songs to playlist.',
                    ),
                );
            }
        }
        return existing.id;
    }

    const songParams = songIds.map((id) => `songId=${encodeURIComponent(id)}`).join('&');
    const createResponse = await fetch(
        `${url}/rest/createPlaylist?${params}&name=${encodeURIComponent(playlistName)}&${songParams}`,
    );
    const createBody = await parseResponseBody(createResponse);
    const createSubsonic = createBody?.['subsonic-response'];
    if (!createResponse.ok || createSubsonic?.status === 'failed') {
        throw new Error(
            summarizeNavidromeError(createSubsonic?.error, 'Could not create playlist.'),
        );
    }
    return createSubsonic?.playlist?.id;
};

const findImportedSongIds = async (job: ImportJob, audioFiles: string[]) => {
    const searches = [
        job.videoId,
        job.title,
        job.name,
        ...audioFiles.map((file) => path.basename(file, path.extname(file))),
    ]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value));
    const seen = new Set<string>();
    const matches: string[] = [];

    for (const query of searches) {
        const response = await fetch(
            `${getUrl()}/rest/search3?${getSubsonicParams()}&query=${encodeURIComponent(query)}&songCount=25&albumCount=0&artistCount=0`,
        );
        const body = await parseResponseBody(response);
        const songs = body?.['subsonic-response']?.searchResult3?.song || [];

        for (const song of songs) {
            const id = String(song?.id || '');
            if (!id || seen.has(id)) continue;

            const haystack = [song.title, song.artist, song.album, song.path, song.suffix]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            const videoMatch = job.videoId && haystack.includes(job.videoId.toLowerCase());
            const titleMatch = job.title && haystack.includes(job.title.toLowerCase().slice(0, 40));

            if (videoMatch || titleMatch || searches.length === 1) {
                seen.add(id);
                matches.push(id);
            }
        }

        if (matches.length > 0) return matches;
    }

    return matches;
};

const addImportedSongsToTargetPlaylists = async (job: ImportJob, audioFiles: string[]) => {
    if (!job.targetPlaylistIds?.length) return;

    const songIds = await findImportedSongIds(job, audioFiles);
    if (songIds.length === 0) {
        throw new Error(
            'Import completed, but the imported track was not found in the local library scan.',
        );
    }

    for (const playlistId of job.targetPlaylistIds) {
        const songParams = songIds.map((id) => `songIdToAdd=${encodeURIComponent(id)}`).join('&');
        const response = await fetch(
            `${getUrl()}/rest/updatePlaylist.view?${getSubsonicParams()}&playlistId=${encodeURIComponent(playlistId)}&${songParams}`,
        );
        const body = await parseResponseBody(response);
        const subsonicResponse = body?.['subsonic-response'];

        if (!response.ok || subsonicResponse?.status === 'failed') {
            throw new Error(
                summarizeNavidromeError(
                    subsonicResponse?.error || body,
                    `Import completed, but the track could not be added to playlist ${playlistId}.`,
                ),
            );
        }
    }
};

const deleteLocalTracks = async (songIds: string[]) => {
    const url = getUrl();
    const params = getSubsonicParams();
    const libraryPath = getLibraryPath();
    const deleted: string[] = [];
    const failed: string[] = [];

    for (const songId of songIds) {
        try {
            const response = await fetch(
                `${url}/rest/getSong?${params}&id=${encodeURIComponent(songId)}`,
            );
            const body = await parseResponseBody(response);
            const song = body?.['subsonic-response']?.song;

            if (!song || !song.path) {
                failed.push(songId);
                continue;
            }

            const absolutePath = path.join(libraryPath, song.path);

            if (existsSync(absolutePath)) {
                unlinkSync(absolutePath);
            }

            // Also delete associated .lrc file
            const lrcPath = absolutePath.replace(path.extname(absolutePath), '.lrc');
            if (existsSync(lrcPath)) {
                unlinkSync(lrcPath);
            }

            deleted.push(songId);
        } catch (error) {
            console.error(`[local-first] Failed to delete track ${songId}:`, error);
            failed.push(songId);
        }
    }

    if (deleted.length > 0) {
        // Fire-and-forget scan to update Navidrome's database
        triggerNavidromeScan().catch(() => {});
    }

    return { deleted: deleted.length, failed: failed.length };
};

const getLocalFirstStatus = (message = ''): LocalFirstStatus => {
    const binaryPath = navidromeBinaryPath();
    const running = Boolean(navidromeProcess && !navidromeProcess.killed);

    return {
        dataPath: getDataPath(),
        imports: importJobs,
        libraryPath: getLibraryPath(),
        navidrome: {
            available: Boolean(binaryPath),
            binaryPath,
            configPath: getConfigPath(),
            message: message || (running ? 'Running' : 'Not running'),
            password: getPassword(),
            pid: navidromeProcess?.pid || null,
            running,
            url: getUrl(),
            username: LOCAL_SERVER_USERNAME,
        },
        tools: {
            deno: toolAvailable('deno', 'ROOFY_DENO_PATH'),
            ffmpeg: toolAvailable('ffmpeg', 'ROOFY_FFMPEG_PATH'),
            navidrome: Boolean(binaryPath),
            ytDlp: toolAvailable('yt-dlp', 'ROOFY_YT_DLP_PATH'),
        },
    };
};

ipcMain.handle('roofy-local-status', () => getLocalFirstStatus());
ipcMain.handle('roofy-local-start', async () => startLocalFirst());
ipcMain.handle('roofy-local-stop', () => {
    shutdownLocalFirst();
    return getLocalFirstStatus();
});

ipcMain.handle('roofy-local-select-library', async () => {
    const result = await dialog.showOpenDialog({
        defaultPath: getLibraryPath(),
        properties: ['openDirectory', 'createDirectory'],
        title: 'Choose Roofy Music library folder',
    });

    if (!result.canceled && result.filePaths[0]) {
        store.set('roofy.libraryPath', result.filePaths[0]);
        ensureLocalFolders();
    }

    return getLocalFirstStatus();
});

ipcMain.handle('roofy-local-open-library-folder', async () => {
    ensureLocalFolders();
    return shell.openPath(getLibraryPath());
});

ipcMain.handle(
    'roofy-local-preview-import',
    async (_event, args: { cookieBrowser?: string; input: string; playlist?: boolean }) => {
        return previewImport(args.input, args.playlist, args.cookieBrowser);
    },
);

ipcMain.handle(
    'roofy-local-create-import',
    async (
        _event,
        args: {
            album?: string;
            artist?: string;
            audioFormat?: string;
            cookieBrowser?: string;
            createPlaylist?: boolean;
            imageUrl?: string;
            input: string;
            playlist?: boolean;
            playlistName?: string;
            saveVideo?: boolean;
            source?: 'youtube_music';
            sourceTrackId?: string;
            title?: string;
            videoId?: string;
        },
    ) => {
        return createImportJob(
            args.input,
            args.playlist,
            args.audioFormat || DEFAULT_IMPORT_FORMAT,
            args.cookieBrowser,
            args.createPlaylist,
            args.playlistName,
            {
                album: args.album,
                artist: args.artist,
                imageUrl: args.imageUrl,
                source: args.source,
                sourceTrackId: args.sourceTrackId,
                title: args.title,
                videoId: args.videoId,
            },
            undefined,
            undefined,
            args.saveVideo,
        );
    },
);

ipcMain.handle('roofy-local-cancel-import', (_event, id: string) => {
    updateJob(id, { message: 'Cancelling', status: 'cancelled' });
    if (activeImport?.id === id) {
        activeImport.child.kill();
        activeImport = null;
    }
    return getLocalFirstStatus();
});

ipcMain.handle('roofy-local-remove-import', (_event, id: string) => removeImportJob(id));
ipcMain.handle('roofy-local-clear-imports', (_event, status: 'completed' | 'failed') =>
    clearImportJobs(status),
);

ipcMain.handle('roofy-local-create-user', (_event, args: CreateLocalUserArgs) =>
    createLocalUser(args),
);

ipcMain.handle('roofy-local-delete-tracks', async (_event, songIds: string[]) =>
    deleteLocalTracks(songIds),
);

ipcMain.handle(
    'roofy-local-get-video-metadata',
    (
        _event,
        args: {
            path?: null | string;
            songId?: string;
            youtubeMusic?: { videoId?: string; watchUrl?: string };
        },
    ) => findLocalVideoMetadata(args),
);

ipcMain.handle(
    'roofy-local-download-video-for-song',
    async (
        _event,
        args: {
            path?: null | string;
            songId: string;
            title?: string;
            youtubeMusic?: { videoId?: string; watchUrl?: string };
        },
    ) => {
        if (!args.path) {
            throw new Error('This local track does not expose a file path.');
        }

        const videoId =
            args.youtubeMusic?.videoId ||
            extractYoutubeVideoId(args.youtubeMusic?.watchUrl) ||
            extractYoutubeVideoId(args.path);

        await downloadVideoForAudioFile(args.path, {
            songId: args.songId,
            sourceUrl: args.youtubeMusic?.watchUrl || (videoId ? getYoutubeWatchUrl(videoId) : ''),
            title: args.title,
            videoId,
        });

        return findLocalVideoMetadata(args);
    },
);

ipcMain.handle('roofy-local-credentials', () => ({
    configPath: getConfigPath(),
    id: LOCAL_SERVER_ID,
    name: 'Roofy Local Library',
    password: getPassword(),
    type: 'navidrome',
    url: getUrl(),
    username: LOCAL_SERVER_USERNAME,
}));
