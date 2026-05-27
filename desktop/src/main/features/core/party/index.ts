import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { app, ipcMain } from 'electron';
import { createReadStream, promises, Stats } from 'fs';
import { IncomingMessage, Server, ServerResponse, createServer } from 'http';
import http from 'http';
import https from 'https';
import { networkInterfaces } from 'os';
import { join } from 'path';
import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { WebSocket, WebSocketServer, Server as WsServer } from 'ws';
import { z } from 'zod';

import { ensureCloudflared } from '/@/main/features/core/party/cloudflared-binary';
import { relayVoiceToHost, resetVoiceState, setHostMicActive } from '/@/main/features/core/party/voice-signaling';
import { getMainWindow } from '/@/main/index';
import { youtubeMusic } from '/@/main/features/core/youtube-music';
import { hashAvatarColor } from '/@/shared/party-utils';
import { Song } from '/@/shared/types/domain-types';
import {
    PartyApprovedSuggestion,
    PartyChatMessage,
    PartyClientMessage,
    PartyControlCommand,
    PartyGuest,
    PartyHostSnapshot,
    PartyLiveSettings,
    PartyReorderQueueCommand,
    PartyRoomState,
    PartyServerMessage,
    PartySettings,
    PartyStartResult,
    PartySuggestion,
    PartyTrack,
    PartyTunnelStatus,
    defaultPartyTrackFields,
} from '/@/shared/types/party-types';
import { PlayerStatus } from '/@/shared/types/types';

declare class PartyWebSocket extends WebSocket {
    alive: boolean;
    guestId?: string;
}

const DEFAULT_SETTINGS: PartySettings = {
    allowGuestQueueReorder: false,
    autoApproveJoins: true,
    autoApproveSuggestions: false,
    chatRateLimitEnabled: false,
    controlMode: 'host',
    exposureMode: 'tunnel',
    hostDisplayName: 'Host',
    maxGuests: 20,
    micAutoGainControl: false,
    micEchoCancellation: false,
    micGain: 100,
    micNoiseSuppression: true,
    port: 4334,
    queueLocked: false,
    roomTheme: 'dark',
    voteToSkipEnabled: false,
    voteToSkipThreshold: 0.5,
};

const CHAT_MAX_MESSAGES = 100;
const CHAT_MAX_BODY_LENGTH = 400;
const CHAT_RATE_LIMIT_MS = 2000;
const SUGGESTION_RATE_LIMIT_MS = 30000;
const YOUTUBE_STREAM_CACHE_MS = 10 * 60 * 1000;
const ROOM_TOKEN_MAX_MS = 24 * 60 * 60 * 1000;
const BUFFER_GATE_TIMEOUT_MS = 5000;

const MIME_TYPES: Record<string, string> = {
    css: 'text/css',
    html: 'text/html; charset=UTF-8',
    ico: 'image/x-icon',
    js: 'application/javascript',
};

const CLIENT_MESSAGE_SCHEMA = z.discriminatedUnion('type', [
    z.object({
        action: z.enum(['add_next', 'play_now', 'seek', 'skip', 'toggle_play']),
        positionMs: z.number().min(0).optional(),
        query: z.string().trim().min(2).max(500).optional(),
        type: z.literal('control'),
    }),
    z.object({
        displayName: z.string().trim().min(1).max(40),
        sessionToken: z.string().optional(),
        type: z.literal('join'),
    }),
    z.object({
        query: z.string().trim().min(2).max(500),
        type: z.literal('search'),
    }),
    z.object({
        query: z.string().trim().min(2).max(500),
        type: z.literal('suggest'),
    }),
    z.object({
        trackId: z.string().min(1),
        type: z.literal('ready'),
    }),
    z.object({ type: z.literal('sync_request') }),
    z.object({ type: z.literal('pong') }),
    z.object({
        body: z.string().trim().min(1).max(CHAT_MAX_BODY_LENGTH),
        type: z.literal('chat_send'),
    }),
    z.object({
        toIndex: z.number().int().min(0).max(200),
        trackId: z.string().min(1),
        type: z.literal('reorder_queue'),
    }),
    z.object({ trackId: z.string().min(1), type: z.literal('vote_track') }),
    z.object({ type: z.literal('leave') }),
    z.object({
        sdp: z.object({
            sdp: z.string(),
            type: z.enum(['answer', 'offer', 'pranswer', 'rollback']),
        }),
        type: z.literal('voice_answer'),
    }),
    z.object({
        candidate: z.object({
            candidate: z.string(),
            sdpMLineIndex: z.number().nullable().optional(),
            sdpMid: z.string().nullable().optional(),
        }),
        guestId: z.string().optional(),
        type: z.literal('voice_ice'),
    }),
]);

const VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;
const PING_TIMEOUT_MS = 10000;

const youtubeStreamCache = new Map<string, { expiresAt: number; url: string }>();
const chatRateLimits = new Map<string, number>();
const suggestionRateLimits = new Map<string, number>();
const guestReadyTrackIds = new Set<string>();
let bufferGateTimer: ReturnType<typeof setTimeout> | undefined;
let pendingBufferTrackId: string | undefined;

let server: Server | undefined;
let wsServer: undefined | WsServer<typeof PartyWebSocket>;
let room: PartyRoomState | undefined;
let settings: PartySettings = DEFAULT_SETTINGS;
let signingSecret = randomBytes(32).toString('base64url');
let tunnelProcess: ChildProcessWithoutNullStreams | undefined;
let tunnelStatus: PartyTunnelStatus = {
    mode: DEFAULT_SETTINGS.exposureMode,
    state: 'disabled',
};

const guestSockets = new Map<string, PartyWebSocket>();
const approvedSessions = new Map<string, string>();
const guestSessionTokens = new Map<string, string>();
let approvedSuggestionSongs = new Map<string, Song>();

const sendToRenderer = (channel: string, data: unknown) => {
    getMainWindow()?.webContents.send(channel, data);
};

const makeId = (bytes = 12) => randomBytes(bytes).toString('base64url');

const issueSessionToken = (guestId: string) => {
    let token = guestSessionTokens.get(guestId);
    if (!token) {
        token = makeId(18);
        guestSessionTokens.set(guestId, token);
        approvedSessions.set(token, guestId);
    }
    return token;
};

const revokeSessionToken = (guestId: string) => {
    const token = guestSessionTokens.get(guestId);
    if (token) {
        approvedSessions.delete(token);
        guestSessionTokens.delete(guestId);
    }
};

