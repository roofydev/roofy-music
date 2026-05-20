import { BG, type BgConfig } from 'bgutils-js';
import { app, BrowserWindow, ipcMain, net, safeStorage, session } from 'electron';
import http from 'http';
import https from 'https';
import { createRequire } from 'module';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import vm from 'vm';

import { store } from '../settings';

import {
    Album,
    AlbumArtist,
    ExplicitStatus,
    Genre,
    LibraryItem,
    Playlist,
    RelatedArtist,
    ServerType,
    Song,
} from '/@/shared/types/domain-types';
import {
    YOUTUBE_MUSIC_SOURCE_ID,
    YOUTUBE_MUSIC_SOURCE_NAME,
    YoutubeMusicAuthStatus,
    YoutubeMusicHomeResponse,
    YoutubeMusicSearchResult,
} from '/@/shared/types/youtube-music-types';

const SESSION_KEY = 'youtubeMusic.session';
const SOURCE_URL = 'https://music.youtube.com';
const LOGIN_PARTITION = 'persist:roofy-youtube-music';
const REQUIRED_COOKIE_NAMES = new Set(['APISID', 'SAPISID', 'SID', 'SSID']);
const STREAM_CACHE_TTL_MS = 4 * 60 * 1000;
const VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;
const requireDependency = createRequire(__filename);

type StoredSession = {
    connectedAt: string;
    cookie: string;
    displayName: null | string;
};

type StreamCacheEntry = {
    expiresAt: number;
    url: string;
};

const isGoogleVideoUrl = (url: string) => {
    try {
        return new URL(url).hostname.endsWith('.googlevideo.com');
    } catch {
        return false;
    }
};

const isAudioFormat = (format: any) => {
    const mimeType = String(format?.mime_type || format?.mimeType || '');
    return format?.has_audio !== false && !format?.has_video && mimeType.includes('audio');
};

const chooseAudioFormat = (formats: any[] | undefined) => {
    const audioFormats = (formats || []).filter(isAudioFormat);
    return audioFormats.sort(
        (a, b) =>
            Number(b?.bitrate || b?.average_bitrate || 0) -
            Number(a?.bitrate || a?.average_bitrate || 0),
    )[0];
};

const decipherFormatUrl = async (format: any, player: any): Promise<null | string> => {
    if (!format) return null;
    return format.url || (format.decipher ? await format.decipher(player) : null);
};

let innertubeInstance: any | null = null;
let innertubeCookie: null | string = null;
let youtubeRuntimeInstalled = false;
const streamCache = new Map<string, StreamCacheEntry>();
let ytProxyPort: null | number = null;
let ytProxyReadyPromise: null | Promise<void> = null;
const recentInvalidations = new Map<string, number>();
const INVALIDATION_COOLDOWN_MS = 10000;

