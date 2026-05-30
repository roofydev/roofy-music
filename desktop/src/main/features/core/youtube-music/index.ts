import { BG, type BgConfig } from 'bgutils-js';
import { app, BrowserWindow, ipcMain, net, safeStorage, session } from 'electron';
import http from 'http';
import https from 'https';
import { createRequire } from 'module';
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, promises as fsPromises, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'vm';

import { store } from '../settings';

import { getYtDlpCookieArgs } from './yt-dlp-cookies';

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
import { isYoutubeVideoId } from '/@/shared/utils/youtube-video-id';
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
const STREAM_CACHE_SAFETY_MS = 60 * 1000;
const VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_IMAGE_CACHE_MAX_ITEMS = 500;
const YOUTUBE_IMAGE_CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const YOUTUBE_IMAGE_NEGATIVE_CACHE_TTL_MS = 1000 * 60 * 2;
const YOUTUBE_IMAGE_FETCH_MAX_CONCURRENT = 3;
const YOUTUBE_IMAGE_FETCH_START_GAP_MS = 175;
const requireDependency = createRequire(__filename);

type StoredSession = {
    avatarUrl?: null | string;
    connectedAt: string;
    cookie: string;
    displayName: null | string;
};

type StreamCacheEntry = {
    expiresAt: number;
    seekable: boolean;
    source: 'direct' | 'yt-dlp' | 'yt-dlp-file';
    url: string;
};

type SeekableFileCacheEntry = {
    expiresAt: number;
    inflight?: Promise<string>;
    path: string;
};

type YoutubeAccountIdentity = {
    avatarUrl: null | string;
    displayName: null | string;
};

type YoutubeImageCacheEntry = {
    body: Buffer;
    contentType: string;
    expiresAt: number;
    statusCode: number;
};

const isGoogleVideoUrl = (url: string) => {
    try {
        return new URL(url).hostname.endsWith('.googlevideo.com');
    } catch {
        return false;
    }
};

const rangeHeaderValue = (range: string | string[] | undefined) =>
    Array.isArray(range) ? range[0] : range;

const parseRangeHeader = (rangeHeader: string | undefined) => {
    const match = rangeHeader?.match(/^bytes=(\d+)-(\d*)$/);
    if (!match) return null;

    return {
        end: match[2],
        start: Number(match[1]),
    };
};

const isRangeFromStart = (rangeHeader: string | undefined) =>
    parseRangeHeader(rangeHeader)?.start === 0;

const applyGoogleVideoRangeParam = (url: string, rangeHeader: string | undefined) => {
    if (!rangeHeader) return url;

    const range = parseRangeHeader(rangeHeader);
    if (!range) return url;

    try {
        const parsed = new URL(url);
        if (!parsed.hostname.endsWith('.googlevideo.com') || !parsed.searchParams.has('range')) {
            return url;
        }

        const requestedRange = `${range.start}-${range.end || ''}`;
        if (parsed.searchParams.get('range') !== requestedRange) {
            parsed.searchParams.set('range', requestedRange);
        }

        return parsed.href;
    } catch {
        return url;
    }
};

const youtubeClientParam = (url: string) => {
    try {
        return new URL(url).searchParams.get('c') || null;
    } catch {
        return null;
    }
};

const streamUrlExpiresAt = (url: string) => {
    try {
        const expire = Number(new URL(url).searchParams.get('expire') || 0);
        if (!expire) return Date.now() + STREAM_CACHE_TTL_MS;
        return Math.max(Date.now() + 30_000, expire * 1000 - STREAM_CACHE_SAFETY_MS);
    } catch {
        return Date.now() + STREAM_CACHE_TTL_MS;
    }
};

const cacheStreamUrl = (
    videoId: string,
    url: string,
    source: StreamCacheEntry['source'],
    seekable = true,
) => {
    streamCache.set(videoId, {
        expiresAt: streamUrlExpiresAt(url),
        seekable,
        source,
        url,
    });
};

const cacheVideoStreamUrl = (
    videoId: string,
    url: string,
    source: StreamCacheEntry['source'],
    seekable = true,
) => {
    videoStreamCache.set(videoId, {
        expiresAt: streamUrlExpiresAt(url),
        seekable,
        source,
        url,
    });
};

const seekableFileCache = new Map<string, SeekableFileCacheEntry>();

const getSeekableCacheDir = () => path.join(app.getPath('temp') || tmpdir(), 'roofy-yt-seekable');

const probeStreamSeekable = async (url: string, timeoutMs = 2500): Promise<boolean> =>
    new Promise((resolve) => {
        let settled = false;
        const finish = (ok: boolean) => {
            if (settled) return;
            settled = true;
            resolve(ok);
        };

        let parsed: URL;
        try {
            parsed = new URL(url);
        } catch {
            finish(false);
            return;
        }

        const clientUserAgent = userAgentForYoutubeClient(youtubeClientParam(url));
        const hasSignedRange =
            parsed.hostname.endsWith('.googlevideo.com') && parsed.searchParams.has('range');
        const probeRange = 'bytes=65536-66535';
        const requestUrl = applyGoogleVideoRangeParam(url, probeRange);

        const req = https.request(
            requestUrl,
            {
                headers: {
                    Accept: '*/*',
                    'Accept-Encoding': 'identity',
                    Origin: SOURCE_URL,
                    ...(hasSignedRange || new URL(requestUrl).searchParams.has('range')
                        ? {}
                        : { Range: probeRange }),
                    Referer: `${SOURCE_URL}/`,
                    ...(clientUserAgent ? { 'User-Agent': clientUserAgent } : {}),
                },
                method: 'GET',
            },
            (res) => {
                const status = res.statusCode || 0;
                res.resume();
                finish(status === 206);
            },
        );

        req.setTimeout(timeoutMs, () => {
            req.destroy();
            finish(false);
        });

        req.on('error', () => finish(false));
        req.end();
    });

const serveLocalFileWithRange = (
    filePath: string,
    req: http.IncomingMessage,
    res: http.ServerResponse,
) => {
    const stat = statSync(filePath);
    const fileSize = stat.size;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', '*');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', 'audio/mp4');
    res.setHeader('X-Roofy-Stream-Seekable', '1');

    if (req.method === 'HEAD') {
        res.setHeader('Content-Length', fileSize);
        res.statusCode = 200;
        res.end();
        return;
    }

    const rangeHeader = rangeHeaderValue(req.headers.range);
    if (!rangeHeader) {
        res.setHeader('Content-Length', fileSize);
        res.statusCode = 200;
        createReadStream(filePath).pipe(res);
        return;
    }

    const range = parseRangeHeader(rangeHeader);
    if (!range) {
        res.statusCode = 416;
        res.end();
        return;
    }

    const start = range.start;
    const end = range.end ? Number(range.end) : fileSize - 1;
    if (start >= fileSize || end >= fileSize) {
        res.statusCode = 416;
        res.end();
        return;
    }

    const chunkSize = end - start + 1;
    res.statusCode = 206;
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Content-Length', chunkSize);
    createReadStream(filePath, { start, end }).pipe(res);
};

const downloadAudioToTempFile = (videoId: string): Promise<string> => {
    const existing = seekableFileCache.get(videoId);
    if (existing?.path && existsSync(existing.path) && existing.expiresAt > Date.now()) {
        return Promise.resolve(existing.path);
    }
    if (existing?.inflight) {
        return existing.inflight;
    }

    const inflight = new Promise<string>((resolve, reject) => {
        const dir = getSeekableCacheDir();
        const filePath = path.join(dir, `${videoId}.m4a`);

        void fsPromises.mkdir(dir, { recursive: true }).then(() => {
            if (existsSync(filePath)) {
                resolve(filePath);
                return;
            }

            const ytDlpPath = getYtDlpPath();
            const stored = getStoredSession();
            const args = [
                '--no-check-certificates',
                '--no-warnings',
                '--quiet',
                '--no-playlist',
                '-f',
                'bestaudio/best',
                '-o',
                filePath,
                ...getYtDlpCookieArgs(stored?.cookie),
                `https://music.youtube.com/watch?v=${videoId}`,
            ];

            const child = spawn(ytDlpPath, args, { windowsHide: true });
            let stderr = '';

            child.stderr.on('data', (data: Buffer) => {
                stderr += data.toString();
            });

            child.on('close', (code) => {
                if (code === 0 && existsSync(filePath)) {
                    resolve(filePath);
                    return;
                }
                reject(new Error(stderr || `yt-dlp exited with code ${code ?? 'unknown'}`));
            });

            child.on('error', reject);
        });
    });

    inflight
        .then((filePath) => {
            seekableFileCache.set(videoId, {
                expiresAt: Date.now() + STREAM_CACHE_TTL_MS,
                path: filePath,
            });
            cacheStreamUrl(videoId, `file://${filePath}`, 'yt-dlp-file', true);
        })
        .catch(() => {
            seekableFileCache.delete(videoId);
        });

    seekableFileCache.set(videoId, {
        expiresAt: Date.now() + STREAM_CACHE_TTL_MS,
        inflight,
        path: '',
    });

    return inflight;
};

const serveSeekableYtDlpBuffer = async (
    videoId: string,
    req: http.IncomingMessage,
    res: http.ServerResponse,
) => {
    try {
        const filePath = await downloadAudioToTempFile(videoId);
        console.log(`[YT Stream Proxy] Serving seekable buffered file for ${videoId}`);
        serveLocalFileWithRange(filePath, req, res);
    } catch (error) {
        console.error(`[YT Stream Proxy] Seekable buffer failed for ${videoId}:`, error);
        if (!res.headersSent) {
            res.statusCode = 502;
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end();
        }
    }
};

const probeStreamUrl = async (url: string, timeoutMs = 2500): Promise<boolean> =>
    new Promise((resolve) => {
        let settled = false;
        const finish = (ok: boolean) => {
            if (settled) return;
            settled = true;
            resolve(ok);
        };

        let parsed: URL;
        try {
            parsed = new URL(url);
        } catch {
            finish(false);
            return;
        }

        const clientUserAgent = userAgentForYoutubeClient(youtubeClientParam(url));
        const hasSignedRange =
            parsed.hostname.endsWith('.googlevideo.com') && parsed.searchParams.has('range');
        const req = https.request(
            parsed,
            {
                headers: {
                    Accept: '*/*',
                    'Accept-Encoding': 'identity',
                    Origin: SOURCE_URL,
                    ...(hasSignedRange ? {} : { Range: 'bytes=0-1' }),
                    Referer: `${SOURCE_URL}/`,
                    ...(clientUserAgent ? { 'User-Agent': clientUserAgent } : {}),
                },
                method: 'GET',
            },
            (res) => {
                const status = res.statusCode || 0;
                res.resume();
                finish((status >= 200 && status < 300) || status === 206);
            },
        );

        req.setTimeout(timeoutMs, () => {
            req.destroy();
            finish(false);
        });
        req.on('error', () => finish(false));
        req.end();
    });