const attachGuestSocket = (guestId: string, client: PartyWebSocket) => {
    const priorSocket = guestSockets.get(guestId);
    if (priorSocket && priorSocket !== client && priorSocket.readyState === WebSocket.OPEN) {
        priorSocket.close(4002, 'Reconnected');
    }
    client.guestId = guestId;
    guestSockets.set(guestId, client);
};

const notifyGuestApproved = (client: PartyWebSocket, guest: PartyGuest) => {
    if (!room) return;
    const sessionToken = issueSessionToken(guest.id);
    send(client, {
        sessionToken,
        state: roomForGuest(guest.id) || room,
        type: 'join_approved',
    });
    if (room.chat.length) {
        send(client, { messages: room.chat, type: 'chat_history' });
    }
};

const notifyGuestPending = (client: PartyWebSocket, guest: PartyGuest) => {
    send(client, { sessionToken: issueSessionToken(guest.id), type: 'join_pending' });
};

const makeRoomCode = () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let index = 0; index < 6; index += 1) {
        code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return code;
};

const normalizeBaseUrl = (url: string) => url.replace(/\/+$/, '');

const buildJoinUrl = (baseUrl: string, code: string) => `${normalizeBaseUrl(baseUrl)}/party/${code}`;

const getLanUrls = (port: number) => {
    const urls: string[] = [];
    const nets = networkInterfaces();
    for (const entries of Object.values(nets)) {
        for (const entry of entries || []) {
            if (entry.family === 'IPv4' && !entry.internal) {
                urls.push(`http://${entry.address}:${port}`);
            }
        }
    }
    return urls;
};

const getPartyAssetPath = (fileName: string) =>
    app.isPackaged
        ? join(__dirname, '../party', fileName)
        : join(__dirname, '../../out/party', fileName);

async function serveFile(fileName: string, res: ServerResponse): Promise<void> {
    const extension = fileName.split('.').pop() || 'html';
    const path = getPartyAssetPath(fileName);
    let stats: Stats;

    try {
        stats = await promises.stat(path);
    } catch {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/plain');
        res.end('Not Found');
        return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', MIME_TYPES[extension] || 'application/octet-stream');
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Cache-Control', extension === 'html' ? 'no-cache' : 'public, max-age=3600');
    createReadStream(path).pipe(res);
}

const send = (client: PartyWebSocket, message: PartyServerMessage) => {
    if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
    }
};

const broadcast = (message: PartyServerMessage) => {
    wsServer?.clients.forEach((client) => send(client, message));
};

const updateRendererState = () => {
    if (room) sendToRenderer('party:state', room);
};

const broadcastState = () => {
    if (!room) return;
    room.serverTimeMs = Date.now();
    const activeRoom = room;
    wsServer?.clients.forEach((client) => {
        send(client, {
            state: client.guestId ? roomForGuest(client.guestId) || activeRoom : activeRoom,
            type: 'room_state',
        });
    });
    updateRendererState();
};

const asVideoId = (value: string) => {
    const trimmed = value.trim();
    if (VIDEO_ID_REGEX.test(trimmed)) return trimmed;

    try {
        const url = new URL(trimmed);
        const fromParam = url.searchParams.get('v');
        if (fromParam && VIDEO_ID_REGEX.test(fromParam)) return fromParam;
        const shortMatch = url.pathname.match(/\/(?:shorts|embed|watch)\/([A-Za-z0-9_-]{11})/);
        if (shortMatch) return shortMatch[1];
        const youtuBeMatch = url.hostname.includes('youtu.be')
            ? url.pathname.match(/^\/([A-Za-z0-9_-]{11})/)
            : null;
        if (youtuBeMatch) return youtuBeMatch[1];
    } catch {
        return null;
    }

    return null;
};

const songVideoId = (song: Song): null | string => {
    const metadata = (song as Song & { youtubeMusic?: { videoId?: string } }).youtubeMusic;
    const candidate =
        metadata?.videoId ||
        (song.id?.startsWith('ytm:') ? song.id.slice(4) : undefined) ||
        asVideoId(song.id || '');

    return candidate && VIDEO_ID_REGEX.test(candidate) ? candidate : null;
};

const trackFromSong = (song: Song): null | PartyTrack => {
    const videoId = songVideoId(song);
    if (!videoId) return null;

    return {
        album: song.album,
        artist: song.artistName || 'Unknown artist',
        artworkUrl:
            song.imageUrl ||
            `https://i.ytimg.com/vi/${videoId}/default.jpg`,
        durationMs: Number(song.duration || 0),
        id: `youtube:${videoId}`,
        source: 'youtube',
        title: song.name || 'Untitled',
        videoId,
        ...defaultPartyTrackFields(),
    };
};

const resolveSuggestion = async (query: string): Promise<{ song: Song; track: PartyTrack }> => {
    const videoId = asVideoId(query);
    const song = videoId
        ? await youtubeMusic.getSongDetail(videoId)
        : ((await youtubeMusic.search(query)) as { songs?: Song[] }).songs?.[0];

    if (!song) throw new Error('No matching YouTube Music track found');

    const track = trackFromSong(song);
    if (!track) throw new Error('Track is not streamable through YouTube Music');

    return { song, track };
};

const searchTracks = async (query: string) => {
    const result = (await youtubeMusic.search(query)) as { songs?: Song[] };
    return (result.songs || [])
        .slice(0, 8)
        .map(trackFromSong)
        .filter((track): track is PartyTrack => Boolean(track));
};

const syncGuestStreamUrl = (track: PartyTrack, guestId: string) => {
    const token = signStreamToken(room!.code, guestId, track.id);
    return `/party/api/stream/${encodeURIComponent(track.id)}?token=${encodeURIComponent(token)}`;
};

const syncGuestArtworkUrl = (artworkUrl: null | string | undefined, guestId: string) => {
    if (!artworkUrl || !room) return artworkUrl;
    const token = signArtworkToken(room.code, guestId, artworkUrl);
    return `/party/api/artwork?token=${encodeURIComponent(token)}`;
};