const startYtProxyServer = () => {
    if (ytProxyReadyPromise) return ytProxyReadyPromise;

    ytProxyReadyPromise = new Promise((resolve) => {
        const server = http.createServer(async (req, res) => {
            const match = req.url?.match(/^\/yt-stream\/([A-Za-z0-9_-]{11})$/);
            if (!match) {
                res.statusCode = 404;
                res.end();
                return;
            }

            if (req.method === 'OPTIONS') {
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', '*');
                res.setHeader('Access-Control-Expose-Headers', '*');
                res.statusCode = 204;
                res.end();
                return;
            }

            if (req.method !== 'GET' && req.method !== 'HEAD') {
                res.statusCode = 405;
                res.end();
                return;
            }

            const videoId = match[1];
            let streamUrl: null | string = null;

            try {
                streamUrl = await resolveStreamUrl(videoId);
            } catch (error) {
                console.error('Failed to resolve YouTube stream URL:', error);
                res.statusCode = 502;
                res.end();
                return;
            }

            if (!streamUrl) {
                res.statusCode = 404;
                res.end();
                return;
            }

            const headers: Record<string, string> = {
                Accept: '*/*',
                'Accept-Encoding': 'identity',
                'Accept-Language': 'en-US,en;q=0.9',
                'User-Agent':
                    req.headers['user-agent'] ||
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
            };
            if (req.headers.range) {
                headers['Range'] = req.headers.range;
            }

            const stored = getStoredSession();
            if (stored?.cookie && !isGoogleVideoUrl(streamUrl)) {
                headers['Cookie'] = stored.cookie;
            }

            // Detect IP family from the stream URL so we match what Innertube used
            const getUrlIpFamily = (url: string): number => {
                try {
                    const u = new URL(url);
                    const ipParam = u.searchParams.get('ip');
                    if (!ipParam) return 0;
                    const decoded = decodeURIComponent(ipParam);
                    return decoded.includes(':') ? 6 : decoded.includes('.') ? 4 : 0;
                } catch {
                    return 0;
                }
            };

            console.log(`[YT Stream Proxy] Proxying ${videoId} -> ${new URL(streamUrl).hostname}`);

            const forwardProxy = (url: string, attempt = 1, ipFamily?: number) => {
                const family = ipFamily ?? getUrlIpFamily(url);
                const requestOptions: https.RequestOptions = {
                    family: family || undefined,
                    headers,
                    method: req.method,
                };

                const proxyReq = https.request(url, requestOptions, async (proxyRes) => {
                    const status = proxyRes.statusCode || 0;

                    // Follow redirects ourselves so the browser doesn't leak cross-origin
                    if (
                        status >= 300 &&
                        status < 400 &&
                        proxyRes.headers.location &&
                        attempt <= 3
                    ) {
                        const redirectUrl = new URL(proxyRes.headers.location, url).href;
                        console.log(
                            `[YT Stream Proxy] Following ${status} redirect for ${videoId}`,
                        );
                        forwardProxy(redirectUrl, attempt + 1, family || undefined);
                        return;
                    }

                    // Only invalidate cache once per cooldown to prevent resolve storms
                    if (status === 403 && attempt === 1) {
                        const now = Date.now();
                        const lastInvalidation = recentInvalidations.get(videoId) || 0;
                        if (now - lastInvalidation > INVALIDATION_COOLDOWN_MS) {
                            console.warn(
                                `[YT Stream Proxy] CDN 403 for ${videoId} (family=${family || 'auto'}), invalidating cache and retrying fresh resolve...`,
                            );
                            recentInvalidations.set(videoId, now);
                            streamCache.delete(videoId);
                            try {
                                const freshUrl = await resolveStreamUrl(videoId, new Set([url]));
                                if (freshUrl) {
                                    console.log(
                                        `[YT Stream Proxy] Fresh URL resolved, retrying ${videoId}`,
                                    );
                                    forwardProxy(freshUrl, attempt + 1, family || undefined);
                                    return;
                                }
                            } catch (resolveError) {
                                console.error(
                                    `[YT Stream Proxy] Fresh resolve failed for ${videoId}:`,
                                    resolveError,
                                );
                            }
                        } else {
                            console.warn(
                                `[YT Stream Proxy] CDN 403 for ${videoId} - skipped re-resolve (cooldown active)`,
                            );
                        }
                    }

                    if (status >= 400) {
                        console.error(
                            `[YT Stream Proxy] CDN returned ${status} for ${videoId} ` +
                                `(family=${family || 'auto'}, Cookie=${Boolean(headers.Cookie)}, Range=${headers.Range || 'none'})`,
                        );

                        if (status === 403 && req.method === 'GET' && !res.headersSent) {
                            proxyRes.resume();
                            console.warn(
                                `[YT Stream Proxy] Falling back to yt-dlp pipe for ${videoId}`,
                            );
                            pipeStreamWithYtdlp(videoId, res);
                            return;
                        }
                    }

                    res.statusCode = status;
                    for (const [key, value] of Object.entries(proxyRes.headers)) {
                        if (
                            value !== undefined &&
                            key.toLowerCase() !== 'access-control-allow-origin'
                        ) {
                            res.setHeader(key, value);
                        }
                    }
                    res.setHeader('Access-Control-Allow-Origin', '*');
                    res.setHeader('Access-Control-Expose-Headers', '*');

                    if (req.method === 'HEAD') {
                        res.end();
                        return;
                    }

                    proxyRes.pipe(res);
                });

                proxyReq.on('error', (err) => {
                    console.error('[YT Stream Proxy] Request error:', err);
                    if (!res.headersSent) {
                        res.statusCode = 502;
                        res.setHeader('Access-Control-Allow-Origin', '*');
                        res.end();
                    }
                });

                proxyReq.end();
            };

            forwardProxy(streamUrl);
        });

        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            if (address && typeof address === 'object') {
                ytProxyPort = address.port;
                console.log(`YouTube Music stream proxy listening on 127.0.0.1:${ytProxyPort}`);
            }
            resolve();
        });
    });

    return ytProxyReadyPromise;
};

const getYtDlpPath = () => {
    const envPath = process.env.ROOFY_YT_DLP_PATH || (store.get('roofy.yt-dlpPath') as string);
    if (envPath) return envPath;

    const binaryName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
    const candidates = [
        path.join(process.resourcesPath || '', 'bin', process.platform, process.arch, binaryName),
        path.join(process.resourcesPath || '', 'bin', binaryName),
        path.join(app.getAppPath(), 'resources/bin', process.platform, process.arch, binaryName),
        path.join(app.getAppPath(), 'resources/bin', binaryName),
    ];

    for (const candidate of candidates) {
        if (existsSync(candidate)) return candidate;
    }

    return 'yt-dlp';
};

const resolveStreamUrlWithYtdlp = async (videoId: string): Promise<null | string> => {
    const ytDlpPath = getYtDlpPath();
    const stored = getStoredSession();
    const args = ['--no-check-certificates', '--no-warnings', '-f', 'bestaudio', '--get-url'];

    if (stored?.cookie) {
        args.push('--add-header', `Cookie:${stored.cookie}`);
        args.push('--add-header', 'Referer:https://music.youtube.com/');
    }

    args.push(`https://music.youtube.com/watch?v=${videoId}`);

    return new Promise((resolve, reject) => {
        const child = spawn(ytDlpPath, args, { windowsHide: true });
        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data: Buffer) => {
            stdout += data.toString();
        });

        child.stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
        });

        child.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(stderr || `yt-dlp exited with code ${code}`));
                return;
            }
            const url = stdout
                .trim()
                .split('\n')
                .find((line) => line.startsWith('http'));
            resolve(url || null);
        });

        child.on('error', (err) => {
            reject(err);
        });
    });
};