const userAgentForYoutubeClient = (client: null | string) => {
    switch (client) {
        case 'ANDROID':
        case 'ANDROID_MUSIC':
            return 'com.google.android.youtube/21.03.36(Linux; U; Android 16; en_US; SM-S908E Build/TP1A.220624.014) gzip';
        case 'IOS':
        case 'iOS':
            return 'com.google.ios.youtube/20.11.6 (iPhone10,4; U; CPU iOS 16_7_7 like Mac OS X)';
        case 'TVHTML5':
            return 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version';
        default:
            return null;
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

const isVideoFormat = (format: any) => {
    const mimeType = String(format?.mime_type || format?.mimeType || '');
    return format?.has_video !== false && !format?.has_audio && mimeType.includes('video');
};

const chooseVideoFormat = (formats: any[] | undefined) => {
    const videoFormats = (formats || []).filter(isVideoFormat);
    return videoFormats.sort((a, b) => {
        const aMime = String(a?.mime_type || a?.mimeType || '');
        const bMime = String(b?.mime_type || b?.mimeType || '');
        const aMp4Score = aMime.includes('video/mp4') ? 100_000 : 0;
        const bMp4Score = bMime.includes('video/mp4') ? 100_000 : 0;
        const aAvcScore = aMime.includes('avc1') ? 10_000 : 0;
        const bAvcScore = bMime.includes('avc1') ? 10_000 : 0;
        const aHeight = Number(a?.height || 0);
        const bHeight = Number(b?.height || 0);
        const aFps = Number(a?.fps || 0);
        const bFps = Number(b?.fps || 0);
        const aBitrate = Number(a?.bitrate || a?.average_bitrate || 0);
        const bBitrate = Number(b?.bitrate || b?.average_bitrate || 0);

        return (
            bMp4Score +
            bAvcScore +
            bHeight * 100 +
            bFps * 10 +
            bBitrate / 1000 -
            (aMp4Score + aAvcScore + aHeight * 100 + aFps * 10 + aBitrate / 1000)
        );
    })[0];
};

const decipherFormatUrl = async (format: any, player: any): Promise<null | string> => {
    if (!format) return null;
    return format.url || (format.decipher ? await format.decipher(player) : null);
};

let innertubeInstance: any | null = null;
let innertubeCookie: null | string = null;
let youtubeRuntimeInstalled = false;
const streamCache = new Map<string, StreamCacheEntry>();
const videoStreamCache = new Map<string, StreamCacheEntry>();
let ytProxyPort: null | number = null;
let ytProxyReadyPromise: null | Promise<void> = null;
let accountIdentityRefreshPromise: null | Promise<null | StoredSession> = null;
const recentInvalidations = new Map<string, number>();
const INVALIDATION_COOLDOWN_MS = 10000;
let contentPoTokenGenerationAvailable = true;
const youtubeImageCache = new Map<string, YoutubeImageCacheEntry>();
let activeYoutubeImageFetches = 0;
let lastYoutubeImageFetchStart = 0;
let youtubeImageFetchTimer: null | ReturnType<typeof setTimeout> = null;
const youtubeImageFetchQueue: Array<() => void> = [];

const isAllowedYoutubeImageUrl = (url: string) => {
    try {
        const host = new URL(url).hostname;
        return [
            'i.ytimg.com',
            'lh3.googleusercontent.com',
            'www.gstatic.com',
            'yt3.ggpht.com',
            'yt3.googleusercontent.com',
        ].includes(host);
    } catch {
        return false;
    }
};

const encodeProxyUrl = (url: string) => Buffer.from(url, 'utf8').toString('base64url');
const decodeProxyUrl = (value: string) => Buffer.from(value, 'base64url').toString('utf8');

const youtubeImageProxyUrl = (url: null | string) => {
    if (!url || !ytProxyPort || !isAllowedYoutubeImageUrl(url)) return url;
    return `http://127.0.0.1:${ytProxyPort}/yt-image/${encodeProxyUrl(url)}`;
};

const rememberYoutubeImage = (url: string, entry: YoutubeImageCacheEntry) => {
    youtubeImageCache.set(url, entry);
    while (youtubeImageCache.size > YOUTUBE_IMAGE_CACHE_MAX_ITEMS) {
        const oldestKey = youtubeImageCache.keys().next().value;
        if (!oldestKey) break;
        youtubeImageCache.delete(oldestKey);
    }
};

const pumpYoutubeImageFetchQueue = () => {
    if (youtubeImageFetchTimer) {
        clearTimeout(youtubeImageFetchTimer);
        youtubeImageFetchTimer = null;
    }

    if (
        activeYoutubeImageFetches >= YOUTUBE_IMAGE_FETCH_MAX_CONCURRENT ||
        youtubeImageFetchQueue.length === 0
    ) {
        return;
    }

    const elapsedSinceLastStart = Date.now() - lastYoutubeImageFetchStart;
    const waitMs = Math.max(0, YOUTUBE_IMAGE_FETCH_START_GAP_MS - elapsedSinceLastStart);

    if (waitMs > 0) {
        youtubeImageFetchTimer = setTimeout(pumpYoutubeImageFetchQueue, waitMs);
        return;
    }

    const job = youtubeImageFetchQueue.shift();
    if (!job) return;

    activeYoutubeImageFetches += 1;
    lastYoutubeImageFetchStart = Date.now();
    job();
};

const enqueueYoutubeImageFetch = <T>(run: () => Promise<T>) =>
    new Promise<T>((resolve, reject) => {
        youtubeImageFetchQueue.push(() => {
            run()
                .then(resolve, reject)
                .finally(() => {
                    activeYoutubeImageFetches -= 1;
                    pumpYoutubeImageFetchQueue();
                });
        });
        pumpYoutubeImageFetchQueue();
    });

const fetchYoutubeImageFromNetwork = (
    url: string,
    redirectCount = 0,
): Promise<YoutubeImageCacheEntry> =>
    new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const client = parsed.protocol === 'http:' ? http : https;
        const req = client.request(
            parsed,
            {
                headers: {
                    Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                    Referer: `${SOURCE_URL}/`,
                    'User-Agent':
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
                },
                method: 'GET',
            },
            (response) => {
                const status = response.statusCode || 0;
                if (status >= 300 && status < 400 && response.headers.location) {
                    response.resume();
                    if (redirectCount >= 3) {
                        reject(new Error('YouTube image redirect limit exceeded'));
                        return;
                    }
                    const redirectUrl = new URL(response.headers.location, url).href;
                    fetchYoutubeImageFromNetwork(redirectUrl, redirectCount + 1).then(
                        resolve,
                        reject,
                    );
                    return;
                }

                if (status < 200 || status >= 300) {
                    response.resume();
                    const entry = {
                        body: Buffer.alloc(0),
                        contentType: String(response.headers['content-type'] || 'text/plain'),
                        expiresAt: Date.now() + YOUTUBE_IMAGE_NEGATIVE_CACHE_TTL_MS,
                        statusCode: status,
                    };
                    rememberYoutubeImage(url, entry);
                    resolve(entry);
                    return;
                }

                const chunks: Buffer[] = [];
                response.on('data', (chunk: Buffer) => chunks.push(chunk));
                response.on('end', () => {
                    const entry = {
                        body: Buffer.concat(chunks),
                        contentType: String(response.headers['content-type'] || 'image/jpeg'),
                        expiresAt: Date.now() + YOUTUBE_IMAGE_CACHE_TTL_MS,
                        statusCode: status,
                    };
                    rememberYoutubeImage(url, entry);
                    resolve(entry);
                });
            },
        );

        req.setTimeout(5000, () => {
            req.destroy(new Error('YouTube image request timed out'));
        });
        req.on('error', reject);
        req.end();
    });

const fetchYoutubeImage = (url: string): Promise<YoutubeImageCacheEntry> => {
    const cached = youtubeImageCache.get(url);
    if (cached && cached.expiresAt > Date.now()) {
        return Promise.resolve(cached);
    }

    return enqueueYoutubeImageFetch(async () => {
        const entry = await fetchYoutubeImageFromNetwork(url);
        rememberYoutubeImage(url, entry);
        return entry;
    });
};

