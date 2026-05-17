import { app, dialog, ipcMain, shell } from 'electron';
import { ChildProcessWithoutNullStreams, spawn, spawnSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { randomBytes, randomUUID } from 'crypto';

import { store } from '../settings';

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

type ImportJob = {
    audioFormat: string;
    cookieBrowser: string;
    createdAt: string;
    error: string;
    id: string;
    input: string;
    message: string;
    playlist: boolean;
    progress: number;
    status: 'cancelled' | 'completed' | 'failed' | 'queued' | 'running';
    updatedAt: string;
};

type CreateLocalUserArgs = {
    email?: string;
    isAdmin?: boolean;
    name?: string;
    password: string;
    username: string;
};

const LOCAL_SERVER_ID = 'roofy-local-navidrome';
const LOCAL_SERVER_USERNAME = 'admin';
const DEFAULT_PORT = 4533;
const DEFAULT_IMPORT_FORMAT = 'mp3';
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
const COOKIE_BROWSER_AUTO_ATTEMPTS = ['edge', 'chrome', 'brave', 'firefox', 'vivaldi', 'chromium', 'opera'];

let navidromeProcess: ChildProcessWithoutNullStreams | null = null;
let activeImport: { child: ChildProcessWithoutNullStreams; id: string } | null = null;
const importJobs: ImportJob[] = [];

const now = () => new Date().toISOString();

const getLocalRoot = () => path.join(app.getPath('userData'), 'local-first');
const getDataPath = () => path.join(getLocalRoot(), 'navidrome-data');
const getDefaultLibraryPath = () => path.join(app.getPath('music'), 'Roofy Music');
const getConfigPath = () => path.join(app.getPath('userData'), 'config.json');

const getLibraryPath = () => {
    const configured = store.get('roofy.libraryPath') as string | undefined;
    return configured || getDefaultLibraryPath();
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
        path.join(__dirname, '../../../../../resources/bin', process.platform, process.arch, binaryName),
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
        } catch (_error) {
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
    } catch (_error) {
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
            .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
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
        throw new Error(summarizeNavidromeError(body, 'Could not log in to the local Navidrome admin account.'));
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
    configureRendererServerLock();

    if (navidromeProcess && !navidromeProcess.killed) {
        return getLocalFirstStatus();
    }

    const binaryPath = navidromeBinaryPath();
    if (!binaryPath) {
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
            PATH: ffmpegDir ? `${ffmpegDir}${path.delimiter}${process.env.PATH || ''}` : process.env.PATH,
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

    await waitForNavidrome();
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

const updateJob = (id: string, patch: Partial<ImportJob>) => {
    const job = importJobs.find((item) => item.id === id);
    if (!job) return null;
    Object.assign(job, patch, { updatedAt: now() });
    return job;
};

const normalizeImportInput = (input: string) => {
    const value = input.trim();
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;
    return `ytsearch1:${value}`;
};

const normalizeDownloadUrl = (input: string, playlist: boolean) => {
    const value = normalizeImportInput(input);
    if (playlist || !/^https?:\/\//i.test(value)) return value;

    try {
        const url = new URL(value);
        const hostname = url.hostname.replace(/^www\./, '');
        if ((hostname === 'youtube.com' || hostname === 'm.youtube.com') && url.searchParams.has('v')) {
            return `https://www.youtube.com/watch?v=${url.searchParams.get('v')}`;
        }
        if (hostname === 'youtu.be') {
            return `https://www.youtube.com/watch?v=${url.pathname.replace(/^\//, '')}`;
        }
    } catch (_error) {
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

        if ((hostname === 'youtube.com' || hostname === 'm.youtube.com') && url.pathname === '/playlist') {
            return Boolean(listId);
        }

        if (!listId) return false;

        // YouTube radio URLs include an RD list next to a video id. Treat those as a single video.
        if (listId.toUpperCase().startsWith('RD')) return false;

        return true;
    } catch (_error) {
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
    const firstLine = result.stdout?.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    return result.status === 0 && firstLine ? firstLine : null;
};

const getJsRuntimeArgs = () => {
    const configured = process.env.ROOFY_YT_DLP_JS_RUNTIME || (store.get('roofy.ytDlpJsRuntime') as string);
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
            attempted ? `Attempted browsers: ${attempted}.` : 'No browser cookie extraction was attempted.',
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

const processImportQueue = () => {
    if (activeImport) return;
    const nextJob = importJobs.slice().reverse().find((job) => job.status === 'queued');
    if (!nextJob) return;
    runImport(nextJob);
};

const runImport = (job: ImportJob, attemptIndex = 0, attemptedBrowsers: string[] = [], triedWithoutCookies = false) => {
    const ytDlp = getToolCommand('yt-dlp', 'ROOFY_YT_DLP_PATH');
    const ffmpegPath = ffmpegBinaryPath();
    const libraryPath = getLibraryPath();
    const cookieAttempts = getCookieAttempts(job.cookieBrowser);
    const cookiesFilePath = triedWithoutCookies ? undefined : (store.get('roofy.cookiesFilePath') as string | undefined);
    const hasCookieFile = Boolean(cookiesFilePath);
    const cookieBrowser = hasCookieFile || triedWithoutCookies ? '' : cookieAttempts[attemptIndex] || '';
    const outputTemplate = path.join(
        libraryPath,
        'Downloads',
        '%(uploader|Unknown Artist)s',
        '%(title).200B [%(id)s].%(ext)s',
    );

    const args = [
        '--newline',
        '--progress',
        '--extract-audio',
        '--embed-thumbnail',
        '--convert-thumbnails',
        'jpg',
        '--add-metadata',
        '--no-mtime',
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
        message: cookieBrowser ? 'Preparing signed-in import' : 'Starting import',
        progress: 1,
        status: 'running',
    });

    const recentOutput: string[] = [];
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

        const percent = /\[download\]\s+(\d+(?:\.\d+)?)%/.exec(clean);
        if (percent) {
            updateJob(job.id, {
                message: clean,
                progress: Math.min(99, Math.max(1, Number(percent[1]))),
            });
            return;
        }

        updateJob(job.id, { message: clean });
    };

    child.stdout.on('data', (chunk) => chunk.toString().split(/\r?\n/).forEach(handleLine));
    child.stderr.on('data', (chunk) => chunk.toString().split(/\r?\n/).forEach(handleLine));

    child.on('close', (code) => {
        activeImport = null;
        const current = importJobs.find((item) => item.id === job.id);
        if (current?.status === 'cancelled') {
            updateJob(job.id, { message: 'Cancelled' });
        } else if (code === 0) {
            updateJob(job.id, { message: 'Import complete', progress: 100, status: 'completed' });
        } else {
            const output = recentOutput.join('\n');
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
    duration: number | null;
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
                resolve({
                    count: entries.length,
                    duration: first.duration || null,
                    isPlaylist: Boolean(data.entries),
                    thumbnail: first.thumbnail || data.thumbnail || '',
                    title: first.title || data.title || 'Untitled',
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
            if (dbLocked || effectiveBrowser !== 'auto' || !isAuthBlockedError(lastError) || index === attempts.length - 1) {
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

    throw new Error(formatYtDlpError(lastError || 'yt-dlp preview failed', effectiveBrowser, attemptedBrowsers));
};

const createImportJob = (
    input: string,
    playlist?: boolean,
    audioFormat = DEFAULT_IMPORT_FORMAT,
    cookieBrowser?: string,
) => {
    if (!input.trim()) {
        throw new Error('Enter a URL or search query.');
    }

    const effectiveBrowser =
        cookieBrowser !== undefined
            ? normalizeCookieBrowser(cookieBrowser)
            : normalizeCookieBrowser(store.get('roofy.cookieBrowser') as string | undefined);

    const job: ImportJob = {
        audioFormat,
        cookieBrowser: effectiveBrowser,
        createdAt: now(),
        error: '',
        id: randomUUID(),
        input: input.trim(),
        message: 'Queued',
        playlist: inferPlaylistImport(input, playlist),
        progress: 0,
        status: 'queued',
        updatedAt: now(),
    };

    importJobs.unshift(job);
    processImportQueue();
    return job;
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
    (
        _event,
        args: { audioFormat?: string; cookieBrowser?: string; input: string; playlist?: boolean },
    ) => {
        return createImportJob(
            args.input,
            args.playlist,
            args.audioFormat || DEFAULT_IMPORT_FORMAT,
            args.cookieBrowser,
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

ipcMain.handle('roofy-local-create-user', (_event, args: CreateLocalUserArgs) => createLocalUser(args));

ipcMain.handle('roofy-local-credentials', () => ({
    configPath: getConfigPath(),
    id: LOCAL_SERVER_ID,
    name: 'Roofy Local Library',
    password: getPassword(),
    type: 'navidrome',
    url: getUrl(),
    username: LOCAL_SERVER_USERNAME,
}));