const pipeStreamWithYtdlp = (videoId: string, res: http.ServerResponse) => {
    const ytDlpPath = getYtDlpPath();
    const stored = getStoredSession();
    const args = [
        '--no-check-certificates',
        '--no-warnings',
        '--quiet',
        '--no-playlist',
        '-f',
        'bestaudio[ext=m4a]/bestaudio',
        '-o',
        '-',
    ];

    if (stored?.cookie) {
        args.push('--add-header', `Cookie:${stored.cookie}`);
        args.push('--add-header', 'Referer:https://music.youtube.com/');
    }

    args.push(`https://music.youtube.com/watch?v=${videoId}`);

    const child = spawn(ytDlpPath, args, { windowsHide: true });
    let started = false;
    let stderr = '';

    child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
    });

    child.stdout.on('data', (chunk: Buffer) => {
        if (!started) {
            started = true;
            res.statusCode = 200;
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Expose-Headers', '*');
            res.setHeader('Accept-Ranges', 'none');
            res.setHeader('Content-Type', 'audio/mp4');
        }
        res.write(chunk);
    });

    child.on('close', (code) => {
        if (!started && !res.headersSent) {
            res.statusCode = code === 0 ? 204 : 502;
            res.setHeader('Access-Control-Allow-Origin', '*');
            if (code !== 0) {
                console.error(`[YT Stream Proxy] yt-dlp pipe failed for ${videoId}:`, stderr);
            }
        }
        res.end();
    });

    child.on('error', (error) => {
        console.error(`[YT Stream Proxy] yt-dlp pipe error for ${videoId}:`, error);
        if (!started && !res.headersSent) {
            res.statusCode = 502;
            res.setHeader('Access-Control-Allow-Origin', '*');
        }
        res.end();
    });

    res.on('close', () => {
        if (!child.killed) {
            child.kill();
        }
    });
};

const resolveStreamUrl = async (
    videoId: string,
    rejectedUrls = new Set<string>(),
): Promise<null | string> => {
    const cached = streamCache.get(videoId);
    if (cached && cached.expiresAt > Date.now() && !rejectedUrls.has(cached.url)) {
        return cached.url;
    }

    const yt = await getInnertube();

    // Method 1: TV_EMBEDDED client (often bypasses bot checks without po_token)
    try {
        const info = await yt.getBasicInfo(videoId, { client: 'TV_EMBEDDED' });
        const format = chooseAudioFormat(info.streaming_data?.adaptive_formats);
        const url = await decipherFormatUrl(format, yt.session.player);
        if (url && !rejectedUrls.has(url)) {
            console.log(`[YT Stream] Resolved via TV_EMBEDDED for ${videoId}`);
            streamCache.set(videoId, { expiresAt: Date.now() + STREAM_CACHE_TTL_MS, url });
            return url;
        }
        if (url) {
            console.warn(`[YT Stream] TV_EMBEDDED returned a rejected URL for ${videoId}`);
        }
    } catch (error) {
        console.warn(`[YT Stream] TV_EMBEDDED failed for ${videoId}:`, error);
    }

    // Method 2: WEB_REMIX with auth
    try {
        const info = await yt.music.getInfo(videoId);
        const format = info.chooseFormat
            ? info.chooseFormat({ quality: 'best', type: 'audio' })
            : chooseAudioFormat(info.streaming_data?.adaptive_formats);
        const url = await decipherFormatUrl(format, yt.session.player);
        if (url && !rejectedUrls.has(url)) {
            console.log(`[YT Stream] Resolved via WEB_REMIX for ${videoId}`);
            streamCache.set(videoId, { expiresAt: Date.now() + STREAM_CACHE_TTL_MS, url });
            return url;
        }
        if (url) {
            console.warn(`[YT Stream] WEB_REMIX returned a rejected URL for ${videoId}`);
        }
    } catch (error) {
        console.warn(`[YT Stream] WEB_REMIX failed for ${videoId}:`, error);
    }

    // Method 3: WEB client with auth
    try {
        const info = await yt.getBasicInfo(videoId);
        const format = chooseAudioFormat(info.streaming_data?.adaptive_formats);
        const url = await decipherFormatUrl(format, yt.session.player);
        if (url && !rejectedUrls.has(url)) {
            console.log(`[YT Stream] Resolved via WEB for ${videoId}`);
            streamCache.set(videoId, { expiresAt: Date.now() + STREAM_CACHE_TTL_MS, url });
            return url;
        }
        if (url) {
            console.warn(`[YT Stream] WEB returned a rejected URL for ${videoId}`);
        }
    } catch (error) {
        console.warn(`[YT Stream] WEB failed for ${videoId}:`, error);
    }

    // Method 4: yt-dlp fallback
    try {
        const url = await resolveStreamUrlWithYtdlp(videoId);
        if (url && !rejectedUrls.has(url)) {
            console.log(`[YT Stream] Resolved via yt-dlp for ${videoId}`);
            streamCache.set(videoId, { expiresAt: Date.now() + STREAM_CACHE_TTL_MS, url });
            return url;
        }
        if (url) {
            console.warn(`[YT Stream] yt-dlp returned a rejected URL for ${videoId}`);
        }
    } catch (error) {
        console.warn(`[YT Stream] yt-dlp failed for ${videoId}:`, error);
    }

    return null;
};