const roomForGuest = (guestId: string): PartyRoomState | undefined => {
    if (!room) return undefined;
    const guest = room.guests.find((item) => item.id === guestId);

const hydrateTrack = (track: PartyTrack): PartyTrack => ({
        ...track,
        hostStreamUrl: undefined,
        id: track.id,
        artworkUrl: track.artworkUrl,
    });

    return {
        ...room,
        currentGuestCanControlPlayer: canGuestControl(guest),
        currentGuestCanReorderQueue: canGuestReorderQueue(guest),
        currentGuestId: guestId,
        nowPlaying: room.nowPlaying
            ? {
                  ...hydrateTrack(room.nowPlaying),
                  artworkUrl: syncGuestArtworkUrl(room.nowPlaying.artworkUrl, guestId),
                  streamUrl: syncGuestStreamUrl(room.nowPlaying, guestId),
              }
            : null,
        queue: room.queue.map((track) => ({
            ...hydrateTrack(track),
            artworkUrl: syncGuestArtworkUrl(track.artworkUrl, guestId),
        })),
        suggestions: room.suggestions.map((suggestion) => ({
            ...suggestion,
            track: suggestion.track
                ? {
                      ...hydrateTrack(suggestion.track),
                      artworkUrl: syncGuestArtworkUrl(suggestion.track.artworkUrl, guestId),
                  }
                : undefined,
        })),
        requestQueue: room.requestQueue.map((suggestion) => ({
            ...suggestion,
            track: suggestion.track
                ? {
                      ...hydrateTrack(suggestion.track),
                      artworkUrl: syncGuestArtworkUrl(suggestion.track.artworkUrl, guestId),
                  }
                : undefined,
        })),
    };
};

const makeGuest = (displayName: string, status: PartyGuest['status']): PartyGuest => ({
    avatarColor: hashAvatarColor(displayName),
    canControlPlayer: false,
    displayName,
    id: makeId(9),
    isChatMuted: false,
    joinedAt: Date.now(),
    role: 'listener',
    status,
});

const preserveQueueTrackMeta = (tracks: PartyTrack[]) => {
    if (!room) return tracks;
    const meta = new Map(room.queue.map((track) => [track.id, track]));
    return tracks.map((track) => {
        const previous = meta.get(track.id);
        return {
            ...track,
            suggestedBy: previous?.suggestedBy,
            suggestedByGuestId: previous?.suggestedByGuestId,
            votes: previous?.votes ?? 0,
            votedByGuestIds: previous?.votedByGuestIds ?? [],
        };
    });
};

const kickGuestById = (guestId: string, reason: string) => {
    if (!room) return false;
    const client = guestSockets.get(guestId);
    revokeSessionToken(guestId);
    room.guests = room.guests.filter((guest) => guest.id !== guestId);
    guestSockets.delete(guestId);
    if (client) {
        send(client, { reason, type: 'guest_kicked' });
        client.close(4004);
    }
    broadcastState();
    return true;
};

const liveSettingsFromConfig = (): PartyLiveSettings => ({
    allowGuestQueueReorder: settings.allowGuestQueueReorder,
    autoApproveJoins: settings.autoApproveJoins,
    autoApproveSuggestions: settings.autoApproveSuggestions,
    chatRateLimitEnabled: settings.chatRateLimitEnabled,
    controlMode: settings.controlMode,
    exposureMode: settings.exposureMode,
    maxGuests: settings.maxGuests,
    queueLocked: settings.queueLocked,
    roomTheme: settings.roomTheme,
    voteToSkipEnabled: settings.voteToSkipEnabled,
    voteToSkipThreshold: settings.voteToSkipThreshold,
});

const canGuestControl = (guest?: PartyGuest) =>
    Boolean(
        guest &&
            guest.status === 'approved' &&
            (settings.controlMode === 'all' ||
                guest.role === 'codj' ||
                (settings.controlMode === 'selected' && guest.canControlPlayer)),
    );

const canGuestReorderQueue = (guest?: PartyGuest) =>
    Boolean(
        !settings.queueLocked &&
        guest &&
            guest.status === 'approved' &&
            (canGuestControl(guest) || settings.allowGuestQueueReorder),
    );

const getTokenExpiresAt = () => {
    const startedAt = room?.sessionStartedAt || Date.now();
    return Math.min(startedAt + ROOM_TOKEN_MAX_MS, Date.now() + ROOM_TOKEN_MAX_MS);
};

const appendChatMessage = (message: PartyChatMessage) => {
    if (!room) return;
    room.chat.push(message);
    if (room.chat.length > CHAT_MAX_MESSAGES) {
        room.chat = room.chat.slice(-CHAT_MAX_MESSAGES);
    }
    broadcast({ message, type: 'chat_message' });
    sendToRenderer('party:chat-message', message);
    updateRendererState();
};

const getCachedYoutubeStreamUrl = async (videoId: string) => {
    const cached = youtubeStreamCache.get(videoId);
    if (cached && cached.expiresAt > Date.now()) return cached.url;

    const url = await youtubeMusic.getStreamUrl(videoId);
    youtubeStreamCache.set(videoId, { expiresAt: Date.now() + YOUTUBE_STREAM_CACHE_MS, url });
    return url;
};

const resetBufferGate = (trackId: string) => {
    guestReadyTrackIds.clear();
    pendingBufferTrackId = trackId;
    if (bufferGateTimer) clearTimeout(bufferGateTimer);
    bufferGateTimer = setTimeout(() => completeBufferGate(trackId), BUFFER_GATE_TIMEOUT_MS);
};

const completeBufferGate = (trackId: string) => {
    if (pendingBufferTrackId !== trackId) return;
    pendingBufferTrackId = undefined;
    if (bufferGateTimer) {
        clearTimeout(bufferGateTimer);
        bufferGateTimer = undefined;
    }
    guestReadyTrackIds.clear();
    broadcast({ trackId, type: 'buffer_complete' });
};

