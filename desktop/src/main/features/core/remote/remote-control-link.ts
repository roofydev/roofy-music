import { networkInterfaces } from 'os';

export type RemoteControlLinkConfig = {
    password: string;
    port: number;
};

export type RemoteControlLinks = {
    /** Best URL to open or encode in a QR code (LAN when available). */
    primary: string;
    localhost: string;
    lan?: string;
};

const PRIVATE_IPV4 =
    /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/;

const VIRTUAL_INTERFACE =
    /^(lo|loopback|docker|veth|br-|vmware|virtualbox|vethernet|wsl|hyper-v|npcap|tailscale|zerotier|hamachi|nordlynx|wireguard|tun|tap)/i;

const PREFERRED_INTERFACE = /(wi-?fi|wlan|ethernet|eth|en\d|local area connection)/i;

const isIPv4Address = (family: string | number) => family === 'IPv4' || family === 4;

export const getLanHost = () => {
    const configured = process.env.ROOFY_LAN_HOST?.trim();
    if (configured) return configured;

    const scored: Array<{ address: string; score: number }> = [];

    for (const [name, entries] of Object.entries(networkInterfaces())) {
        if (VIRTUAL_INTERFACE.test(name)) continue;

        for (const entry of entries || []) {
            if (!isIPv4Address(entry.family) || entry.internal) continue;

            let score = 0;
            if (PRIVATE_IPV4.test(entry.address)) score += 20;
            if (PREFERRED_INTERFACE.test(name)) score += 10;
            if (entry.address.startsWith('169.254.')) score -= 30;

            scored.push({ address: entry.address, score });
        }
    }

    return [...new Map(scored.map((item) => [item.address, item])).values()]
        .sort((left, right) => right.score - left.score)
        .map((item) => item.address)[0];
};

/** Signed link — no username/password typing; token is checked server-side. */
export const buildRemoteControlUrl = (host: string, config: RemoteControlLinkConfig) => {
    const url = new URL(`http://${host}:${config.port}/`);
    if (config.password) {
        url.searchParams.set('token', config.password);
    }
    return url.toString();
};

export const getRemoteControlLinks = (config: RemoteControlLinkConfig): RemoteControlLinks => {
    const localhost = buildRemoteControlUrl('127.0.0.1', config);
    const lanHost = getLanHost();
    const lan = lanHost ? buildRemoteControlUrl(lanHost, config) : undefined;

    return {
        lan,
        localhost,
        primary: lan || localhost,
    };
};

export const REMOTE_SESSION_COOKIE = 'roofy_remote_token';

export const readRemoteAccessToken = (requestUrl?: string) => {
    if (!requestUrl) return undefined;
    try {
        const url = new URL(requestUrl, 'http://localhost');
        return url.searchParams.get('token') || undefined;
    } catch {
        return undefined;
    }
};

/** Session cookie set after opening a tokenized link so JS/CSS/WebSocket load without Basic auth. */
export const readRemoteSessionCookie = (cookieHeader?: string) => {
    if (!cookieHeader?.trim()) return undefined;

    for (const part of cookieHeader.split(';')) {
        const [name, ...valueParts] = part.trim().split('=');
        if (name !== REMOTE_SESSION_COOKIE) continue;

        const value = valueParts.join('=').trim();
        if (!value) return undefined;

        try {
            return decodeURIComponent(value);
        } catch {
            return value;
        }
    }

    return undefined;
};

export const buildRemoteSessionCookie = (token: string) =>
    `${REMOTE_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax`;

/** Pathname only — Node passes full URL including `?token=` query on `/`. */
export const resolveRemoteRequestPath = (requestUrl?: string): string => {
    if (!requestUrl) return '/';

    try {
        return new URL(requestUrl, 'http://localhost').pathname || '/';
    } catch {
        const raw = requestUrl.split('?')[0]?.split('#')[0] || '/';
        return raw.startsWith('/') ? raw : `/${raw}`;
    }
};