const nowIso = () => new Date().toISOString();

const decrypt = (encrypted: unknown): null | StoredSession => {
    if (typeof encrypted !== 'string') return null;

    try {
        const raw = safeStorage.isEncryptionAvailable()
            ? safeStorage.decryptString(Buffer.from(encrypted, 'hex'))
            : encrypted;
        return JSON.parse(raw) as StoredSession;
    } catch {
        return null;
    }
};

const encrypt = (value: StoredSession) => {
    const raw = JSON.stringify(value);
    if (!safeStorage.isEncryptionAvailable()) return raw;
    return safeStorage.encryptString(raw).toString('hex');
};

const getStoredSession = () => decrypt(store.get(SESSION_KEY));

const clearCachedClient = () => {
    innertubeCookie = null;
    innertubeInstance = null;
    streamCache.clear();
};

const loadYoutubei = async () => {
    try {
        const youtubei = requireDependency('youtubei.js');
        if (!youtubeRuntimeInstalled && youtubei.Platform?.shim) {
            youtubei.Platform.load({
                ...youtubei.Platform.shim,
                eval: async (data: { output: string }, args: Record<string, unknown>) =>
                    vm.runInNewContext(`(() => {\n${data.output}\n})()`, {
                        ...args,
                        URL,
                        URLSearchParams,
                    }),
            });
            youtubeRuntimeInstalled = true;
        }
        return youtubei;
    } catch (error) {
        throw new Error(
            `youtubei.js is not installed or could not be loaded: ${(error as Error).message}`,
        );
    }
};

const getInnertube = async () => {
    const stored = getStoredSession();
    const cookie = stored?.cookie || '';

    if (innertubeInstance && innertubeCookie === cookie) {
        return innertubeInstance;
    }

    const { Innertube, UniversalCache } = await loadYoutubei();
    innertubeInstance = await Innertube.create({
        cache: new UniversalCache(false),
        cookie,
        generate_session_locally: true,
    });
    innertubeCookie = cookie;

    // Generate po_token (adapted from pear-desktop downloader)
    try {
        const requestKey = 'O43z0dpjhgX20SCx4KAo';
        const visitorData = innertubeInstance.session.context.client.visitorData;

        if (visitorData) {
            const cleanUp = (context: Partial<typeof globalThis>) => {
                delete (context as any).window;
                delete (context as any).document;
            };

            const { Window } = await import('happy-dom');
            const happyWindow = new Window({ console, height: 1080, width: 1920 });
            const happyDocument = happyWindow.document;

            Object.assign(globalThis, {
                document: happyDocument,
                window: happyWindow,
            });

            const bgConfig: BgConfig = {
                fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
                    const request = new Request(
                        typeof input === 'string'
                            ? new URL(input)
                            : input instanceof URL
                              ? input
                              : new URL(input.url),
                        input instanceof Request ? input : undefined,
                    );
                    return net.fetch(request, init);
                },
                globalObj: globalThis,
                identifier: visitorData,
                requestKey,
            };

            const bgChallenge = await BG.Challenge.create(bgConfig);
            const interpreterJavascript =
                bgChallenge?.interpreterJavascript?.privateDoNotAccessOrElseSafeScriptWrappedValue;

            if (interpreterJavascript) {
                new Function(interpreterJavascript)();

                const poTokenResult = await BG.PoToken.generate({
                    bgConfig,
                    globalName: bgChallenge.globalName,
                    program: bgChallenge.program,
                }).finally(() => {
                    cleanUp(globalThis);
                });

                innertubeInstance.session.po_token = poTokenResult.poToken;
            } else {
                cleanUp(globalThis);
            }
        }
    } catch (error) {
        console.error('Failed to generate YouTube po_token:', error);
    }

    return innertubeInstance;
};

const getCookieHeader = async () => {
    const cookies = await session.fromPartition(LOGIN_PARTITION).cookies.get({});
    const youtubeCookies = cookies.filter((cookie) =>
        ['.youtube.com', 'music.youtube.com', '.google.com', 'accounts.google.com'].some((domain) =>
            (cookie.domain || '').includes(domain),
        ),
    );

    return youtubeCookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
};

const hasRequiredCookies = (cookieHeader: string) => {
    for (const name of REQUIRED_COOKIE_NAMES) {
        if (!cookieHeader.includes(`${name}=`)) return false;
    }
    return true;
};

const status = async (): Promise<YoutubeMusicAuthStatus> => {
    let dependencyAvailable = true;
    try {
        await loadYoutubei();
    } catch {
        dependencyAvailable = false;
    }

    const stored = getStoredSession();
    return {
        connected: Boolean(stored?.cookie),
        connectedAt: stored?.connectedAt || null,
        dependencyAvailable,
        displayName: stored?.displayName || null,
        sourceId: YOUTUBE_MUSIC_SOURCE_ID,
    };
};