const safeEqual = (left: string, right: string) => {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

const signStreamToken = (roomCode: string, guestId: string, trackId: string) => {
    const payload = {
        expiresAt: getTokenExpiresAt(),
        guestId,
        roomCode,
        trackId,
    };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', signingSecret).update(body).digest('base64url');
    return `${body}.${signature}`;
};

const signArtworkToken = (roomCode: string, guestId: string, artworkUrl: string) => {
    const payload = {
        artworkUrl,
        expiresAt: getTokenExpiresAt(),
        guestId,
        roomCode,
    };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', signingSecret).update(body).digest('base64url');
    return `${body}.${signature}`;
};

const verifyStreamToken = (token: string, trackId: string) => {
    const [body, signature] = token.split('.');
    if (!body || !signature) return false;

    const expected = createHmac('sha256', signingSecret).update(body).digest('base64url');
    if (!safeEqual(signature, expected)) return false;

    try {
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as {
            expiresAt: number;
            guestId: string;
            roomCode: string;
            trackId: string;
        };
        return (
            room?.code === payload.roomCode &&
            payload.trackId === trackId &&
            payload.expiresAt > Date.now() &&
            Boolean(room.guests.find((guest) => guest.id === payload.guestId && guest.status === 'approved'))
        );
    } catch {
        return false;
    }
};

const verifyArtworkToken = (token: string) => {
    const [body, signature] = token.split('.');
    if (!body || !signature) return null;

    const expected = createHmac('sha256', signingSecret).update(body).digest('base64url');
    if (!safeEqual(signature, expected)) return null;

    try {
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as {
            artworkUrl: string;
            expiresAt: number;
            guestId: string;
            roomCode: string;
        };
        if (
            room?.code !== payload.roomCode ||
            payload.expiresAt <= Date.now() ||
            !room.guests.find((guest) => guest.id === payload.guestId && guest.status === 'approved')
        ) {
            return null;
        }

        const parsed = new URL(payload.artworkUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
        return parsed;
    } catch {
        return null;
    }
};

const PROXY_MAX_REDIRECTS = 5;

const pipeHttpProxy = (
    req: IncomingMessage | null,
    res: ServerResponse,
    targetUrl: URL,
    extraHeaders: Record<string, string> = {},
    redirectCount = 0,
) => {
    const client = targetUrl.protocol === 'https:' ? https : http;
    const headers: Record<string, string> = {
        Accept: '*/*',
        'Accept-Encoding': 'identity',
    };

    if (req?.headers.range) headers.Range = String(req.headers.range);
    if (req?.headers['user-agent']) headers['User-Agent'] = String(req.headers['user-agent']);

    const proxyReq = client.request(
        targetUrl,
        { headers, method: req?.method || 'GET' },
        (proxyRes) => {
            const status = proxyRes.statusCode || 0;
            const location = proxyRes.headers.location;

            // Follow redirects on the host so guests never receive loopback/LAN URLs.
            if (
                status >= 300 &&
                status < 400 &&
                location &&
                redirectCount < PROXY_MAX_REDIRECTS
            ) {
                proxyRes.resume();
                pipeHttpProxy(req, res, new URL(location, targetUrl), extraHeaders, redirectCount + 1);
                return;
            }

            res.statusCode = status || 200;
            for (const [key, value] of Object.entries(proxyRes.headers)) {
                const lowerKey = key.toLowerCase();
                if (lowerKey === 'location') continue;
                if (value !== undefined) res.setHeader(key, value);
            }
            for (const [key, value] of Object.entries(extraHeaders)) {
                res.setHeader(key, value);
            }
            proxyRes.pipe(res);
        },
    );

    proxyReq.on('error', (error) => {
        if (!res.headersSent) {
            res.statusCode = 502;
            res.setHeader('Content-Type', 'text/plain');
        }
        res.end(error.message);
    });
    proxyReq.end();
};

const proxyArtwork = (res: ServerResponse, token: string) => {
    const parsed = verifyArtworkToken(token);
    if (!parsed) {
        res.statusCode = 403;
        res.end('Forbidden');
        return;
    }

    pipeHttpProxy(null, res, parsed, {
        'Cache-Control': 'public, max-age=3600',
    });
};

const findTrack = (trackId: string) => {
    if (!room) return null;
    return [room.nowPlaying, ...room.queue]
        .filter((track): track is PartyTrack => Boolean(track))
        .find((track) => track.id === trackId);
};

const proxyTrackStream = async (
    req: IncomingMessage,
    res: ServerResponse,
    trackId: string,
    token: string,
) => {
    if (!verifyStreamToken(token, trackId)) {
        res.statusCode = 403;
        res.end('Forbidden');
        return;
    }

    const track = findTrack(trackId);
    const streamUrl =
        track?.hostStreamUrl ||
        (track?.videoId ? await getCachedYoutubeStreamUrl(track.videoId) : undefined);

    if (!streamUrl) {
        res.statusCode = 404;
        res.end('Stream unavailable');
        return;
    }

    pipeHttpProxy(req, res, new URL(streamUrl), {
        'Access-Control-Allow-Origin': '*',
    });
};

const startTunnel = async (port: number): Promise<PartyTunnelStatus> => {
    tunnelStatus = { mode: 'tunnel', state: 'starting' };
    updateRendererState();

    const binaryResult = await ensureCloudflared(settings.cloudflaredPath);
    if (!binaryResult.ok) {
        const status: PartyTunnelStatus = {
            error: binaryResult.error,
            mode: 'tunnel',
            state: 'unavailable',
        };
        tunnelStatus = status;
        if (room) room.tunnelStatus = status;
        updateRendererState();
        return status;
    }

    return new Promise((resolve) => {
        const binary = binaryResult.path;
        let settled = false;
        const finish = (status: PartyTunnelStatus) => {
            if (settled) return;
            settled = true;
            tunnelStatus = status;
            if (room) {
                room.tunnelStatus = tunnelStatus;
                if (status.url) {
                    room.publicUrl = status.url;
                    room.joinUrl = buildJoinUrl(status.url, room.code);
                }
            }
            updateRendererState();
            resolve(status);
        };

        tunnelProcess = spawn(binary, ['tunnel', '--url', `http://127.0.0.1:${port}`], {
            windowsHide: true,
        });

        const parseOutput = (chunk: Buffer) => {
            const text = chunk.toString();
            const match = text.match(/https:\/\/[-a-z0-9]+\.trycloudflare\.com/i);
            if (match) finish({ mode: 'tunnel', state: 'connected', url: match[0] });
        };

        tunnelProcess.stdout.on('data', parseOutput);
        tunnelProcess.stderr.on('data', parseOutput);
        tunnelProcess.on('error', (error) => {
            finish({
                error: error.message.includes('ENOENT')
                    ? 'Cloudflare Tunnel could not be started. Try LAN mode for same-WiFi listening.'
                    : error.message,
                mode: 'tunnel',
                state: 'unavailable',
            });
        });
        tunnelProcess.on('exit', () => {
            if (!settled) {
                finish({
                    error: 'Cloudflare Tunnel exited before publishing a URL',
                    mode: 'tunnel',
                    state: 'unavailable',
                });
            }
        });

        setTimeout(() => {
            if (!settled) {
                finish({
                    error: 'Timed out waiting for Cloudflare Tunnel URL',
                    mode: 'tunnel',
                    state: 'unavailable',
                });
            }
        }, 15000);
    });
};

const stopTunnel = () => {
    tunnelProcess?.kill();
    tunnelProcess = undefined;
    tunnelStatus = { mode: settings.exposureMode, state: 'disabled' };
};

const shutdownPartyServer = () => {
    wsServer?.clients.forEach((client) => client.close(4000));
    wsServer?.close();
    wsServer = undefined;
    server?.close();
    server = undefined;
};

export const shutdownParty = () => {
    if (room) {
        broadcast({ type: 'room_ended' });
    }
    stopTunnel();
    shutdownPartyServer();
    guestSockets.clear();
    approvedSessions.clear();
    guestSessionTokens.clear();
    approvedSuggestionSongs = new Map();
    youtubeStreamCache.clear();
    chatRateLimits.clear();
    suggestionRateLimits.clear();
    guestReadyTrackIds.clear();
    if (bufferGateTimer) clearTimeout(bufferGateTimer);
    bufferGateTimer = undefined;
    pendingBufferTrackId = undefined;
    room = undefined;
    resetVoiceState();
    sendToRenderer('party:state', null);
};

const handleGuestMessage = async (client: PartyWebSocket, message: PartyClientMessage) => {
    if (!room) {
        send(client, { message: 'Party room is not active', type: 'error' });
        return;
    }

    switch (message.type) {
        case 'control': {
            const guest = room.guests.find(
                (item) => item.id === client.guestId && item.status === 'approved',
            );

            if (!canGuestControl(guest)) {
                send(client, {
                    message: 'The DJ has not granted player control permissions.',
                    type: 'error',
                });
                return;
            }

            if ((message.action === 'add_next' || message.action === 'play_now') && !message.query) {
                send(client, { message: 'Choose a track first', type: 'error' });
                return;
            }

            if (message.action === 'seek') {
                const payload = message as Extract<PartyClientMessage, { type: 'control' }>;
                if (typeof payload.positionMs !== 'number') {
                    send(client, { message: 'Seek position is required', type: 'error' });
                    return;
                }

                sendToRenderer('party:control-command', {
                    action: 'seek',
                    guestDisplayName: guest?.displayName || 'Guest',
                    positionMs: payload.positionMs,
                } satisfies PartyControlCommand);
                break;
            }

            let song: Song | undefined;
            if (message.query) {
                const resolved = await resolveSuggestion(message.query);
                song = resolved.song;
            }

            sendToRenderer('party:control-command', {
                action: message.action,
                guestDisplayName: guest?.displayName || 'Guest',
                query: message.query,
                song,
            } satisfies PartyControlCommand);
            break;
        }
        case 'join': {
            if (message.sessionToken && !approvedSessions.has(message.sessionToken)) {
                // Stale token from a previous party session — ignore it.
                message = { ...message, sessionToken: undefined };
            }

            const sessionGuestId = message.sessionToken
                ? approvedSessions.get(message.sessionToken)
                : undefined;
            const existingGuest = sessionGuestId
                ? room.guests.find((guest) => guest.id === sessionGuestId)
                : undefined;

            if (message.sessionToken && sessionGuestId && !existingGuest) {
                approvedSessions.delete(message.sessionToken);
                guestSessionTokens.delete(sessionGuestId);
            }

            const approvedCount = room.guests.filter((guest) => guest.status === 'approved').length;

            if (!existingGuest && approvedCount >= settings.maxGuests) {
                send(client, { reason: 'Party is full', type: 'join_rejected' });
                return;
            }

            if (existingGuest) {
                existingGuest.avatarColor =
                    existingGuest.avatarColor || hashAvatarColor(existingGuest.displayName);
                existingGuest.isChatMuted = existingGuest.isChatMuted ?? false;
                existingGuest.role = existingGuest.role || 'listener';
            }

            const guest: PartyGuest =
                existingGuest ||
                makeGuest(message.displayName, settings.autoApproveJoins ? 'approved' : 'pending');

            if (!existingGuest) room.guests.push(guest);
            attachGuestSocket(guest.id, client);

            if (guest.status === 'approved') {
                notifyGuestApproved(client, guest);
            } else {
                notifyGuestPending(client, guest);
            }

            broadcastState();
            break;
        }
        case 'suggest': {
            const guest = room.guests.find(
                (item) => item.id === client.guestId && item.status === 'approved',
            );
            if (!guest) {
                send(client, { message: 'Join must be approved before suggesting tracks', type: 'error' });
                return;
            }

            if (room.settings.queueLocked) {
                send(client, { message: 'The queue is locked by the DJ', type: 'error' });
                return;
            }

            const lastSuggested = suggestionRateLimits.get(guest.id) || 0;
            if (Date.now() - lastSuggested < SUGGESTION_RATE_LIMIT_MS) {
                send(client, {
                    message: 'Wait before suggesting another track',
                    type: 'error',
                });
                return;
            }
            suggestionRateLimits.set(guest.id, Date.now());

            const suggestion: PartySuggestion = {
                createdAt: Date.now(),
                guestDisplayName: guest.displayName,
                guestId: guest.id,
                id: makeId(9),
                query: message.query,
                status: 'pending',
            };
            room.suggestions.unshift(suggestion);
            room.requestQueue = room.suggestions.filter((item) => item.status === 'pending' || item.status === 'approved');
            broadcast({ suggestion, type: 'suggestion_update' });
            broadcastState();

            try {
                const resolved = await resolveSuggestion(message.query);
                suggestion.track = {
                    ...resolved.track,
                    suggestedBy: guest.displayName,
                    suggestedByGuestId: guest.id,
                };
                approvedSuggestionSongs.set(suggestion.id, resolved.song);

                if (settings.autoApproveSuggestions) {
                    suggestion.status = 'approved';
                    sendToRenderer('party:suggestion-approved', {
                        song: resolved.song,
                        suggestionId: suggestion.id,
                    } satisfies PartyApprovedSuggestion);
                }
            } catch (error) {
                suggestion.error = (error as Error).message;
            }

            broadcast({ suggestion, type: 'suggestion_update' });
            room.requestQueue = room.suggestions.filter((item) => item.status === 'pending' || item.status === 'approved');
            broadcastState();
            break;
        }
        case 'search': {
            const guest = room.guests.find(
                (item) => item.id === client.guestId && item.status === 'approved',
            );
            if (!guest) {
                send(client, { message: 'Join must be approved before searching', type: 'error' });
                return;
            }
            const results = (await searchTracks(message.query)).map((track) => ({
                ...track,
                artworkUrl: syncGuestArtworkUrl(track.artworkUrl, guest.id),
            }));
            send(client, { results, type: 'search_results' });
            break;
        }
        case 'sync_request': {
            if (client.guestId) send(client, { state: roomForGuest(client.guestId) || room, type: 'sync' });
            break;
        }
        case 'chat_send': {
            const guest = room.guests.find(
                (item) => item.id === client.guestId && item.status === 'approved',
            );
            if (!guest) {
                send(client, { message: 'Join must be approved before chatting', type: 'error' });
                return;
            }

            if (guest.isChatMuted) {
                send(client, { message: 'You have been muted by the DJ', type: 'error' });
                return;
            }

            if (room.settings.chatRateLimitEnabled) {
                const lastSent = chatRateLimits.get(guest.id) || 0;
                if (Date.now() - lastSent < CHAT_RATE_LIMIT_MS) {
                    send(client, {
                        message: 'Slow down — wait a moment before sending another message',
                        type: 'error',
                    });
                    return;
                }
                chatRateLimits.set(guest.id, Date.now());
            }

            appendChatMessage({
                body: message.body.trim(),
                id: makeId(9),
                role: 'guest',
                senderId: guest.id,
                senderName: guest.displayName,
                sentAt: Date.now(),
            });
            break;
        }
        case 'reorder_queue': {
            const payload = message as Extract<PartyClientMessage, { type: 'reorder_queue' }>;
            const guest = room.guests.find(
                (item) => item.id === client.guestId && item.status === 'approved',
            );
            if (room.settings.queueLocked) {
                send(client, { message: 'The queue is locked by the DJ', type: 'error' });
                return;
            }
            if (!canGuestReorderQueue(guest)) {
                send(client, {
                    message: 'The DJ has not granted queue reorder permissions.',
                    type: 'error',
                });
                return;
            }

            if (!room.queue.some((track) => track.id === payload.trackId)) {
                send(client, { message: 'Track is not in the queue', type: 'error' });
                return;
            }

            sendToRenderer('party:reorder-queue', {
                guestDisplayName: guest?.displayName || 'Guest',
                toIndex: payload.toIndex,
                trackId: payload.trackId,
            } satisfies PartyReorderQueueCommand);
            break;
        }
        case 'vote_track': {
            const payload = message as Extract<PartyClientMessage, { type: 'vote_track' }>;
            const guest = room.guests.find(
                (item) => item.id === client.guestId && item.status === 'approved',
            );
            if (!guest) {
                send(client, { message: 'Join must be approved before voting', type: 'error' });
                return;
            }
            if (room.settings.queueLocked) {
                send(client, { message: 'The queue is locked by the DJ', type: 'error' });
                return;
            }

            const track = room.queue.find((item) => item.id === payload.trackId);
            if (!track) {
                send(client, { message: 'Track is not in the queue', type: 'error' });
                return;
            }

            const votedIndex = track.votedByGuestIds.indexOf(guest.id);
            if (votedIndex >= 0) {
                track.votedByGuestIds.splice(votedIndex, 1);
                track.votes = Math.max(0, track.votes - 1);
            } else {
                track.votedByGuestIds.push(guest.id);
                track.votes += 1;
            }

            broadcastState();
            break;
        }
        case 'leave': {
            if (client.guestId) kickGuestById(client.guestId, 'Guest left the room');
            break;
        }
        case 'voice_answer': {
            relayVoiceToHost({ sdp: message.sdp, type: 'voice_answer', guestId: client.guestId }, sendToRenderer);
            break;
        }
        case 'voice_ice': {
            relayVoiceToHost(
                {
                    candidate: message.candidate,
                    guestId: client.guestId,
                    type: 'voice_ice',
                },
                sendToRenderer,
            );
            break;
        }
        case 'pong':
            break;
        case 'ready': {
            if (!client.guestId || message.trackId !== room.nowPlaying?.id) break;

            if (pendingBufferTrackId && message.trackId === pendingBufferTrackId) {
                guestReadyTrackIds.add(client.guestId);

                const approvedGuestIds = room.guests
                    .filter((item) => item.status === 'approved')
                    .map((item) => item.id);
                const allReady =
                    approvedGuestIds.length === 0 ||
                    approvedGuestIds.every((id) => guestReadyTrackIds.has(id));

                if (allReady) completeBufferGate(message.trackId);
                break;
            }

            // Joined mid-track or reconnected after the buffer gate already completed.
            send(client, { trackId: message.trackId, type: 'buffer_complete' });
            break;
        }
    }
};

const enablePartyServer = async () =>
    new Promise<void>((resolve, reject) => {
        server = createServer(async (req, res) => {
            try {
                const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
                const streamMatch = reqUrl.pathname.match(/^\/party\/api\/stream\/(.+)$/);
                if (streamMatch) {
                    await proxyTrackStream(
                        req,
                        res,
                        decodeURIComponent(streamMatch[1]),
                        reqUrl.searchParams.get('token') || '',
                    );
                    return;
                }

                if (reqUrl.pathname === '/party/api/artwork') {
                    proxyArtwork(res, reqUrl.searchParams.get('token') || '');
                    return;
                }

                if (reqUrl.pathname === '/' || reqUrl.pathname.startsWith('/party/')) {
                    await serveFile('index.html', res);
                    return;
                }

                if (reqUrl.pathname.match(/^\/[A-Za-z0-9_.-]+\.(css|ico|js)$/)) {
                    await serveFile(reqUrl.pathname.slice(1), res);
                    return;
                }

                res.statusCode = 404;
                res.end('Not Found');
            } catch (error) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'text/plain');
                res.end((error as Error).message);
            }
        });

        server.once('error', reject);
        server.listen(settings.port, settings.exposureMode === 'lan' ? '0.0.0.0' : '127.0.0.1', () => {
            if (!server) return;
            wsServer = new WebSocketServer<typeof PartyWebSocket>({ server });
            wsServer.on('connection', (client: PartyWebSocket) => {
                client.alive = true;

                client.on('message', (raw) => {
                    let parsed: unknown;
                    try {
                        parsed = JSON.parse(raw.toString());
                    } catch {
                        send(client, { message: 'Invalid JSON message', type: 'error' });
                        return;
                    }

                    const result = CLIENT_MESSAGE_SCHEMA.safeParse(parsed);
                    if (!result.success) {
                        send(client, { message: 'Invalid party message', type: 'error' });
                        return;
                    }
                    handleGuestMessage(client, result.data as PartyClientMessage).catch((error) => {
                        send(client, { message: (error as Error).message, type: 'error' });
                    });
                });

                client.on('pong', () => {
                    client.alive = true;
                });

                client.on('close', () => {
                    if (client.guestId) guestSockets.delete(client.guestId);
                });
            });

            const interval = setInterval(() => {
                wsServer?.clients.forEach((client) => {
                    if (!client.alive) {
                        client.terminate();
                        return;
                    }
                    client.alive = false;
                    client.ping();
                    send(client, { type: 'ping' });
                });
            }, PING_TIMEOUT_MS);

            wsServer.once('close', () => clearInterval(interval));
            resolve();
        });
    });