const startYtProxyServer = () => {
    if (ytProxyReadyPromise) return ytProxyReadyPromise;

    ytProxyReadyPromise = new Promise((resolve) => {
        const server = http.createServer(async (req, res) => {
            const imageMatch = req.url?.match(/^\/yt-image\/([A-Za-z0-9_-]+)$/);
            if (imageMatch) {
                if (req.method !== 'GET' && req.method !== 'HEAD') {
                    res.statusCode = 405;
                    res.end();
                    return;
                }

                let imageUrl = '';
                try {
                    imageUrl = decodeProxyUrl(imageMatch[1]);
                } catch {
                    res.statusCode = 400;
                    res.end();
                    return;
                }

                if (!isAllowedYoutubeImageUrl(imageUrl)) {
                    res.statusCode = 403;
                    res.end();
                    return;
                }

                try {
                    const image = await fetchYoutubeImage(imageUrl);
                    res.statusCode = image.statusCode;
                    res.setHeader('Access-Control-Allow-Origin', '*');
                    res.setHeader(
                        'Cache-Control',
                        image.statusCode >= 200 && image.statusCode < 300
                            ? 'public, max-age=86400'
                            : 'public, max-age=120',
                    );
                    res.setHeader('Content-Type', image.contentType);
                    res.setHeader('Content-Length', image.body.length);
                    if (req.method === 'HEAD') {
                        res.end();
                        return;
                    }
                    res.end(image.body);
                } catch (error) {
                    console.warn('[YouTube Music] Failed to proxy image:', error);
                    res.statusCode = 502;
                    res.end();
                }
                return;
            }

            const match = req.url?.match(/^\/yt-(stream|video-stream)\/([A-Za-z0-9_-]{11})$/);
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

            const isVideoProxy = match[1] === 'video-stream';
            const videoId = match[2];
            if (!isYoutubeVideoId(videoId)) {
                res.statusCode = 400;
                res.end();
                return;
            }

            let streamUrl: null | string = null;

            try {
                streamUrl = isVideoProxy
                    ? await resolveVideoStreamUrl(videoId)
                    : await resolveStreamUrl(videoId);
            } catch (error) {
                console.error('Failed to resolve YouTube stream URL:', error);
            }

            if (!streamUrl) {
                try {
                    streamUrl = isVideoProxy
                        ? await resolveVideoStreamUrlWithYtdlp(videoId)
                        : await resolveStreamUrlWithYtdlp(videoId);
                } catch (fallbackError) {
                    console.error('yt-dlp stream fallback failed:', fallbackError);
                }
            }

            if (!streamUrl) {
                res.statusCode = 502;
                res.end();
                return;
            }

            const headers: Record<string, string> = {
                Accept: '*/*',
                'Accept-Encoding': 'identity',
                'Accept-Language': 'en-US,en;q=0.9',
                Origin: SOURCE_URL,
                Referer: `${SOURCE_URL}/`,
                'User-Agent':
                    req.headers['user-agent'] ||
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
            };
            const requestedRange = rangeHeaderValue(req.headers.range);
            if (requestedRange) {
                headers['Range'] = requestedRange;
            }

            const stored = getStoredSession();
            if (stored?.cookie && !isGoogleVideoUrl(streamUrl)) {
                headers['Cookie'] = stored.cookie;
            }

            console.log(`[YT Stream Proxy] Proxying ${videoId} -> ${new URL(streamUrl).hostname}`);

            const forwardProxy = (
                url: string,
                attempt = 1,
                triedYtdlpUrl = false,
                dropRange = false,
                rejectedClientsForRequest = new Set<string>(),
            ) => {
                const requestUrl = applyGoogleVideoRangeParam(url, headers.Range);
                const requestHeaders = { ...headers };

                // googlevideo signed URLs can encode byte ranges in the query string.
                // Sending both the signed range param and a Range header can make the CDN reject
                // otherwise valid stream URLs.
                if (
                    dropRange ||
                    (isGoogleVideoUrl(requestUrl) && new URL(requestUrl).searchParams.has('range'))
                ) {
                    delete requestHeaders.Range;
                }

                const clientUserAgent = userAgentForYoutubeClient(youtubeClientParam(requestUrl));
                if (clientUserAgent) {
                    requestHeaders['User-Agent'] = clientUserAgent;
                }

                const requestOptions: https.RequestOptions = {
                    headers: requestHeaders,
                    method: req.method,
                };

                const proxyReq = https.request(requestUrl, requestOptions, async (proxyRes) => {
                    const status = proxyRes.statusCode || 0;

                    // Follow redirects ourselves so the browser doesn't leak cross-origin
                    if (
                        status >= 300 &&
                        status < 400 &&
                        proxyRes.headers.location &&
                        attempt <= 3
                    ) {
                        const redirectUrl = new URL(proxyRes.headers.location, requestUrl).href;
                        console.log(
                            `[YT Stream Proxy] Following ${status} redirect for ${videoId}`,
                        );
                        forwardProxy(redirectUrl, attempt + 1, triedYtdlpUrl, dropRange);
                        return;
                    }

                    if (
                        status === 403 &&
                        !dropRange &&
                        requestHeaders.Range &&
                        isGoogleVideoUrl(requestUrl) &&
                        !res.headersSent
                    ) {
                        proxyRes.resume();
                        console.warn(
                            `[YT Stream Proxy] CDN 403 for ${videoId} with Range=${requestHeaders.Range}; retrying without Range before resolver fallback...`,
                        );
                        forwardProxy(url, attempt, triedYtdlpUrl, true, rejectedClientsForRequest);
                        return;
                    }

                    // Only invalidate cache once per cooldown to prevent resolve storms
                    if (status === 403) {
                        const now = Date.now();
                        const lastInvalidation = recentInvalidations.get(videoId) || 0;
                        const rejectedClient = youtubeClientParam(requestUrl);
                        const shouldTryFreshClient =
                            attempt <= 6 &&
                            Boolean(rejectedClient) &&
                            !rejectedClientsForRequest.has(rejectedClient || '');
                        const shouldInvalidate =
                            shouldTryFreshClient ||
                            now - lastInvalidation > INVALIDATION_COOLDOWN_MS;

                        if (shouldInvalidate) {
                            const rejectedClients = new Set(rejectedClientsForRequest);
                            if (rejectedClient) rejectedClients.add(rejectedClient);
                            console.warn(
                                `[YT Stream Proxy] CDN 403 for ${videoId} (client=${rejectedClient || 'unknown'}), trying another direct client before yt-dlp...`,
                            );
                            recentInvalidations.set(videoId, now);
                            if (isVideoProxy) {
                                videoStreamCache.delete(videoId);
                            } else {
                                streamCache.delete(videoId);
                            }
                            try {
                                const freshUrl = isVideoProxy
                                    ? await resolveVideoStreamUrl(
                                          videoId,
                                          new Set([requestUrl, url]),
                                          rejectedClients,
                                      )
                                    : await resolveStreamUrl(
                                          videoId,
                                          new Set([requestUrl, url]),
                                          rejectedClients,
                                      );
                                if (freshUrl) {
                                    console.log(
                                        `[YT Stream Proxy] Fresh URL resolved, retrying ${videoId}`,
                                    );
                                    forwardProxy(
                                        freshUrl,
                                        attempt + 1,
                                        triedYtdlpUrl,
                                        dropRange,
                                        rejectedClients,
                                    );
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
                                `(Cookie=${Boolean(headers.Cookie)}, Range=${headers.Range || 'none'})`,
                        );

                        if (status === 403 && req.method === 'GET' && !res.headersSent) {
                            proxyRes.resume();

                            if (!triedYtdlpUrl) {
                                try {
                                    const ytdlpUrl = isVideoProxy
                                        ? await resolveVideoStreamUrlWithYtdlp(videoId)
                                        : await resolveStreamUrlWithYtdlp(videoId);
                                    if (ytdlpUrl && ytdlpUrl !== url && ytdlpUrl !== requestUrl) {
                                        console.warn(
                                            `[YT Stream Proxy] Falling back to yt-dlp direct URL for ${videoId}`,
                                        );
                                        if (isVideoProxy) {
                                            cacheVideoStreamUrl(videoId, ytdlpUrl, 'yt-dlp');
                                        } else {
                                            cacheStreamUrl(videoId, ytdlpUrl, 'yt-dlp');
                                        }
                                        forwardProxy(ytdlpUrl, attempt + 1, true);
                                        return;
                                    }
                                } catch (fallbackError) {
                                    console.warn(
                                        `[YT Stream Proxy] yt-dlp direct URL fallback failed for ${videoId}:`,
                                        fallbackError,
                                    );
                                }
                            }

                            if (headers.Range && !isRangeFromStart(headers.Range)) {
                                res.statusCode = 502;
                                res.setHeader('Access-Control-Allow-Origin', '*');
                                res.setHeader('Access-Control-Expose-Headers', '*');
                                res.end();
                                return;
                            }

                            console.warn(
                                `[YT Stream Proxy] Falling back to seekable yt-dlp buffer for ${videoId}`,
                            );
                            if (isVideoProxy) {
                                pipeVideoStreamWithYtdlp(videoId, res);
                            } else {
                                void serveSeekableYtDlpBuffer(videoId, req, res);
                            }
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
                    const cachedEntry = isVideoProxy
                        ? videoStreamCache.get(videoId)
                        : streamCache.get(videoId);
                    res.setHeader(
                        'X-Roofy-Stream-Seekable',
                        cachedEntry?.seekable === false ? '0' : '1',
                    );

                    if (req.method === 'HEAD') {
                        res.end();
                        return;
                    }

                    // Ensure partial content streams are piped without buffering or transformation
                    proxyRes.pipe(res, { end: true });
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
    const args = [
        '--no-check-certificates',
        '--no-warnings',
        '-f',
        'bestaudio/best',
        '--get-url',
        ...getYtDlpCookieArgs(stored?.cookie),
    ];

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

const resolveVideoStreamUrlWithYtdlp = async (videoId: string): Promise<null | string> => {
    const ytDlpPath = getYtDlpPath();
    const stored = getStoredSession();
    const args = [
        '--no-check-certificates',
        '--no-warnings',
        '-f',
        'bestvideo[ext=mp4][vcodec^=avc1]/best[ext=mp4]/bestvideo[ext=mp4]/bestvideo',
        '--get-url',
        ...getYtDlpCookieArgs(stored?.cookie),
    ];

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
        'bestaudio/best',
        '-o',
        '-',
        ...getYtDlpCookieArgs(stored?.cookie),
    ];

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

const pipeVideoStreamWithYtdlp = (videoId: string, res: http.ServerResponse) => {
    const ytDlpPath = getYtDlpPath();
    const stored = getStoredSession();
    const args = [
        '--no-check-certificates',
        '--no-warnings',
        '--quiet',
        '--no-playlist',
        '-f',
        'bestvideo[ext=mp4][vcodec^=avc1]/best[ext=mp4]/bestvideo[ext=mp4]/bestvideo',
        '-o',
        '-',
        ...getYtDlpCookieArgs(stored?.cookie),
    ];

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
            res.setHeader('Content-Type', 'video/mp4');
        }
        res.write(chunk);
    });

    child.on('close', (code) => {
        if (!started && !res.headersSent) {
            res.statusCode = code === 0 ? 204 : 502;
            res.setHeader('Access-Control-Allow-Origin', '*');
            if (code !== 0) {
                console.error(`[YT Stream Proxy] yt-dlp video pipe failed for ${videoId}:`, stderr);
            }
        }
        res.end();
    });

    child.on('error', (error) => {
        console.error(`[YT Stream Proxy] yt-dlp video pipe error for ${videoId}:`, error);
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
    rejectedClients = new Set<string>(),
): Promise<null | string> => {
    const cached = streamCache.get(videoId);
    if (cached && cached.expiresAt > Date.now() && !rejectedUrls.has(cached.url)) {
        return cached.url;
    }

    const yt = await getInnertube().catch((error) => {
        console.warn('[YT Stream] Innertube unavailable, using yt-dlp fallback:', error);
        return null;
    });
    let contentPoToken: null | string | undefined;
    const getContentPoToken = async () => {
        if (contentPoToken !== undefined) return contentPoToken;
        contentPoToken = await generatePoToken(videoId);
        return contentPoToken;
    };
    const acceptResolvedUrl = async (
        url: null | string,
        label: string,
        source: StreamCacheEntry['source'] = 'direct',
    ) => {
        if (!url) return null;
        if (rejectedUrls.has(url)) {
            console.warn(`[YT Stream] ${label} returned a rejected URL for ${videoId}`);
            return null;
        }

        const isUsable = await probeStreamUrl(url).catch(() => false);
        if (!isUsable) {
            console.warn(`[YT Stream] ${label} URL failed preflight for ${videoId}`);
            rejectedUrls.add(url);
            return null;
        }

        const seekable = await probeStreamSeekable(url).catch(() => false);
        if (!seekable) {
            console.warn(`[YT Stream] ${label} URL is not mid-range seekable for ${videoId}`);
        }

        console.log(
            `[YT Stream] Resolved via ${label} for ${videoId} (seekable=${seekable})`,
        );
        cacheStreamUrl(videoId, url, source, seekable);
        return url;
    };

    if (yt && !rejectedClients.has('TVHTML5_SIMPLY_EMBEDDED_PLAYER')) {
        try {
            const info = await yt.getBasicInfo(videoId, { client: 'TV_EMBEDDED' });
            const format = chooseAudioFormat(info.streaming_data?.adaptive_formats);
            const url = await decipherFormatUrl(format, yt.session.player);
            const usableUrl = await acceptResolvedUrl(url, 'TV_EMBEDDED');
            if (usableUrl) return usableUrl;
        } catch (error) {
            console.warn(`[YT Stream] TV_EMBEDDED failed for ${videoId}:`, error);
        }
    } else {
        console.warn(`[YT Stream] Skipping rejected TV_EMBEDDED client for ${videoId}`);
    }

    // Method 2: WEB_REMIX with auth
    if (yt && !rejectedClients.has('WEB_REMIX')) {
        try {
            const poToken = await getContentPoToken();
            const info = await yt.music.getInfo(
                videoId,
                poToken ? { po_token: poToken } : undefined,
            );
            const format = info.chooseFormat
                ? info.chooseFormat({ quality: 'best', type: 'audio' })
                : chooseAudioFormat(info.streaming_data?.adaptive_formats);
            const url = await decipherFormatUrl(format, yt.session.player);
            const usableUrl = await acceptResolvedUrl(url, 'WEB_REMIX');
            if (usableUrl) return usableUrl;
        } catch (error) {
            console.warn(`[YT Stream] WEB_REMIX failed for ${videoId}:`, error);
        }
    } else {
        console.warn(`[YT Stream] Skipping rejected WEB_REMIX client for ${videoId}`);
    }

    // Method 3: WEB client with auth
    if (yt && !rejectedClients.has('WEB')) {
        try {
            const poToken = await getContentPoToken();
            const info = await yt.getBasicInfo(
                videoId,
                poToken ? { po_token: poToken } : undefined,
            );
            const format = chooseAudioFormat(info.streaming_data?.adaptive_formats);
            const url = await decipherFormatUrl(format, yt.session.player);
            const usableUrl = await acceptResolvedUrl(url, 'WEB');
            if (usableUrl) return usableUrl;
        } catch (error) {
            console.warn(`[YT Stream] WEB failed for ${videoId}:`, error);
        }
    } else {
        console.warn(`[YT Stream] Skipping rejected WEB client for ${videoId}`);
    }

    // Method 4: iOS native client
    if (yt && !rejectedClients.has('IOS') && !rejectedClients.has('iOS')) {
        try {
            const info = await yt.getBasicInfo(videoId, { client: 'IOS' });
            const format = chooseAudioFormat(info.streaming_data?.adaptive_formats);
            const url = await decipherFormatUrl(format, yt.session.player);
            const usableUrl = await acceptResolvedUrl(url, 'IOS');
            if (usableUrl) return usableUrl;
        } catch (error) {
            console.warn(`[YT Stream] IOS failed for ${videoId}:`, error);
        }
    } else {
        console.warn(`[YT Stream] Skipping rejected IOS client for ${videoId}`);
    }

    // Method 5: Android Music native client
    if (yt && !rejectedClients.has('ANDROID_MUSIC')) {
        try {
            const info = await yt.getBasicInfo(videoId, { client: 'YTMUSIC_ANDROID' });
            const format = chooseAudioFormat(info.streaming_data?.adaptive_formats);
            const url = await decipherFormatUrl(format, yt.session.player);
            const usableUrl = await acceptResolvedUrl(url, 'YTMUSIC_ANDROID');
            if (usableUrl) return usableUrl;
        } catch (error) {
            console.warn(`[YT Stream] YTMUSIC_ANDROID failed for ${videoId}:`, error);
        }
    } else {
        console.warn(`[YT Stream] Skipping rejected YTMUSIC_ANDROID client for ${videoId}`);
    }

    // Method 6: Android native client
    if (yt && !rejectedClients.has('ANDROID')) {
        try {
            const info = await yt.getBasicInfo(videoId, { client: 'ANDROID' });
            const format = chooseAudioFormat(info.streaming_data?.adaptive_formats);
            const url = await decipherFormatUrl(format, yt.session.player);
            const usableUrl = await acceptResolvedUrl(url, 'ANDROID');
            if (usableUrl) return usableUrl;
        } catch (error) {
            console.warn(`[YT Stream] ANDROID failed for ${videoId}:`, error);
        }
    } else {
        console.warn(`[YT Stream] Skipping rejected ANDROID client for ${videoId}`);
    }

    // Method 7: yt-dlp fallback
    try {
        const url = await resolveStreamUrlWithYtdlp(videoId);
        const usableUrl = await acceptResolvedUrl(url, 'yt-dlp', 'yt-dlp');
        if (usableUrl) return usableUrl;
    } catch (error) {
        console.warn(`[YT Stream] yt-dlp failed for ${videoId}:`, error);
    }

    return null;
};

const resolveVideoStreamUrl = async (
    videoId: string,
    rejectedUrls = new Set<string>(),
    rejectedClients = new Set<string>(),
): Promise<null | string> => {
    const cached = videoStreamCache.get(videoId);
    if (cached && cached.expiresAt > Date.now() && !rejectedUrls.has(cached.url)) {
        return cached.url;
    }

    const yt = await getInnertube().catch((error) => {
        console.warn('[YT Video Stream] Innertube unavailable, using yt-dlp fallback:', error);
        return null;
    });
    let contentPoToken: null | string | undefined;
    const getContentPoToken = async () => {
        if (contentPoToken !== undefined) return contentPoToken;
        contentPoToken = await generatePoToken(videoId);
        return contentPoToken;
    };
    const acceptResolvedUrl = async (
        url: null | string,
        label: string,
        source: StreamCacheEntry['source'] = 'direct',
    ) => {
        if (!url) return null;
        if (rejectedUrls.has(url)) {
            console.warn(`[YT Video Stream] ${label} returned a rejected URL for ${videoId}`);
            return null;
        }

        const isUsable = await probeStreamUrl(url).catch(() => false);
        if (!isUsable) {
            console.warn(`[YT Video Stream] ${label} URL failed preflight for ${videoId}`);
            rejectedUrls.add(url);
            return null;
        }

        const seekable = await probeStreamSeekable(url).catch(() => false);
        if (!seekable) {
            console.warn(`[YT Video Stream] ${label} URL is not mid-range seekable for ${videoId}`);
        }

        console.log(`[YT Video Stream] Resolved via ${label} for ${videoId} (seekable=${seekable})`);
        cacheVideoStreamUrl(videoId, url, source, seekable);
        return url;
    };

    if (yt && !rejectedClients.has('WEB')) {
        try {
            const poToken = await getContentPoToken();
            const info = await yt.getBasicInfo(
                videoId,
                poToken ? { po_token: poToken } : undefined,
            );
            const url = await decipherFormatUrl(
                chooseVideoFormat(info.streaming_data?.adaptive_formats),
                yt.session.player,
            );
            const usableUrl = await acceptResolvedUrl(url, 'WEB');
            if (usableUrl) return usableUrl;
        } catch (error) {
            console.warn(`[YT Video Stream] WEB failed for ${videoId}:`, error);
        }
    }

    if (yt && !rejectedClients.has('IOS') && !rejectedClients.has('iOS')) {
        try {
            const info = await yt.getBasicInfo(videoId, { client: 'IOS' });
            const url = await decipherFormatUrl(
                chooseVideoFormat(info.streaming_data?.adaptive_formats),
                yt.session.player,
            );
            const usableUrl = await acceptResolvedUrl(url, 'IOS');
            if (usableUrl) return usableUrl;
        } catch (error) {
            console.warn(`[YT Video Stream] IOS failed for ${videoId}:`, error);
        }
    }

    if (yt && !rejectedClients.has('ANDROID')) {
        try {
            const info = await yt.getBasicInfo(videoId, { client: 'ANDROID' });
            const url = await decipherFormatUrl(
                chooseVideoFormat(info.streaming_data?.adaptive_formats),
                yt.session.player,
            );
            const usableUrl = await acceptResolvedUrl(url, 'ANDROID');
            if (usableUrl) return usableUrl;
        } catch (error) {
            console.warn(`[YT Video Stream] ANDROID failed for ${videoId}:`, error);
        }
    }

    try {
        const url = await resolveVideoStreamUrlWithYtdlp(videoId);
        const usableUrl = await acceptResolvedUrl(url, 'yt-dlp', 'yt-dlp');
        if (usableUrl) return usableUrl;
    } catch (error) {
        console.warn(`[YT Video Stream] yt-dlp failed for ${videoId}:`, error);
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
    videoStreamCache.clear();
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
                if (innertubeInstance.session.player) {
                    innertubeInstance.session.player.po_token = poTokenResult.poToken;
                }
            } else {
                cleanUp(globalThis);
            }
        }
    } catch (error) {
        console.error('Failed to generate YouTube po_token:', error);
    }

    return innertubeInstance;
};

const generatePoToken = async (identifier: string): Promise<null | string> => {
    if (!identifier || !contentPoTokenGenerationAvailable) return null;

    try {
        const requestKey = 'O43z0dpjhgX20SCx4KAo';
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
            identifier,
            requestKey,
        };

        const bgChallenge = await BG.Challenge.create(bgConfig);
        const interpreterJavascript =
            bgChallenge?.interpreterJavascript?.privateDoNotAccessOrElseSafeScriptWrappedValue;

        if (!interpreterJavascript) {
            cleanUp(globalThis);
            return null;
        }

        new Function(interpreterJavascript)();
        const poTokenResult = await BG.PoToken.generate({
            bgConfig,
            globalName: bgChallenge.globalName,
            program: bgChallenge.program,
        }).finally(() => {
            cleanUp(globalThis);
        });

        return poTokenResult.poToken || null;
    } catch (error) {
        const err = error as { code?: string };
        if (err.code === 'VM_ERROR') {
            contentPoTokenGenerationAvailable = false;
        }
        console.warn('[YouTube Music] Failed to generate content PO token:', error);
        return null;
    }
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

const extractYoutubeAccountIdentity = async (
    loginWindow: BrowserWindow,
): Promise<YoutubeAccountIdentity> => {
    try {
        return await loginWindow.webContents.executeJavaScript(`
            (() => {
                const normalizeUrl = (value) => {
                    if (!value) return null;
                    if (value.startsWith('//')) return 'https:' + value;
                    if (value.startsWith('/')) return new URL(value, location.origin).href;
                    return value;
                };

                const avatarCandidates = [
                    'ytmusic-settings-button img[src]',
                    'button[aria-label*="Account"] img[src]',
                    'button[aria-label*="account"] img[src]',
                    'img[src*="googleusercontent.com"]',
                    'img[src*="yt3.ggpht.com"]'
                ];

                const avatar = avatarCandidates
                    .map((selector) => document.querySelector(selector))
                    .find(Boolean);
                const accountButton =
                    document.querySelector('button[aria-label*="Account"]') ||
                    document.querySelector('button[aria-label*="account"]') ||
                    document.querySelector('ytmusic-settings-button button');
                const rawLabel =
                    accountButton?.getAttribute('aria-label') ||
                    avatar?.getAttribute('alt') ||
                    null;
                const displayName = rawLabel
                    ? rawLabel
                          .replace(/^Account menu/i, '')
                          .replace(/^Google Account:?/i, '')
                          .replace(/\\s+/g, ' ')
                          .trim() || null
                    : null;

                return {
                    avatarUrl: normalizeUrl(avatar?.getAttribute('src')),
                    displayName
                };
            })()
        `);
    } catch {
        return {
            avatarUrl: null,
            displayName: null,
        };
    }
};

const refreshStoredAccountIdentity = async (stored: StoredSession): Promise<StoredSession> => {
    if (stored.avatarUrl) return stored;

    if (!accountIdentityRefreshPromise) {
        accountIdentityRefreshPromise = (async () => {
            const identityWindow = new BrowserWindow({
                autoHideMenuBar: true,
                height: 480,
                show: false,
                webPreferences: {
                    contextIsolation: true,
                    nodeIntegration: false,
                    partition: LOGIN_PARTITION,
                    sandbox: true,
                },
                width: 640,
            });

            try {
                await identityWindow.loadURL(SOURCE_URL);
                await new Promise((resolve) => setTimeout(resolve, 1200));
                const accountIdentity = await extractYoutubeAccountIdentity(identityWindow);

                if (!accountIdentity.avatarUrl && !accountIdentity.displayName) return stored;

                const nextStored: StoredSession = {
                    ...stored,
                    avatarUrl: accountIdentity.avatarUrl || stored.avatarUrl || null,
                    displayName:
                        accountIdentity.displayName ||
                        stored.displayName ||
                        YOUTUBE_MUSIC_SOURCE_NAME,
                };
                store.set(SESSION_KEY, encrypt(nextStored));
                return nextStored;
            } catch {
                return stored;
            } finally {
                if (!identityWindow.isDestroyed()) identityWindow.close();
                accountIdentityRefreshPromise = null;
            }
        })();
    }

    return (await accountIdentityRefreshPromise) || stored;
};

const status = async (): Promise<YoutubeMusicAuthStatus> => {
    let dependencyAvailable = true;
    try {
        await loadYoutubei();
    } catch {
        dependencyAvailable = false;
    }

    const rawStored = getStoredSession();
    const stored =
        rawStored?.cookie && !rawStored.avatarUrl
            ? await refreshStoredAccountIdentity(rawStored)
            : rawStored;

    await startYtProxyServer();

    return {
        avatarUrl: normalizeImageUrlForRenderer(stored?.avatarUrl || null),
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

            const accountIdentity = await extractYoutubeAccountIdentity(loginWindow);
            const stored: StoredSession = {
                avatarUrl: accountIdentity.avatarUrl,
                connectedAt: nowIso(),
                cookie,
                displayName: accountIdentity.displayName || YOUTUBE_MUSIC_SOURCE_NAME,
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

const normalizePlaylistId = (id: string) => {
    const value = id.replace(/^ytm-playlist:/, '');
    if (value.startsWith('VL') && value.length > 2) return value.slice(2);
    return value;
};

const normalizeVideoId = (id: string) => id.replace(/^ytm:/, '');

const youtubeImageFallback = (videoId: null | string | undefined) =>
    videoId && VIDEO_ID_REGEX.test(videoId)
        ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
        : null;

const normalizeImageUrlForRenderer = (url: null | string) => youtubeImageProxyUrl(url);

const normalizeThumbnailUrl = (value: unknown): null | string => {
    if (typeof value !== 'string' || !value) return null;
    if (value.startsWith('//')) return `https:${value}`;
    if (!/^https?:\/\//i.test(value)) return null;
    return value;
};

const thumbnailCandidates = (value: any): Array<{ area: number; url: string }> => {
    if (!value) return [];

    const directUrl = normalizeThumbnailUrl(typeof value === 'string' ? value : value?.url);
    const directArea =
        Number(value?.width || value?.size?.width || 0) *
        Number(value?.height || value?.size?.height || 0);

    const directCandidates = directUrl ? [{ area: directArea, url: directUrl }] : [];
    const nested =
        value?.thumbnails ||
        value?.thumbnail ||
        value?.thumbnail_overlays ||
        value?.sources ||
        value?.images ||
        value?.contents ||
        null;

    if (!Array.isArray(nested)) return directCandidates;

    return [...directCandidates, ...nested.flatMap((item) => thumbnailCandidates(item))];
};

const bestThumbnail = (value: any): null | string => {
    const candidates = thumbnailCandidates(value);
    if (candidates.length === 0) return null;

    const preferredHosts = [
        'i.ytimg.com',
        'yt3.googleusercontent.com',
        'yt3.ggpht.com',
        'lh3.googleusercontent.com',
        'www.gstatic.com',
    ];

    const scored = candidates.map((candidate, index) => {
        let hostScore = 0;
        try {
            const host = new URL(candidate.url).hostname;
            hostScore = preferredHosts.includes(host) ? 1 : 0;
        } catch {
            hostScore = 0;
        }

        return {
            ...candidate,
            index,
            score: hostScore * 1_000_000_000 + candidate.area,
        };
    });

    scored.sort((a, b) => b.score - a.score || b.index - a.index);
    return scored[0]?.url || null;
};

const relatedArtist = (artist: any, fallback = 'Unknown Artist'): RelatedArtist => {
    const name = typeof artist === 'string' ? artist : artist?.name || fallback;
    const rawId = artist?.channel_id || artist?.id;
    const id = rawId && typeof rawId === 'string' && rawId !== name ? `ytm-artist:${rawId}` : name;
    return {
        id,
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

const endpointPayload = (item: any) =>
    item?.endpoint?.payload ||
    item?.navigation_endpoint?.payload ||
    item?.current_video_endpoint?.payload ||
    {};

const endpointUrl = (item: any): null | string =>
    item?.endpoint?.toURL?.() || item?.navigation_endpoint?.toURL?.() || null;

const extractVideoId = (item: any): null | string => {
    const payload = endpointPayload(item);
    const url = endpointUrl(item);
    const candidates = [
        item?.video_id,
        item?.videoId,
        payload?.videoId,
        payload?.watchEndpoint?.videoId,
        item?.basic_info?.id,
        item?.id,
    ];

    if (url) {
        try {
            candidates.push(new URL(url, SOURCE_URL).searchParams.get('v'));
        } catch {
            // Ignore malformed endpoint URLs.
        }
    }

    return (
        candidates.find(
            (candidate) => typeof candidate === 'string' && VIDEO_ID_REGEX.test(candidate),
        ) || null
    );
};

const extractBrowseId = (item: any): null | string => {
    const payload = endpointPayload(item);
    return (
        item?.browse_id ||
        item?.browseId ||
        payload?.browseId ||
        payload?.browseEndpoint?.browseId ||
        null
    );
};

const extractPlaylistId = (item: any): null | string => {
    const payload = endpointPayload(item);
    const url = endpointUrl(item);
    const candidates = [
        item?.playlist_id,
        item?.playlistId,
        payload?.playlistId,
        payload?.watchEndpoint?.playlistId,
        payload?.browseEndpoint?.playlistId,
        extractBrowseId(item),
        item?.id,
    ];

    if (url) {
        try {
            candidates.push(new URL(url, SOURCE_URL).searchParams.get('list'));
        } catch {
            // Ignore malformed endpoint URLs.
        }
    }

    const playlistId = candidates.find((candidate) => typeof candidate === 'string' && candidate);
    return playlistId ? normalizePlaylistId(playlistId) : null;
};

const isPlaylistLikeItem = (item: any) => {
    const type = String(item?.item_type || '').toLowerCase();
    if (type.includes('playlist')) return true;
    const playlistId = extractPlaylistId(item);
    const videoId = extractVideoId(item);
    return Boolean(playlistId && !videoId);
};

const songFromItem = (item: any): null | Song => {
    const videoId = extractVideoId(item);
    if (!videoId) return null;

    const artists = itemArtists(item);
    const name = textValue(item?.title || item?.name || item?.basic_info?.title) || 'Untitled';
    const albumName = item?.album?.name || null;
    const durationSeconds = item?.duration?.seconds || item?.basic_info?.duration || 0;
    const createdAt = nowIso();
    const imageUrl =
        bestThumbnail(
            item?.thumbnail ||
                item?.thumbnails ||
                item?.basic_info?.thumbnail ||
                item?.thumbnail_overlay,
        ) || youtubeImageFallback(videoId);

    return {
        _itemType: LibraryItem.SONG,
        _serverId: YOUTUBE_MUSIC_SOURCE_ID,
        _serverType: ServerType.YOUTUBE_MUSIC,
        album: albumName,
        albumArtistName: artists[0]?.name || 'Unknown Artist',
        albumArtists: artists,
        albumId: item?.album?.id ? `ytm-album:${item.album.id}` : '',
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
        imageUrl: normalizeImageUrlForRenderer(imageUrl),
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

const songFromScrapedWebItem = (item: {
    album?: null | string;
    artist?: null | string;
    duration?: number;
    imageUrl?: null | string;
    title: string;
    videoId: string;
}): null | Song =>
    songFromItem({
        album: item.album ? { name: item.album } : null,
        author: item.artist || 'Unknown Artist',
        basic_info: {
            duration: item.duration || 0,
            id: item.videoId,
            thumbnail: item.imageUrl,
            title: item.title,
        },
        thumbnail: item.imageUrl,
        title: item.title,
        video_id: item.videoId,
    });

const albumFromItem = (item: any): Album | null => {
    const id = item?.id || extractBrowseId(item);
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
        imageUrl: normalizeImageUrlForRenderer(bestThumbnail(item?.thumbnail || item?.thumbnails)),
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
    const id = item?.id || extractBrowseId(item);
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
        imageUrl: normalizeImageUrlForRenderer(bestThumbnail(item?.thumbnail || item?.thumbnails)),
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
    const playlistId = extractPlaylistId(item);
    if (!playlistId) return null;
    const type = String(item?.item_type || '').toLowerCase();
    const url = endpointUrl(item);
    let hasPlaylistUrl = false;
    if (url) {
        try {
            hasPlaylistUrl = Boolean(new URL(url, SOURCE_URL).searchParams.get('list'));
        } catch {
            hasPlaylistUrl = false;
        }
    }
    if (['album', 'artist', 'library_artist', 'song', 'video'].includes(type) && !hasPlaylistUrl) {
        return null;
    }
    const name = textValue(item?.title || item?.name || item?.header?.title) || 'Untitled Playlist';
    const imageUrl =
        bestThumbnail(
            item?.thumbnail ||
                item?.thumbnails ||
                item?.background ||
                item?.header?.thumbnail ||
                item?.header?.thumbnails,
        ) || null;
    return {
        _itemType: LibraryItem.PLAYLIST,
        _serverId: YOUTUBE_MUSIC_SOURCE_ID,
        _serverType: ServerType.YOUTUBE_MUSIC,
        description: textValue(item?.description) || null,
        duration: null,
        genres: [emptyGenre()],
        id: `ytm-playlist:${playlistId}`,
        imageId: null,
        imageUrl: normalizeImageUrlForRenderer(imageUrl),
        name,
        owner: item?.author?.name || null,
        ownerId: item?.author?.channel_id || null,
        public: null,
        size: item?.video_count || item?.videoCount || null,
        songCount: item?.video_count || item?.videoCount || null,
        sourceReadOnly: true,
        youtubeMusic: {
            browseId: playlistId,
            playlistId,
        },
    };
};

const shelfItems = (shelf: any) => {
    if (Array.isArray(shelf)) return shelf;
    return Array.isArray(shelf?.contents) ? shelf.contents : [];
};

const sectionItemsByType = (items: any[]) => {
    const songs: Song[] = [];
    const playlists: Playlist[] = [];
    const albums: Album[] = [];

    for (const item of items) {
        if (isPlaylistLikeItem(item)) {
            const playlist = playlistFromItem(item);
            if (playlist) {
                playlists.push(playlist);
                continue;
            }
        }

        const song = songFromItem(item);
        if (song) {
            songs.push(song);
            continue;
        }

        const playlist = playlistFromItem(item);
        if (playlist) {
            playlists.push(playlist);
            continue;
        }

        const album = albumFromItem(item);
        if (album) {
            albums.push(album);
        }
    }

    return { albums, playlists, songs };
};

const dedupeById = <T extends { id: string }>(items: T[]) =>
    items.filter(
        (item, index, allItems) =>
            allItems.findIndex((candidate) => candidate.id === item.id) === index,
    );

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

const scrapeHomeFromWeb = async (): Promise<YoutubeMusicHomeResponse> => {
    const scrapeWindow = new BrowserWindow({
        autoHideMenuBar: true,
        height: 900,
        show: false,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            partition: LOGIN_PARTITION,
            sandbox: true,
        },
        width: 1280,
    });

    try {
        await scrapeWindow.loadURL(SOURCE_URL);
        await new Promise((resolve) => setTimeout(resolve, 3000));

        const rawSections = (await scrapeWindow.webContents.executeJavaScript(`
            (async () => {
                const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
                for (let i = 0; i < 8; i += 1) {
                    window.scrollTo(0, document.documentElement.scrollHeight);
                    await wait(500);
                }

                const normalizeUrl = (value) => {
                    if (!value) return null;
                    if (value.startsWith('//')) return 'https:' + value;
                    if (value.startsWith('/')) return new URL(value, location.origin).href;
                    return value;
                };

                const getText = (root, selectors) => {
                    for (const selector of selectors) {
                        const value = root?.querySelector(selector)?.textContent?.replace(/\\s+/g, ' ').trim();
                        if (value) return value;
                    }
                    return '';
                };

                const getImage = (root, anchor) => {
                    const img =
                        root?.querySelector('yt-img-shadow img[src]') ||
                        root?.querySelector('img[src]') ||
                        anchor?.querySelector('yt-img-shadow img[src]') ||
                        anchor?.querySelector('img[src]');
                    const ytImg =
                        root?.querySelector('yt-img-shadow') ||
                        anchor?.querySelector('yt-img-shadow');
                    const srcset = img?.getAttribute('srcset') || img?.getAttribute('data-srcset');
                    const srcsetUrl = srcset
                        ? srcset
                              .split(',')
                              .map((part) => part.trim().split(/\\s+/)[0])
                              .filter(Boolean)
                              .pop()
                        : null;
                    return (
                        srcsetUrl ||
                        img?.currentSrc ||
                        img?.getAttribute('src') ||
                        img?.getAttribute('data-src') ||
                        ytImg?.getAttribute('src') ||
                        ytImg?.getAttribute('data-src') ||
                        null
                    );
                };

                const shelves = Array.from(document.querySelectorAll(
                    'ytmusic-carousel-shelf-renderer, ytmusic-shelf-renderer, ytmusic-grid-renderer'
                ));

                return shelves.map((shelf, shelfIndex) => {
                    const title =
                        getText(shelf, ['h2', '.title', '#title', 'yt-formatted-string.title']) ||
                        shelf.getAttribute('aria-label') ||
                        'YouTube Music';

                    const anchors = Array.from(shelf.querySelectorAll('a[href]'));
                    const seenIds = new Set();
                    const items = anchors.map((anchor) => {
                        const href = anchor.href || anchor.getAttribute('href') || '';
                        const url = new URL(href, location.origin);
                        const root =
                            anchor.closest('ytmusic-responsive-list-item-renderer') ||
                            anchor.closest('ytmusic-two-row-item-renderer') ||
                            anchor.closest('ytmusic-grid-renderer') ||
                            anchor.parentElement;
                        const itemTitle =
                            getText(root, ['.title', '#title', 'yt-formatted-string.title']) ||
                            anchor.getAttribute('title') ||
                            anchor.getAttribute('aria-label') ||
                            anchor.textContent ||
                            '';
                        const subtitle =
                            getText(root, ['.subtitle', '#subtitle', '.secondary-flex-columns']) ||
                            '';
                        const image = getImage(root, anchor);
                        const videoId = url.searchParams.get('v');
                        const playlistId = url.searchParams.get('list');
                        const browseId = url.pathname.includes('/browse/') ? url.pathname.split('/browse/')[1] : null;

                        let id = null;
                        if (videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId)) {
                            id = 'v:' + videoId;
                        } else if (playlistId && !playlistId.toUpperCase().startsWith('RD')) {
                            id = 'p:' + playlistId.replace(/^VL/, '');
                        } else if (browseId) {
                            id = 'b:' + browseId;
                        }
                        if (!id || seenIds.has(id)) return null;
                        seenIds.add(id);

                        if (videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId)) {
                            const subtitleParts = subtitle
                                .split(/[\\u2022\\u00b7]/)
                                .map((part) => part.replace(/\\s+/g, ' ').trim())
                                .filter(Boolean);
                            return {
                                album: subtitleParts[1] || null,
                                artist: subtitleParts[0] || null,
                                imageUrl: normalizeUrl(image),
                                title: itemTitle.replace(/\\s+/g, ' ').trim(),
                                type: 'song',
                                videoId
                            };
                        }

                        if (playlistId && !playlistId.toUpperCase().startsWith('RD')) {
                            return {
                                imageUrl: normalizeUrl(image),
                                owner: subtitle.replace(/\\s+/g, ' ').trim() || null,
                                playlistId: playlistId.replace(/^VL/, ''),
                                title: itemTitle.replace(/\\s+/g, ' ').trim(),
                                type: 'playlist'
                            };
                        }

                        if (browseId) {
                            return {
                                browseId,
                                imageUrl: normalizeUrl(image),
                                subtitle: subtitle.replace(/\\s+/g, ' ').trim() || null,
                                title: itemTitle.replace(/\\s+/g, ' ').trim(),
                                type: 'album'
                            };
                        }

                        return null;
                    }).filter(Boolean);

                    return { id: 'ytm-web-home-' + shelfIndex, items, title: title.replace(/\\s+/g, ' ').trim() };
                }).filter((section) => section.items.length > 0);
            })()
        `)) as Array<{
            id: string;
            items: Array<{
                album?: null | string;
                artist?: null | string;
                browseId?: string;
                imageUrl?: null | string;
                owner?: null | string;
                playlistId?: string;
                subtitle?: null | string;
                title: string;
                type: 'album' | 'playlist' | 'song';
                videoId?: string;
            }>;
            title: string;
        }>;

        const sections = rawSections
            .map((section) => {
                const songs = section.items
                    .filter((item) => item.type === 'song' && item.videoId)
                    .map((item) =>
                        songFromScrapedWebItem({
                            album: item.album,
                            artist: item.artist,
                            imageUrl: item.imageUrl,
                            title: item.title,
                            videoId: item.videoId || '',
                        }),
                    )
                    .filter((song): song is Song => Boolean(song));
                const playlists = section.items
                    .filter((item) => item.type === 'playlist' && item.playlistId)
                    .map((item) =>
                        playlistFromItem({
                            author: item.owner ? { name: item.owner } : null,
                            id: item.playlistId,
                            thumbnail: item.imageUrl,
                            title: item.title,
                        }),
                    )
                    .filter((playlist): playlist is Playlist => Boolean(playlist));
                const albums = section.items
                    .filter((item) => item.type === 'album' && item.browseId)
                    .map((item) =>
                        albumFromItem({
                            id: item.browseId,
                            name: item.title,
                            subtitle: item.subtitle,
                            thumbnail: item.imageUrl,
                            title: item.title,
                        }),
                    )
                    .filter((album): album is Album => Boolean(album));

                if (
                    songs.length >= playlists.length &&
                    songs.length >= albums.length &&
                    songs.length
                ) {
                    return youtubeMusicHomeSection(
                        section.id,
                        section.title,
                        LibraryItem.SONG,
                        songs,
                    );
                }
                if (playlists.length >= albums.length && playlists.length) {
                    return youtubeMusicHomeSection(
                        section.id,
                        section.title,
                        LibraryItem.PLAYLIST,
                        playlists,
                    );
                }
                if (albums.length) {
                    return youtubeMusicHomeSection(
                        section.id,
                        section.title,
                        LibraryItem.ALBUM,
                        albums,
                    );
                }
                return null;
            })
            .filter((section): section is YoutubeMusicHomeResponse['sections'][number] =>
                Boolean(section),
            );

        return { sections };
    } catch (error) {
        console.warn('[YouTube Music] Failed to scrape home feed:', error);
        return { sections: [] };
    } finally {
        if (!scrapeWindow.isDestroyed()) scrapeWindow.close();
    }
};

const search = async (query: string): Promise<YoutubeMusicSearchResult> => {
    if (!query.trim()) {
        return { albumArtists: [], albums: [], playlists: [], songs: [] };
    }

    await startYtProxyServer();
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

const getSongDetail = async (id: string): Promise<Song> => {
    const videoId = normalizeVideoId(id);
    if (!VIDEO_ID_REGEX.test(videoId)) {
        throw new Error('Invalid YouTube Music song id.');
    }

    await startYtProxyServer();
    const yt = await getInnertube();

    try {
        const info = await yt.music.getInfo(videoId);
        const song =
            songFromItem(info) ||
            songFromItem({
                ...info,
                author: info?.basic_info?.author || info?.basic_info?.channel?.name,
                basic_info: {
                    ...info?.basic_info,
                    id: videoId,
                },
                thumbnail: info?.basic_info?.thumbnail || info?.thumbnail,
                title: info?.basic_info?.title || info?.title,
                video_id: videoId,
            });
        if (song) return song;
    } catch (error) {
        console.warn(`[YouTube Music] Failed to load music info for ${videoId}:`, error);
    }

    try {
        const info = await yt.getBasicInfo(videoId);
        const song = songFromItem({
            ...info,
            author: info?.basic_info?.author || info?.basic_info?.channel?.name,
            basic_info: {
                ...info?.basic_info,
                id: videoId,
            },
            thumbnail: info?.basic_info?.thumbnail || info?.thumbnail,
            title: info?.basic_info?.title || info?.title,
            video_id: videoId,
        });
        if (song) return song;
    } catch (error) {
        console.warn(`[YouTube Music] Failed to load basic info for ${videoId}:`, error);
    }

    const result = await search(videoId);
    const song = result.songs.find((item) => item.id === `ytm:${videoId}`) || result.songs[0];
    if (!song) throw new Error('YouTube Music song not found.');
    return song;
};

const collectHomeFromInnertube = async (): Promise<YoutubeMusicHomeResponse> => {
    const yt = await getInnertube();
    const feeds: any[] = [];

    try {
        let feed = await yt.music.getHomeFeed();
        feeds.push(feed);

        for (let index = 0; index < 2 && feed?.has_continuation; index += 1) {
            feed = await feed.getContinuation();
            feeds.push(feed);
        }
    } catch (error) {
        console.warn('[YouTube Music] Failed to load InnerTube home feed:', error);
    }

    const rawSections = feeds.flatMap((feed) =>
        Array.isArray(feed?.sections) ? feed.sections : [],
    );
    const sections = rawSections
        .map((section: any, index: number) => {
            const title = textValue(section?.header?.title) || `Shelf ${index + 1}`;
            const contents = Array.isArray(section?.contents) ? section.contents : [];
            const { albums, playlists, songs } = sectionItemsByType(contents);

            if (songs.length > 0) {
                return youtubeMusicHomeSection(
                    `ytm-home-${index}-songs`,
                    title,
                    LibraryItem.SONG,
                    dedupeById(songs).slice(0, 12),
                );
            }

            if (playlists.length > 0) {
                return youtubeMusicHomeSection(
                    `ytm-home-${index}-playlists`,
                    title,
                    LibraryItem.PLAYLIST,
                    dedupeById(playlists).slice(0, 12),
                );
            }

            if (albums.length > 0) {
                return youtubeMusicHomeSection(
                    `ytm-home-${index}-albums`,
                    title,
                    LibraryItem.ALBUM,
                    dedupeById(albums).slice(0, 12),
                );
            }

            return null;
        })
        .filter((section): section is YoutubeMusicHomeResponse['sections'][number] =>
            Boolean(section),
        )
        .slice(0, 24);

    return dedupeHomeSections({ sections });
};

const dedupeHomeSections = (response: YoutubeMusicHomeResponse): YoutubeMusicHomeResponse => {
    const seenSectionTitles = new Set<string>();
    const dedupedSections: YoutubeMusicHomeResponse['sections'] = [];

    for (const section of response.sections) {
        const titleKey = section.title.toLowerCase().trim();
        if (seenSectionTitles.has(titleKey)) continue;
        seenSectionTitles.add(titleKey);

        const uniqueItems = dedupeById(section.items);
        if (uniqueItems.length === 0) continue;

        dedupedSections.push({ ...section, items: uniqueItems });
    }

    return { sections: dedupedSections };
};

const enrichHomePlaylistThumbnails = async (
    response: YoutubeMusicHomeResponse,
): Promise<YoutubeMusicHomeResponse> => {
    const missingPlaylists = response.sections
        .filter((section) => section.itemType === LibraryItem.PLAYLIST)
        .flatMap((section) => section.items as Playlist[])
        .filter((playlist) => !playlist.imageUrl && playlist.youtubeMusic?.playlistId)
        .slice(0, 24);

    if (missingPlaylists.length === 0) return response;

    const thumbnailById = new Map<string, null | string>();
    await Promise.all(
        missingPlaylists.map(async (playlist) => {
            try {
                const detail = await getPlaylistDetail(playlist.id);
                thumbnailById.set(playlist.id, detail.imageUrl || null);
            } catch {
                thumbnailById.set(playlist.id, null);
            }
        }),
    );

    return {
        sections: response.sections.map((section) => {
            if (section.itemType !== LibraryItem.PLAYLIST) return section;

            return {
                ...section,
                items: (section.items as Playlist[]).map((playlist) => ({
                    ...playlist,
                    imageUrl: playlist.imageUrl || thumbnailById.get(playlist.id) || null,
                })),
            };
        }),
    };
};

const home = async (): Promise<YoutubeMusicHomeResponse> => {
    await startYtProxyServer();
    const [innerTubeHome, webHome] = await Promise.all([
        collectHomeFromInnertube(),
        scrapeHomeFromWeb(),
    ]);

    const dedupedWebHome = dedupeHomeSections(webHome);
    const chosenHome =
        dedupedWebHome.sections.length >= innerTubeHome.sections.length
            ? dedupedWebHome
            : innerTubeHome;

    return enrichHomePlaylistThumbnails(chosenHome);
};

const getPlaylistSongs = async (id: string): Promise<Song[]> => {
    await startYtProxyServer();
    const playlistId = normalizePlaylistId(id);
    const yt = await getInnertube();
    let playlist = await yt.music.getPlaylist(playlistId);
    const items = [...shelfItems(playlist?.contents)];

    for (let index = 0; index < 20 && playlist?.has_continuation; index += 1) {
        try {
            playlist = await playlist.getContinuation();
            items.push(...shelfItems(playlist?.contents));
        } catch (error) {
            console.warn(
                `[YouTube Music] Failed to load playlist continuation ${playlistId}:`,
                error,
            );
            break;
        }
    }

    return dedupeById(items.map(songFromItem).filter((song): song is Song => Boolean(song))).slice(
        0,
        500,
    );
};

const getPlaylistDetail = async (id: string): Promise<Playlist> => {
    await startYtProxyServer();
    const playlistId = normalizePlaylistId(id);
    const yt = await getInnertube();
    const playlist = await yt.music.getPlaylist(playlistId);
    const songs = await getPlaylistSongs(playlistId).catch(() =>
        shelfItems(playlist?.contents).map(songFromItem).filter(Boolean),
    );
    const parsed = playlistFromItem({
        ...playlist,
        id: playlist?.id || playlistId,
        playlist_id: playlist?.playlist_id || playlistId,
    });

    const headerThumbnail =
        playlist?.header?.thumbnail ||
        playlist?.header?.musicDetailHeaderRenderer?.thumbnail ||
        null;
    const headerTitle =
        playlist?.header?.title || playlist?.header?.musicDetailHeaderRenderer?.title || null;

    return {
        _itemType: LibraryItem.PLAYLIST,
        _serverId: YOUTUBE_MUSIC_SOURCE_ID,
        _serverType: ServerType.YOUTUBE_MUSIC,
        description: textValue(playlist?.description) || null,
        duration: null,
        genres: [emptyGenre()],
        id: `ytm-playlist:${playlistId}`,
        imageId: null,
        imageUrl: normalizeImageUrlForRenderer(
            bestThumbnail(headerThumbnail) ||
                bestThumbnail(playlist?.thumbnail) ||
                bestThumbnail(playlist?.thumbnails) ||
                bestThumbnail(playlist?.background) ||
                parsed?.imageUrl ||
                songs.find((song) => song.imageUrl)?.imageUrl ||
                null,
        ),
        name:
            textValue(headerTitle) ||
            parsed?.name ||
            textValue(playlist?.title) ||
            textValue(playlist?.name) ||
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
    await startYtProxyServer();
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

const collectLibraryPlaylists = async (library: any): Promise<Playlist[]> => {
    const collected: Playlist[] = [];
    const seen = new Set<string>();

    const addItems = (containers: any[] | undefined) => {
        for (const container of containers || []) {
            const items = shelfItems(container);
            for (const item of items) {
                const playlist = playlistFromItem(item);
                if (!playlist || seen.has(playlist.id)) continue;
                seen.add(playlist.id);
                collected.push(playlist);
            }
        }
    };

    addItems(library?.contents);

    let page = library;
    for (let index = 0; index < 8 && page?.has_continuation; index += 1) {
        try {
            page = await page.getContinuation();
            addItems(Array.isArray(page?.contents) ? page.contents : [page?.contents]);
        } catch {
            break;
        }
    }

    return collected;
};

const scrapeAccountPlaylistsFromWeb = async (): Promise<Playlist[]> => {
    const scrapeWindow = new BrowserWindow({
        autoHideMenuBar: true,
        height: 700,
        show: false,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            partition: LOGIN_PARTITION,
            sandbox: true,
        },
        width: 1100,
    });

    try {
        await scrapeWindow.loadURL(`${SOURCE_URL}/library/playlists`);
        await new Promise((resolve) => setTimeout(resolve, 2500));

        const rawPlaylists = (await scrapeWindow.webContents.executeJavaScript(`
            (async () => {
                const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
                for (let i = 0; i < 5; i += 1) {
                    window.scrollTo(0, document.documentElement.scrollHeight);
                    await wait(450);
                }

                const normalizeUrl = (value) => {
                    if (!value) return null;
                    if (value.startsWith('//')) return 'https:' + value;
                    if (value.startsWith('/')) return new URL(value, location.origin).href;
                    return value;
                };

                const candidates = Array.from(document.querySelectorAll('a[href*="list="]'));
                return candidates.map((anchor) => {
                    const href = anchor.href || anchor.getAttribute('href') || '';
                    const url = new URL(href, location.origin);
                    const list = url.searchParams.get('list');
                    if (!list || list.toUpperCase().startsWith('RD')) return null;

                    const root =
                        anchor.closest('ytmusic-two-row-item-renderer') ||
                        anchor.closest('ytmusic-responsive-list-item-renderer') ||
                        anchor.closest('ytmusic-grid-renderer') ||
                        anchor.parentElement;
                    const title =
                        root?.querySelector('.title')?.textContent ||
                        root?.querySelector('#title')?.textContent ||
                        anchor.getAttribute('title') ||
                        anchor.getAttribute('aria-label') ||
                        anchor.textContent ||
                        'Untitled Playlist';
                    const subtitle =
                        root?.querySelector('.subtitle')?.textContent ||
                        root?.querySelector('#subtitle')?.textContent ||
                        '';
                    const image =
                        root?.querySelector('yt-img-shadow')?.getAttribute('src') ||
                        root?.querySelector('yt-img-shadow')?.getAttribute('data-src') ||
                        root?.querySelector('img[src]')?.getAttribute('src') ||
                        anchor.querySelector('yt-img-shadow')?.getAttribute('src') ||
                        anchor.querySelector('yt-img-shadow')?.getAttribute('data-src') ||
                        anchor.querySelector('img[src]')?.getAttribute('src') ||
                        null;

                    return {
                        imageUrl: normalizeUrl(image),
                        owner: subtitle.replace(/\\s+/g, ' ').trim() || null,
                        playlistId: list.replace(/^VL/, ''),
                        title: title.replace(/\\s+/g, ' ').trim()
                    };
                }).filter(Boolean);
            })()
        `)) as Array<{
            imageUrl: null | string;
            owner: null | string;
            playlistId: string;
            title: string;
        }>;

        const seen = new Set<string>();
        return rawPlaylists
            .filter((item) => {
                if (!item.playlistId || seen.has(item.playlistId)) return false;
                seen.add(item.playlistId);
                return true;
            })
            .map((item) => ({
                _itemType: LibraryItem.PLAYLIST,
                _serverId: YOUTUBE_MUSIC_SOURCE_ID,
                _serverType: ServerType.YOUTUBE_MUSIC,
                description: null,
                duration: null,
                genres: [emptyGenre()],
                id: `ytm-playlist:${item.playlistId}`,
                imageId: null,
                imageUrl: normalizeImageUrlForRenderer(item.imageUrl),
                name: item.title || 'Untitled Playlist',
                owner: item.owner,
                ownerId: null,
                public: null,
                size: null,
                songCount: null,
                sourceReadOnly: true,
                youtubeMusic: {
                    browseId: item.playlistId,
                    playlistId: item.playlistId,
                },
            }));
    } catch (error) {
        console.warn('[YouTube Music] Failed to scrape library playlists:', error);
        return [];
    } finally {
        if (!scrapeWindow.isDestroyed()) scrapeWindow.close();
    }
};

const scrapeAccountSongsFromWeb = async (): Promise<Song[]> => {
    const scrapeWindow = new BrowserWindow({
        autoHideMenuBar: true,
        height: 700,
        show: false,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            partition: LOGIN_PARTITION,
            sandbox: true,
        },
        width: 1100,
    });

    try {
        await scrapeWindow.loadURL(`${SOURCE_URL}/library/songs`);
        await new Promise((resolve) => setTimeout(resolve, 2500));

        const rawSongs = (await scrapeWindow.webContents.executeJavaScript(`
            (async () => {
                const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
                for (let i = 0; i < 7; i += 1) {
                    window.scrollTo(0, document.documentElement.scrollHeight);
                    await wait(450);
                }

                const normalizeUrl = (value) => {
                    if (!value) return null;
                    if (value.startsWith('//')) return 'https:' + value;
                    if (value.startsWith('/')) return new URL(value, location.origin).href;
                    return value;
                };

                const candidates = Array.from(document.querySelectorAll('a[href*="watch"][href*="v="]'));
                return candidates.map((anchor) => {
                    const href = anchor.href || anchor.getAttribute('href') || '';
                    const url = new URL(href, location.origin);
                    const videoId = url.searchParams.get('v');
                    if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;

                    const root =
                        anchor.closest('ytmusic-responsive-list-item-renderer') ||
                        anchor.closest('ytmusic-two-row-item-renderer') ||
                        anchor.parentElement;
                    const title =
                        root?.querySelector('.title')?.textContent ||
                        root?.querySelector('#title')?.textContent ||
                        anchor.getAttribute('title') ||
                        anchor.getAttribute('aria-label') ||
                        anchor.textContent ||
                        'Untitled';
                    const subtitle =
                        root?.querySelector('.secondary-flex-columns')?.textContent ||
                        root?.querySelector('.subtitle')?.textContent ||
                        root?.querySelector('#subtitle')?.textContent ||
                        '';
                    const image =
                        root?.querySelector('yt-img-shadow')?.getAttribute('src') ||
                        root?.querySelector('yt-img-shadow')?.getAttribute('data-src') ||
                        root?.querySelector('img[src]')?.getAttribute('src') ||
                        anchor.querySelector('yt-img-shadow')?.getAttribute('src') ||
                        anchor.querySelector('yt-img-shadow')?.getAttribute('data-src') ||
                        anchor.querySelector('img[src]')?.getAttribute('src') ||
                        null;

                    const subtitleParts = subtitle
                        .split(/[\\u2022\\u00b7]/)
                        .map((part) => part.replace(/\\s+/g, ' ').trim())
                        .filter(Boolean);

                    return {
                        album: subtitleParts[1] || null,
                        artist: subtitleParts[0] || null,
                        imageUrl: normalizeUrl(image),
                        title: title.replace(/\\s+/g, ' ').trim(),
                        videoId
                    };
                }).filter(Boolean);
            })()
        `)) as Array<{
            album: null | string;
            artist: null | string;
            imageUrl: null | string;
            title: string;
            videoId: string;
        }>;

        const seen = new Set<string>();
        return rawSongs
            .filter((item) => {
                if (!item.videoId || seen.has(item.videoId)) return false;
                seen.add(item.videoId);
                return true;
            })
            .map(songFromScrapedWebItem)
            .filter((song): song is Song => Boolean(song));
    } catch (error) {
        console.warn('[YouTube Music] Failed to scrape library songs:', error);
        return [];
    } finally {
        if (!scrapeWindow.isDestroyed()) scrapeWindow.close();
    }
};

const collectLibrarySongs = async (library: any): Promise<Song[]> => {
    const collected: Song[] = [];
    const seen = new Set<string>();

    const addItems = (containers: any[] | undefined) => {
        for (const container of containers || []) {
            const items = shelfItems(container);
            for (const item of items) {
                const song = songFromItem(item);
                if (!song || seen.has(song.id)) continue;
                seen.add(song.id);
                collected.push(song);
            }
        }
    };

    addItems(library?.contents);

    let page = library;
    for (let index = 0; index < 8 && page?.has_continuation; index += 1) {
        try {
            page = await page.getContinuation();
            addItems(Array.isArray(page?.contents) ? page.contents : [page?.contents]);
        } catch {
            break;
        }
    }

    return collected;
};

const getAccountPlaylists = async (): Promise<Playlist[]> => {
    await startYtProxyServer();
    try {
        const yt = await getInnertube();
        const library = await yt.music.getLibrary();
        const libraryViews = [library];

        for (const filter of library?.filters || []) {
            if (String(filter).toLowerCase().includes('playlist')) {
                try {
                    libraryViews.unshift(await library.applyFilter(filter));
                } catch (error) {
                    console.warn(
                        `[YouTube Music] Failed to apply library filter "${filter}":`,
                        error,
                    );
                }
                break;
            }
        }

        const libraryPlaylists = dedupeById(
            (
                await Promise.all(
                    libraryViews.map((view) => collectLibraryPlaylists(view).catch(() => [])),
                )
            ).flat(),
        );

        if (libraryPlaylists.length > 0) return libraryPlaylists;

        const feed = await yt.getPlaylists().catch(() => null);
        const playlists = dedupeById(
            (feed?.playlists || []).map(playlistFromItem).filter(Boolean),
        ) as Playlist[];

        if (playlists.length > 0) return playlists;
    } catch (error) {
        console.warn('[YouTube Music] Failed to load account playlists from InnerTube:', error);
    }

    return scrapeAccountPlaylistsFromWeb();
};

const getAccountSongs = async (): Promise<Song[]> => {
    await startYtProxyServer();
    try {
        const yt = await getInnertube();
        const library = await yt.music.getLibrary();
        const libraryViews = [library];

        for (const filter of library?.filters || []) {
            if (String(filter).toLowerCase().includes('song')) {
                try {
                    libraryViews.unshift(await library.applyFilter(filter));
                } catch (error) {
                    console.warn(
                        `[YouTube Music] Failed to apply library filter "${filter}":`,
                        error,
                    );
                }
                break;
            }
        }

        const songs = dedupeById(
            (
                await Promise.all(
                    libraryViews.map((view) => collectLibrarySongs(view).catch(() => [])),
                )
            ).flat(),
        );

        if (songs.length > 0) return songs;
    } catch (error) {
        console.warn('[YouTube Music] Failed to load account songs from library:', error);
    }

    const webSongs = await scrapeAccountSongsFromWeb();
    if (webSongs.length > 0) return webSongs;

    return getSongList();
};

const getAccountPlaylistSongs = async (id: string): Promise<Song[]> => {
    return getPlaylistSongs(id);
};

const getStreamUrl = async (id: string): Promise<string> => {
    await startYtProxyServer();
    const videoId = id.startsWith('ytm:') ? id.slice(4) : id;
    if (!isYoutubeVideoId(videoId)) {
        throw new Error('Invalid YouTube video id for streaming.');
    }
    return `http://127.0.0.1:${ytProxyPort}/yt-stream/${videoId}`;
};

const getVideoStreamUrl = async (id: string): Promise<string> => {
    await startYtProxyServer();
    const videoId = id.startsWith('ytm:') ? id.slice(4) : id;
    return `http://127.0.0.1:${ytProxyPort}/yt-video-stream/${videoId}`;
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
        if (!isYoutubeVideoId(videoId)) {
            return {
                error: 'Invalid YouTube video id for streaming.',
                resolvedAt: Date.now(),
                source: 'youtube_music',
                trackId: `youtube_music:${videoId}`,
            };
        }
        const cached = streamCache.get(videoId);

        // If cached and not expired, return the proxy URL (never leak raw googlevideo URLs to renderer)
        if (cached && cached.expiresAt > Date.now() + 30_000) {
            console.log(
                `[StreamResolver] Cache hit for ${videoId} (reason=${args.reason || 'playback'}, seekable=${cached.seekable})`,
            );
            return {
                bitrate: undefined,
                codec: undefined,
                expiresAt: cached.expiresAt,
                mimeType: undefined,
                resolvedAt: Date.now(),
                seekable: cached.seekable,
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
            const entry = streamCache.get(videoId);
            return {
                bitrate: undefined,
                codec: undefined,
                expiresAt: entry?.expiresAt || Date.now() + STREAM_CACHE_TTL_MS,
                mimeType: undefined,
                resolvedAt: Date.now(),
                seekable: entry?.seekable ?? true,
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

ipcMain.handle(
    'stream:resolve-video',
    async (_event, args: { id: string; reason?: 'playback' | 'preload' | 'retry' }) => {
        await startYtProxyServer();
        const videoId = args.id.startsWith('ytm:') ? args.id.slice(4) : args.id;
        const cached = videoStreamCache.get(videoId);

        if (cached && cached.expiresAt > Date.now() + 30_000) {
            console.log(
                `[VideoStreamResolver] Cache hit for ${videoId} (reason=${args.reason || 'playback'})`,
            );
            return {
                expiresAt: cached.expiresAt,
                mimeType: 'video/mp4',
                resolvedAt: Date.now(),
                source: 'youtube_music',
                trackId: `youtube_music:${videoId}`,
                url: `http://127.0.0.1:${ytProxyPort}/yt-video-stream/${videoId}`,
            };
        }

        try {
            const rawUrl = await resolveVideoStreamUrl(videoId);
            if (!rawUrl) {
                return {
                    error: 'Could not resolve video stream URL',
                    resolvedAt: Date.now(),
                    source: 'youtube_music',
                    trackId: `youtube_music:${videoId}`,
                };
            }
            return {
                expiresAt:
                    videoStreamCache.get(videoId)?.expiresAt || Date.now() + STREAM_CACHE_TTL_MS,
                mimeType: 'video/mp4',
                resolvedAt: Date.now(),
                source: 'youtube_music',
                trackId: `youtube_music:${videoId}`,
                url: `http://127.0.0.1:${ytProxyPort}/yt-video-stream/${videoId}`,
            };
        } catch (error) {
            console.error(`[VideoStreamResolver] Failed to resolve ${videoId}:`, error);
            return {
                error: error instanceof Error ? error.message : 'Video stream resolution failed',
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
    videoStreamCache.delete(videoId);
    seekableFileCache.delete(videoId);
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
            imageUrl?: string;
            saveVideo?: boolean;
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
                album: args.album,
                artist: args.artist,
                imageUrl: args.imageUrl,
                source: 'youtube_music',
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
ipcMain.handle('youtube-music-song-detail', (_event, id: string) => getSongDetail(id));
ipcMain.handle('youtube-music-song-list', () => getSongList());
ipcMain.handle('youtube-music-stream-url', (_event, id: string) => getStreamUrl(id));
ipcMain.handle('youtube-music-video-stream-url', (_event, id: string) => getVideoStreamUrl(id));
ipcMain.handle('youtube-music-lyrics', (_event, id: string) => getLyrics(id));
ipcMain.handle('youtube-music-account-playlists', () => getAccountPlaylists());
ipcMain.handle('youtube-music-account-songs', () => getAccountSongs());
ipcMain.handle('youtube-music-account-playlist-songs', (_event, id: string) =>
    getAccountPlaylistSongs(id),
);

ipcMain.handle(
    'youtube-music:import-track',
    async (
        _event,
        args: {
            album?: string;
            artist: string;
            imageUrl?: string;
            saveVideo?: boolean;
            sourceTrackId: string;
            targetPlaylistIds?: string[];
            targetPlaylistNames?: string[];
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
                album: args.album,
                artist: args.artist,
                imageUrl: args.imageUrl,
                source: 'youtube_music',
                sourceTrackId: args.sourceTrackId,
                title: args.title,
                videoId: args.videoId,
            },
            args.targetPlaylistIds,
            args.targetPlaylistNames,
            args.saveVideo,
        );
    },
);

ipcMain.handle(
    'youtube-music:import-playlist',
    async (
        _event,
        args: {
            createPlaylist?: boolean;
            playlistId: string;
            playlistName?: string;
            saveVideo?: boolean;
            targetPlaylistIds?: string[];
            targetPlaylistNames?: string[];
        },
    ) => {
        const { createImportJob } = await import('../local-first');
        return createImportJob(
            `https://music.youtube.com/playlist?list=${args.playlistId}`,
            true,
            undefined,
            undefined,
            args.createPlaylist ?? true,
            args.playlistName,
            {
                source: 'youtube_music',
            },
            args.targetPlaylistIds,
            args.targetPlaylistNames,
            args.saveVideo,
        );
    },
);

startYtProxyServer();

export const youtubeMusic = {
    getAccountPlaylists,
    getAccountPlaylistSongs,
    getAccountSongs,
    getAlbumSongs,
    getLyrics,
    getPlaylistSongs,
    getSongDetail,
    getSongList,
    getStreamUrl,
    getVideoStreamUrl,
    home,
    search,
    status,
};