const connect = async (): Promise<YoutubeMusicAuthStatus> => {
    await loadYoutubei();

    const loginSession = session.fromPartition(LOGIN_PARTITION);
    const loginWindow = new BrowserWindow({
        autoHideMenuBar: true,
        height: 760,
        title: 'Connect YouTube Music',
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            partition: LOGIN_PARTITION,
            sandbox: true,
        },
        width: 980,
    });

    return new Promise((resolve, reject) => {
        let completed = false;
        const timers: { interval?: NodeJS.Timeout; timeout?: NodeJS.Timeout } = {};

        const finish = async () => {
            if (completed) return;
            const cookie = await getCookieHeader();
            if (!hasRequiredCookies(cookie)) return;

            completed = true;
            if (timers.interval) clearInterval(timers.interval);
            if (timers.timeout) clearTimeout(timers.timeout);

            const stored: StoredSession = {
                connectedAt: nowIso(),
                cookie,
                displayName: YOUTUBE_MUSIC_SOURCE_NAME,
            };
            store.set(SESSION_KEY, encrypt(stored));
            clearCachedClient();
            loginWindow.close();
            resolve(status());
        };

        timers.interval = setInterval(() => {
            finish().catch((error) => {
                completed = true;
                reject(error);
            });
        }, 1000);

        timers.timeout = setTimeout(
            () => {
                if (completed) return;
                completed = true;
                if (timers.interval) clearInterval(timers.interval);
                loginWindow.close();
                reject(new Error('YouTube Music login timed out.'));
            },
            10 * 60 * 1000,
        );

        loginWindow.on('closed', () => {
            if (completed) return;
            completed = true;
            if (timers.interval) clearInterval(timers.interval);
            if (timers.timeout) clearTimeout(timers.timeout);
            reject(new Error('YouTube Music login was cancelled.'));
        });

        loginSession.webRequest.onCompleted({ urls: ['https://music.youtube.com/*'] }, () => {
            finish().catch((error) => {
                completed = true;
                reject(error);
            });
        });

        loginWindow.loadURL(SOURCE_URL).catch(reject);
    });
};

const disconnect = async (): Promise<YoutubeMusicAuthStatus> => {
    store.delete(SESSION_KEY);
    clearCachedClient();
    await session.fromPartition(LOGIN_PARTITION).clearStorageData({
        storages: ['cookies', 'localstorage'],
    });
    return status();
};

const textValue = (value: any): string => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value.text === 'string') return value.text;
    if (Array.isArray(value.runs)) return value.runs.map((run) => run.text).join('');
    if (typeof value.toString === 'function') return value.toString();
    return '';
};

const bestThumbnail = (value: any): null | string => {
    if (!value) return null;
    if (typeof value === 'string') return value;
    if (typeof value.url === 'string') return value.url;

    const thumbnails =
        value?.thumbnails ||
        value?.thumbnail ||
        value?.sources ||
        value?.images ||
        value?.contents ||
        value;

    if (!Array.isArray(thumbnails) || thumbnails.length === 0) return null;
    const best = thumbnails[thumbnails.length - 1];
    return typeof best === 'string' ? best : best?.url || null;
};

const relatedArtist = (artist: any, fallback = 'Unknown Artist'): RelatedArtist => {
    const name = typeof artist === 'string' ? artist : artist?.name || fallback;
    return {
        id: artist?.channel_id || artist?.id || name,
        imageId: null,
        imageUrl: null,
        name,
        userFavorite: false,
        userRating: null,
    };
};

const emptyGenre = (name = 'YouTube Music'): Genre => ({
    _itemType: LibraryItem.GENRE,
    _serverId: YOUTUBE_MUSIC_SOURCE_ID,
    _serverType: ServerType.YOUTUBE_MUSIC,
    albumCount: null,
    id: `ytm-genre-${name}`,
    imageId: null,
    imageUrl: null,
    name,
    songCount: null,
});

const itemArtists = (item: any): RelatedArtist[] => {
    const artists = item?.artists || item?.authors || (item?.author ? [item.author] : []);
    const normalized = Array.isArray(artists) ? artists.map((artist) => relatedArtist(artist)) : [];
    return normalized.length ? normalized : [relatedArtist(null)];
};