ipcMain.handle('party:start', async (_event, config: Partial<PartySettings>): Promise<PartyStartResult> => {
    shutdownParty();

    settings = {
        ...DEFAULT_SETTINGS,
        ...config,
        allowGuestQueueReorder: config.allowGuestQueueReorder ?? DEFAULT_SETTINGS.allowGuestQueueReorder,
        autoApproveSuggestions: config.autoApproveSuggestions ?? DEFAULT_SETTINGS.autoApproveSuggestions,
        maxGuests: Math.max(1, Math.min(Number(config.maxGuests || DEFAULT_SETTINGS.maxGuests), 100)),
        port: Number(config.port || DEFAULT_SETTINGS.port),
        queueLocked: config.queueLocked ?? DEFAULT_SETTINGS.queueLocked,
        roomTheme: config.roomTheme ?? DEFAULT_SETTINGS.roomTheme,
        voteToSkipEnabled: config.voteToSkipEnabled ?? DEFAULT_SETTINGS.voteToSkipEnabled,
        voteToSkipThreshold: config.voteToSkipThreshold ?? DEFAULT_SETTINGS.voteToSkipThreshold,
    };

    signingSecret = randomBytes(32).toString('base64url');
    const code = makeRoomCode();
    const localBase =
        settings.exposureMode === 'lan'
            ? getLanUrls(settings.port)[0] || `http://127.0.0.1:${settings.port}`
            : `http://127.0.0.1:${settings.port}`;

    tunnelStatus =
        settings.exposureMode === 'tunnel'
            ? { mode: 'tunnel', state: 'starting' }
            : { mode: 'lan', state: 'disabled' };
    room = {
        chat: [],
        code,
        guests: [],
        hostDisplayName: settings.hostDisplayName || DEFAULT_SETTINGS.hostDisplayName,
        hostMicActive: false,
        isActive: true,
        joinUrl: buildJoinUrl(localBase, code),
        nowPlaying: null,
        playbackStatus: PlayerStatus.PAUSED,
        positionMs: 0,
        publicUrl: localBase,
        queue: [],
        requestQueue: [],
        serverTimeMs: Date.now(),
        sessionStartedAt: Date.now(),
        settings: liveSettingsFromConfig(),
        suggestions: [],
        tunnelStatus,
    };

    try {
        await enablePartyServer();
        updateRendererState();
        if (settings.exposureMode === 'tunnel') {
            startTunnel(settings.port).then(() => broadcastState());
        }
        return { state: room };
    } catch (error) {
        shutdownParty();
        return { error: (error as Error).message };
    }
});

ipcMain.handle('party:update-settings', (_event, updates: Partial<PartySettings>) => {
    if (!room) return false;

    if (typeof updates.autoApproveJoins === 'boolean') {
        settings.autoApproveJoins = updates.autoApproveJoins;
        room.settings.autoApproveJoins = updates.autoApproveJoins;

        if (updates.autoApproveJoins) {
            room.guests.forEach((guest) => {
                if (guest.status === 'pending') {
                    guest.status = 'approved';
                    const client = guestSockets.get(guest.id);
                    if (client) notifyGuestApproved(client, guest);
                }
            });
        }
    }

    if (
        updates.controlMode === 'all' ||
        updates.controlMode === 'host' ||
        updates.controlMode === 'selected'
    ) {
        settings.controlMode = updates.controlMode;
        room.settings.controlMode = updates.controlMode;
    }

    if (typeof updates.allowGuestQueueReorder === 'boolean') {
        settings.allowGuestQueueReorder = updates.allowGuestQueueReorder;
        room.settings.allowGuestQueueReorder = updates.allowGuestQueueReorder;
    }

    if (typeof updates.hostDisplayName === 'string' && updates.hostDisplayName.trim()) {
        settings.hostDisplayName = updates.hostDisplayName.trim();
        room.hostDisplayName = settings.hostDisplayName;
    }

    if (typeof updates.maxGuests === 'number') {
        settings.maxGuests = Math.max(1, Math.min(updates.maxGuests, 100));
        room.settings.maxGuests = settings.maxGuests;
    }

    if (typeof updates.autoApproveSuggestions === 'boolean') {
        settings.autoApproveSuggestions = updates.autoApproveSuggestions;
        room.settings.autoApproveSuggestions = updates.autoApproveSuggestions;
    }

    if (typeof updates.chatRateLimitEnabled === 'boolean') {
        settings.chatRateLimitEnabled = updates.chatRateLimitEnabled;
        room.settings.chatRateLimitEnabled = updates.chatRateLimitEnabled;
        if (!updates.chatRateLimitEnabled) {
            chatRateLimits.clear();
        }
    }

    if (typeof updates.queueLocked === 'boolean') {
        settings.queueLocked = updates.queueLocked;
        room.settings.queueLocked = updates.queueLocked;
    }

    if (updates.roomTheme === 'dark' || updates.roomTheme === 'dynamic') {
        settings.roomTheme = updates.roomTheme;
        room.settings.roomTheme = updates.roomTheme;
    }

    if (typeof updates.voteToSkipEnabled === 'boolean') {
        settings.voteToSkipEnabled = updates.voteToSkipEnabled;
        room.settings.voteToSkipEnabled = updates.voteToSkipEnabled;
    }

    if (typeof updates.voteToSkipThreshold === 'number') {
        settings.voteToSkipThreshold = Math.max(0, Math.min(updates.voteToSkipThreshold, 1));
        room.settings.voteToSkipThreshold = settings.voteToSkipThreshold;
    }

    broadcastState();
    return true;
});