const songFromItem = (item: any): null | Song => {
    const videoId =
        item?.video_id ||
        item?.videoId ||
        item?.endpoint?.payload?.videoId ||
        item?.navigation_endpoint?.payload?.videoId ||
        item?.basic_info?.id ||
        item?.id;
    if (!videoId || !VIDEO_ID_REGEX.test(videoId)) return null;

    const artists = itemArtists(item);
    const name = textValue(item?.title || item?.name || item?.basic_info?.title) || 'Untitled';
    const albumName = item?.album?.name || null;
    const durationSeconds = item?.duration?.seconds || item?.basic_info?.duration || 0;
    const createdAt = nowIso();
    const imageUrl = bestThumbnail(item?.thumbnail || item?.basic_info?.thumbnail);

    return {
        _itemType: LibraryItem.SONG,
        _serverId: YOUTUBE_MUSIC_SOURCE_ID,
        _serverType: ServerType.YOUTUBE_MUSIC,
        album: albumName,
        albumArtistName: artists[0]?.name || 'Unknown Artist',
        albumArtists: artists,
        albumId: item?.album?.id || '',
        artistName: artists.map((artist) => artist.name).join(', '),
        artists,
        bitDepth: null,
        bitRate: 0,
        bpm: null,
        channels: null,
        comment: null,
        compilation: null,
        container: null,
        createdAt,
        discNumber: 0,
        discSubtitle: null,
        duration: durationSeconds * 1000,
        explicitStatus: ExplicitStatus.CLEAN,
        gain: null,
        genres: [emptyGenre()],
        id: `ytm:${videoId}`,
        imageId: null,
        imageUrl,
        lastPlayedAt: null,
        lyrics: null,
        mbzRecordingId: null,
        mbzTrackId: null,
        name,
        participants: null,
        path: null,
        peak: null,
        playCount: 0,
        releaseDate: null,
        releaseYear: null,
        sampleRate: null,
        size: 0,
        sortName: name,
        tags: null,
        trackNumber: 0,
        trackSubtitle: null,
        updatedAt: createdAt,
        userFavorite: false,
        userRating: null,
        youtubeMusic: {
            albumBrowseId: item?.album?.id,
            mediaType: item?.item_type === 'video' ? 'video' : 'song',
            videoId,
            watchUrl: `https://music.youtube.com/watch?v=${videoId}`,
        },
    };
};

const albumFromItem = (item: any): Album | null => {
    const id = item?.id || item?.endpoint?.payload?.browseId;
    if (!id) return null;

    const name = textValue(item?.title || item?.name) || 'Untitled Album';
    const artists = itemArtists(item);
    const createdAt = nowIso();

    return {
        _itemType: LibraryItem.ALBUM,
        _serverId: YOUTUBE_MUSIC_SOURCE_ID,
        _serverType: ServerType.YOUTUBE_MUSIC,
        albumArtistName: artists[0]?.name || 'Unknown Artist',
        albumArtists: artists,
        artists,
        comment: null,
        createdAt,
        duration: null,
        explicitStatus: null,
        genres: [emptyGenre()],
        id: `ytm-album:${id}`,
        imageId: null,
        imageUrl: bestThumbnail(item?.thumbnail),
        isCompilation: null,
        lastPlayedAt: null,
        mbzId: null,
        mbzReleaseGroupId: null,
        name,
        originalDate: null,
        originalYear: Number(item?.year) || 0,
        participants: null,
        playCount: null,
        recordLabels: [],
        releaseDate: null,
        releaseType: null,
        releaseTypes: [],
        releaseYear: Number(item?.year) || null,
        size: null,
        songCount: null,
        sortName: name,
        tags: null,
        updatedAt: createdAt,
        userFavorite: false,
        userRating: null,
        version: null,
    };
};

const artistFromItem = (item: any): AlbumArtist | null => {
    const id = item?.id || item?.endpoint?.payload?.browseId;
    if (!id) return null;
    const name = textValue(item?.title || item?.name) || 'Unknown Artist';
    return {
        _itemType: LibraryItem.ALBUM_ARTIST,
        _serverId: YOUTUBE_MUSIC_SOURCE_ID,
        _serverType: ServerType.YOUTUBE_MUSIC,
        albumCount: null,
        biography: null,
        duration: null,
        genres: [emptyGenre()],
        id: `ytm-artist:${id}`,
        imageId: null,
        imageUrl: bestThumbnail(item?.thumbnail),
        lastPlayedAt: null,
        mbz: null,
        name,
        playCount: null,
        similarArtists: null,
        songCount: null,
        userFavorite: false,
        userRating: null,
    };
};

const playlistFromItem = (item: any): null | Playlist => {
    const id = item?.id || item?.playlist_id || item?.endpoint?.payload?.browseId;
    if (!id) return null;
    const name = textValue(item?.title || item?.name) || 'Untitled Playlist';
    return {
        _itemType: LibraryItem.PLAYLIST,
        _serverId: YOUTUBE_MUSIC_SOURCE_ID,
        _serverType: ServerType.YOUTUBE_MUSIC,
        description: null,
        duration: null,
        genres: [emptyGenre()],
        id: `ytm-playlist:${id}`,
        imageId: null,
        imageUrl: bestThumbnail(item?.thumbnail),
        name,
        owner: item?.author?.name || null,
        ownerId: item?.author?.channel_id || null,
        public: null,
        size: null,
        songCount: null,
        sourceReadOnly: true,
        youtubeMusic: {
            browseId: id,
            playlistId: id,
        },
    };
};

const shelfItems = (shelf: any) => {
    if (Array.isArray(shelf)) return shelf;
    return Array.isArray(shelf?.contents) ? shelf.contents : [];
};

const youtubeMusicHomeSection = (
    id: string,
    title: string,
    itemType: LibraryItem.ALBUM | LibraryItem.PLAYLIST | LibraryItem.SONG,
    items: Array<Album | Playlist | Song>,
): YoutubeMusicHomeResponse['sections'][number] => ({
    id,
    items,
    itemType,
    sourceLabel: YOUTUBE_MUSIC_SOURCE_NAME,
    title,
});

const search = async (query: string): Promise<YoutubeMusicSearchResult> => {
    if (!query.trim()) {
        return { albumArtists: [], albums: [], playlists: [], songs: [] };
    }

    const yt = await getInnertube();
    const [songsResult, albumsResult, artistsResult, playlistsResult] = await Promise.all([
        yt.music.search(query, { type: 'song' }).catch(() => null),
        yt.music.search(query, { type: 'album' }).catch(() => null),
        yt.music.search(query, { type: 'artist' }).catch(() => null),
        yt.music.search(query, { type: 'playlist' }).catch(() => null),
    ]);

    return {
        albumArtists: shelfItems(artistsResult?.artists).map(artistFromItem).filter(Boolean),
        albums: shelfItems(albumsResult?.albums).map(albumFromItem).filter(Boolean),
        playlists: shelfItems(playlistsResult?.playlists).map(playlistFromItem).filter(Boolean),
        songs: shelfItems(songsResult?.songs).map(songFromItem).filter(Boolean),
    };
};

const home = async (): Promise<YoutubeMusicHomeResponse> => {
    const yt = await getInnertube();
    const feed = await yt.music.getHomeFeed();
    const sections = (Array.isArray(feed?.sections) ? feed.sections : [])
        .map((section: any, index: number) => {
            const title = textValue(section?.header?.title) || `Shelf ${index + 1}`;
            const contents = Array.isArray(section?.contents) ? section.contents : [];
            const songs = contents.map(songFromItem).filter(Boolean).slice(0, 12);
            if (songs.length > 0) {
                return youtubeMusicHomeSection(
                    `ytm-home-${index}-songs`,
                    title,
                    LibraryItem.SONG,
                    songs,
                );
            }

            const playlists = contents.map(playlistFromItem).filter(Boolean).slice(0, 12);
            if (playlists.length > 0) {
                return youtubeMusicHomeSection(
                    `ytm-home-${index}-playlists`,
                    title,
                    LibraryItem.PLAYLIST,
                    playlists,
                );
            }

            const albums = contents.map(albumFromItem).filter(Boolean).slice(0, 12);
            if (albums.length > 0) {
                return youtubeMusicHomeSection(
                    `ytm-home-${index}-albums`,
                    title,
                    LibraryItem.ALBUM,
                    albums,
                );
            }

            return null;
        })
        .filter(Boolean)
        .slice(0, 8);

    return { sections };
};

const getPlaylistSongs = async (id: string): Promise<Song[]> => {
    const playlistId = id.replace(/^ytm-playlist:/, '');
    const yt = await getInnertube();
    const playlist = await yt.music.getPlaylist(playlistId);

    return shelfItems(playlist?.contents).map(songFromItem).filter(Boolean).slice(0, 100);
};

const getPlaylistDetail = async (id: string): Promise<Playlist> => {
    const playlistId = id.replace(/^ytm-playlist:/, '');
    const yt = await getInnertube();
    const playlist = await yt.music.getPlaylist(playlistId);
    const songs = shelfItems(playlist?.contents).map(songFromItem).filter(Boolean);
    const parsed = playlistFromItem({
        ...playlist,
        id: playlist?.id || playlistId,
        playlist_id: playlist?.playlist_id || playlistId,
    });

    return {
        _itemType: LibraryItem.PLAYLIST,
        _serverId: YOUTUBE_MUSIC_SOURCE_ID,
        _serverType: ServerType.YOUTUBE_MUSIC,
        description: textValue(playlist?.description) || null,
        duration: null,
        genres: [emptyGenre()],
        id: `ytm-playlist:${playlistId}`,
        imageId: null,
        imageUrl: bestThumbnail(playlist?.thumbnail) || parsed?.imageUrl || null,
        name:
            parsed?.name ||
            textValue(playlist?.title) ||
            textValue(playlist?.header?.title) ||
            'YouTube Music Playlist',
        owner: parsed?.owner || playlist?.author?.name || null,
        ownerId: parsed?.ownerId || playlist?.author?.channel_id || null,
        public: null,
        size: songs.length || parsed?.size || null,
        songCount: songs.length || parsed?.songCount || null,
        sourceReadOnly: true,
        youtubeMusic: {
            browseId: playlistId,
            playlistId,
        },
    };
};

const getAlbumSongs = async (id: string): Promise<Song[]> => {
    const albumId = id.replace(/^ytm-album:/, '');
    const yt = await getInnertube();
    const album = await yt.music.getAlbum(albumId);

    return shelfItems(album?.contents).map(songFromItem).filter(Boolean).slice(0, 100);
};

const getFallbackSongs = async (): Promise<Song[]> => {
    const yt = await getInnertube();
    const feed = await yt.music.getHomeFeed();
    const playlists = (Array.isArray(feed?.sections) ? feed.sections : [])
        .flatMap((section: any) => (Array.isArray(section?.contents) ? section.contents : []))
        .map(playlistFromItem)
        .filter(Boolean)
        .slice(0, 3);

    const results = await Promise.all(
        playlists.map((playlist) => getPlaylistSongs(playlist.id).catch(() => [])),
    );

    return results
        .flat()
        .filter((song, index, songs) => songs.findIndex((item) => item.id === song.id) === index)
        .slice(0, 50);
};