ipcMain.handle('party:set-guest-control', (_event, guestId: string, canControlPlayer: boolean) => {
    const guest = room?.guests.find((item) => item.id === guestId);
    if (!room || !guest) return false;

    guest.canControlPlayer = canControlPlayer;
    if (canControlPlayer && settings.controlMode === 'selected') {
        guest.role = 'codj';
    } else if (!canControlPlayer && guest.role === 'codj') {
        guest.role = 'listener';
    }
    broadcastState();
    return true;
});

ipcMain.handle('party:kick-guest', (_event, guestId: string) => kickGuestById(guestId, 'Removed by the DJ'));

ipcMain.handle('party:kick-all-guests', () => {
    if (!room) return false;
    [...room.guests.filter((guest) => guest.status === 'approved').map((guest) => guest.id)].forEach(
        (guestId) => kickGuestById(guestId, 'Removed by the DJ'),
    );
    return true;
});

ipcMain.handle('party:mute-guest-chat', (_event, guestId: string, muted: boolean) => {
    const guest = room?.guests.find((item) => item.id === guestId);
    if (!room || !guest) return false;
    guest.isChatMuted = muted;
    broadcastState();
    return true;
});

ipcMain.handle('party:mute-all-chat', (_event, muted: boolean) => {
    if (!room) return false;
    room.guests.forEach((guest) => {
        guest.isChatMuted = muted;
    });
    broadcastState();
    return true;
});