const getSongList = async (): Promise<Song[]> => {
    const homeResponse = await home();
    const songs = homeResponse.sections
        .filter((section) => section.itemType === LibraryItem.SONG)
        .flatMap((section) => section.items as Song[]);

    if (songs.length > 0) return songs;
    return getFallbackSongs();
};

const getStreamUrl = async (id: string): Promise<string> => {
    await startYtProxyServer();
    const videoId = id.startsWith('ytm:') ? id.slice(4) : id;
    return `http://127.0.0.1:${ytProxyPort}/yt-stream/${videoId}`;
};

const getLyrics = async (id: string) => {
    const videoId = id.startsWith('ytm:') ? id.slice(4) : id;
    const yt = await getInnertube();
    const lyrics = await yt.music.getLyrics(videoId);
    return textValue(lyrics?.description) || textValue(lyrics?.contents) || null;
};

// Stream resolver IPC
ipcMain.handle(
    'stream:resolve',
    async (_event, args: { id: string; reason?: 'playback' | 'preload' | 'retry' }) => {
        await startYtProxyServer();
        const videoId = args.id.startsWith('ytm:') ? args.id.slice(4) : args.id;
        const cached = streamCache.get(videoId);

        // If cached and not expired, return the proxy URL (never leak raw googlevideo URLs to renderer)
        if (cached && cached.expiresAt > Date.now() + 30_000) {
            console.log(
                `[StreamResolver] Cache hit for ${videoId} (reason=${args.reason || 'playback'})`,
            );
            return {
                bitrate: undefined,
                codec: undefined,
                expiresAt: cached.expiresAt,
                mimeType: undefined,
                resolvedAt: Date.now(),
                source: 'youtube_music',
                trackId: `youtube_music:${videoId}`,
                url: `http://127.0.0.1:${ytProxyPort}/yt-stream/${videoId}`,
            };
        }

        // Pre-resolve the real stream URL so it's in cache when the proxy serves the request
        try {
            const rawUrl = await resolveStreamUrl(videoId);
            if (!rawUrl) {
                return {
                    error: 'Could not resolve stream URL',
                    resolvedAt: Date.now(),
                    source: 'youtube_music',
                    trackId: `youtube_music:${videoId}`,
                };
            }
            return {
                bitrate: undefined,
                codec: undefined,
                expiresAt: Date.now() + STREAM_CACHE_TTL_MS,
                mimeType: undefined,
                resolvedAt: Date.now(),
                source: 'youtube_music',
                trackId: `youtube_music:${videoId}`,
                url: `http://127.0.0.1:${ytProxyPort}/yt-stream/${videoId}`,
            };
        } catch (error) {
            console.error(`[StreamResolver] Failed to resolve ${videoId}:`, error);
            return {
                error: error instanceof Error ? error.message : 'Stream resolution failed',
                resolvedAt: Date.now(),
                source: 'youtube_music',
                trackId: `youtube_music:${videoId}`,
            };
        }
    },
);

ipcMain.handle('stream:invalidate', (_event, id: string) => {
    const videoId = id.startsWith('ytm:') ? id.slice(4) : id;
    const had = streamCache.has(videoId);
    streamCache.delete(videoId);
    console.log(`[StreamResolver] Invalidated ${videoId} (was cached=${had})`);
    return had;
});

// YouTube Music download IPC
ipcMain.handle(
    'youtube-music:download',
    async (
        _event,
        args: {
            album?: string;
            artist: string;
            sourceTrackId: string;
            title: string;
            videoId: string;
        },
    ) => {
        const { createImportJob } = await import('../local-first');
        return createImportJob(
            `https://music.youtube.com/watch?v=${args.videoId}`,
            false,
            undefined,
            undefined,
            false,
            undefined,
            {
                source: 'youtube_music',
                sourceTrackId: args.sourceTrackId,
                videoId: args.videoId,
            },
        );
    },
);

ipcMain.handle('youtube-music:download-status', async (_event, sourceTrackId: string) => {
    const { getImportJobForSourceTrack } = await import('../local-first');
    return getImportJobForSourceTrack(sourceTrackId);
});

ipcMain.handle('youtube-music-status', () => status());
ipcMain.handle('youtube-music-connect', () => connect());
ipcMain.handle('youtube-music-disconnect', () => disconnect());
ipcMain.handle('youtube-music-search', (_event, query: string) => search(query));
ipcMain.handle('youtube-music-home', () => home());
ipcMain.handle('youtube-music-album-songs', (_event, id: string) => getAlbumSongs(id));
ipcMain.handle('youtube-music-playlist-detail', (_event, id: string) => getPlaylistDetail(id));
ipcMain.handle('youtube-music-playlist-songs', (_event, id: string) => getPlaylistSongs(id));
ipcMain.handle('youtube-music-song-list', () => getSongList());
ipcMain.handle('youtube-music-stream-url', (_event, id: string) => getStreamUrl(id));
ipcMain.handle('youtube-music-lyrics', (_event, id: string) => getLyrics(id));

startYtProxyServer();

export const youtubeMusic = {
    getAlbumSongs,
    getLyrics,
    getPlaylistSongs,
    getSongList,
    getStreamUrl,
    home,
    search,
    status,
};