ipcMain.handle('party:promote-codj', (_event, guestId: string) => {
    const guest = room?.guests.find((item) => item.id === guestId);
    if (!room || !guest || guest.status !== 'approved') return false;
    guest.role = 'codj';
    guest.canControlPlayer = true;
    broadcastState();
    return true;
});

ipcMain.handle('party:approve-suggestion-next', (_event, suggestionId: string) => {
    const suggestion = room?.suggestions.find((item) => item.id === suggestionId);
    const song = approvedSuggestionSongs.get(suggestionId);
    if (!room || !suggestion || !song) return false;

    suggestion.status = 'approved';
    room.requestQueue = room.suggestions.filter((item) => item.status === 'pending' || item.status === 'approved');
    sendToRenderer('party:suggestion-approved', {
        insertAtFront: true,
        song,
        suggestionId,
    } satisfies PartyApprovedSuggestion);
    broadcastState();
    return true;
});

ipcMain.on('party:voice-start', () => {
    if (!room) return;
    room.hostMicActive = true;
    setHostMicActive(true);
    updateRendererState();
});

ipcMain.on('party:voice-stop', () => {
    if (!room) return;
    room.hostMicActive = false;
    setHostMicActive(false);
    updateRendererState();
});

ipcMain.on('party:voice-signal', (_event, payload: Record<string, unknown>) => {
    if (!room) return;
    const guestId = typeof payload.guestId === 'string' ? payload.guestId : undefined;
    if (guestId) {
        const client = guestSockets.get(guestId);
        if (client) send(client, payload as PartyServerMessage);
        return;
    }
    guestSockets.forEach((client, id) => {
        if (client.readyState === WebSocket.OPEN) {
            send(client, { ...payload, guestId: id } as PartyServerMessage);
        }
    });
});

ipcMain.handle('party:stop', () => {
    shutdownParty();
    return null;
});

ipcMain.handle('party:approve-join', (_event, guestId: string) => {
    const guest = room?.guests.find((item) => item.id === guestId);
    const client = guestSockets.get(guestId);
    if (!room || !guest) return false;

    guest.status = 'approved';
    if (client) notifyGuestApproved(client, guest);
    broadcastState();
    return true;
});

ipcMain.handle('party:reject-join', (_event, guestId: string) => {
    const guest = room?.guests.find((item) => item.id === guestId);
    const client = guestSockets.get(guestId);
    if (!room || !guest) return false;
    revokeSessionToken(guestId);
    room.guests = room.guests.filter((item) => item.id !== guestId);
    if (client) {
        send(client, { reason: 'Host rejected the join request', type: 'join_rejected' });
        client.close(4003);
    }
    broadcastState();
    return true;
});

ipcMain.handle('party:approve-suggestion', (_event, suggestionId: string) => {
    const suggestion = room?.suggestions.find((item) => item.id === suggestionId);
    const song = approvedSuggestionSongs.get(suggestionId);
    if (!room || !suggestion || !song) return false;

    suggestion.status = 'approved';
    room.requestQueue = room.suggestions.filter((item) => item.status === 'pending' || item.status === 'approved');
    sendToRenderer('party:suggestion-approved', {
        song,
        suggestionId,
    } satisfies PartyApprovedSuggestion);
    broadcastState();
    return true;
});

ipcMain.handle('party:reject-suggestion', (_event, suggestionId: string) => {
    const suggestion = room?.suggestions.find((item) => item.id === suggestionId);
    if (!suggestion) return false;

    suggestion.status = 'rejected';
    if (room) {
        room.requestQueue = room.suggestions.filter((item) => item.status === 'pending' || item.status === 'approved');
    }
    broadcast({ suggestion, type: 'suggestion_update' });
    broadcastState();
    return true;
});

ipcMain.on('party:host-state', (_event, snapshot: PartyHostSnapshot) => {
    if (!room) return;

    const previousTrackId = room.nowPlaying?.id;
    room.nowPlaying = snapshot.nowPlaying
        ? {
              ...defaultPartyTrackFields(),
              ...room.nowPlaying,
              ...snapshot.nowPlaying,
              votedByGuestIds: room.nowPlaying?.votedByGuestIds ?? [],
              votes: room.nowPlaying?.votes ?? 0,
          }
        : null;
    room.playbackStatus = snapshot.playbackStatus;
    room.positionMs = snapshot.positionMs;
    room.queue = preserveQueueTrackMeta(
        snapshot.queue.map((track) => ({ ...defaultPartyTrackFields(), ...track })),
    );
    room.serverTimeMs = Date.now();

    if (snapshot.nowPlaying?.id && snapshot.nowPlaying.id !== previousTrackId) {
        resetBufferGate(snapshot.nowPlaying.id);
    }

    const activeRoom = room;
    wsServer?.clients.forEach((client) => {
        send(client, {
            state: client.guestId ? roomForGuest(client.guestId) || activeRoom : activeRoom,
            type: 'sync',
        });
    });
    updateRendererState();
});

ipcMain.on('party:send-chat', (_event, body: string) => {
    if (!room) return;
    const trimmed = body.trim();
    if (!trimmed || trimmed.length > CHAT_MAX_BODY_LENGTH) return;

    appendChatMessage({
        body: trimmed,
        id: makeId(9),
        role: 'host',
        senderId: 'host',
        senderName: room.hostDisplayName,
        sentAt: Date.now(),
    });
});
