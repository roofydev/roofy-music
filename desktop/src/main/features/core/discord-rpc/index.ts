import { Client, SetActivity } from '@xhayper/discord-rpc';
import { ipcMain } from 'electron';

const ROOFY_DISCORD_APPLICATION_ID = '1507206067015254097';
const MAX_ARTWORK_UPLOAD_SIZE = 8 * 1024 * 1024;

let client: Client | null = null;
const artworkUploadCache = new Map<string, string>();

type DiscordWebhookMessage = {
    attachments?: Array<{
        proxy_url?: string;
        url?: string;
    }>;
};

type UguuUploadResponse = {
    files?: Array<{
        url?: string;
    }>;
    success?: boolean;
};

type UploadArtworkArgs = {
    cacheKey?: string;
    imageUrl: string;
    webhookUrl?: string;
};

const getDiscordWebhookUrl = (value: string) => {
    try {
        const url = new URL(value);
        const hostname = url.hostname.toLowerCase();
        const isDiscordHost = hostname === 'discord.com' || hostname === 'discordapp.com';

        if (!isDiscordHost || !url.pathname.startsWith('/api/webhooks/')) {
            return null;
        }

        url.search = '';
        url.searchParams.set('wait', 'true');

        return url;
    } catch {
        return null;
    }
};

const getImageExtension = (contentType: string) => {
    if (contentType.includes('png')) return 'png';
    if (contentType.includes('webp')) return 'webp';
    if (contentType.includes('gif')) return 'gif';
    return 'jpg';
};

const toBlobPart = (imageData: Uint8Array) => new Uint8Array(imageData).buffer;

const uploadArtworkToDiscordWebhook = async (
    webhookUrlValue: string,
    imageData: Uint8Array,
    contentType: string,
) => {
    const webhookUrl = getDiscordWebhookUrl(webhookUrlValue);

    if (!webhookUrl) {
        return null;
    }

    const formData = new FormData();
    formData.append(
        'payload_json',
        JSON.stringify({
            content: 'Roofy Music artwork cache',
            username: 'Roofy Music',
        }),
    );
    formData.append(
        'files[0]',
        new Blob([toBlobPart(imageData)], { type: contentType }),
        `roofy-artwork.${getImageExtension(contentType)}`,
    );

    const uploadResponse = await fetch(webhookUrl, {
        body: formData,
        method: 'POST',
    });

    if (!uploadResponse.ok) {
        return null;
    }

    const message = (await uploadResponse.json()) as DiscordWebhookMessage;

    return message.attachments?.[0]?.url || message.attachments?.[0]?.proxy_url || null;
};

const uploadArtworkToUguu = async (imageData: Uint8Array, contentType: string) => {
    const formData = new FormData();

    formData.append(
        'files[]',
        new Blob([toBlobPart(imageData)], { type: contentType }),
        `cover.${getImageExtension(contentType)}`,
    );

    const uploadResponse = await fetch('https://uguu.se/upload', {
        body: formData,
        method: 'POST',
    });

    if (!uploadResponse.ok) {
        return null;
    }

    const result = (await uploadResponse.json()) as UguuUploadResponse;

    if (!result.success) {
        return null;
    }

    return result.files?.[0]?.url || null;
};

const uploadArtwork = async (args: UploadArtworkArgs) => {
    const cacheKey = args.cacheKey || args.imageUrl;
    const cachedUrl = artworkUploadCache.get(cacheKey);

    if (cachedUrl) {
        return cachedUrl;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
        const imageResponse = await fetch(args.imageUrl, { signal: controller.signal });

        if (!imageResponse.ok) {
            return null;
        }

        const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';

        if (!contentType.startsWith('image/')) {
            return null;
        }

        const imageData = new Uint8Array(await imageResponse.arrayBuffer());

        if (imageData.byteLength === 0 || imageData.byteLength > MAX_ARTWORK_UPLOAD_SIZE) {
            return null;
        }

        const attachmentUrl = args.webhookUrl
            ? await uploadArtworkToDiscordWebhook(args.webhookUrl, imageData, contentType)
            : await uploadArtworkToUguu(imageData, contentType);

        if (!attachmentUrl) {
            return null;
        }

        artworkUploadCache.set(cacheKey, attachmentUrl);

        return attachmentUrl;
    } catch {
        return null;
    } finally {
        clearTimeout(timeout);
    }
};

const createClient = async (clientId?: string) => {
    client = new Client({
        clientId: clientId || ROOFY_DISCORD_APPLICATION_ID,
    });

    await client.login();

    return client;
};

const isConnected = () => {
    return client?.isConnected;
};

const setActivity = (activity: SetActivity) => {
    if (client) {
        client.user?.setActivity({
            ...activity,
        });
    }
};

const clearActivity = () => {
    if (client) {
        client.user?.clearActivity();
    }
};

const quit = () => {
    if (client) {
        client?.destroy();
    }
};

ipcMain.handle('discord-rpc-initialize', async (_event, clientId?: string) => {
    await createClient(clientId);
});

ipcMain.handle('discord-rpc-is-connected', () => {
    return isConnected();
});

ipcMain.handle('discord-rpc-set-activity', (_event, activity: SetActivity) => {
    if (client) {
        setActivity(activity);
    }
});

ipcMain.handle('discord-rpc-clear-activity', () => {
    if (client) {
        clearActivity();
    }
});

ipcMain.handle('discord-rpc-quit', () => {
    quit();
});

ipcMain.handle('discord-rpc-upload-artwork', async (_event, args: UploadArtworkArgs) => {
    return uploadArtwork(args);
});

export const discordRpc = {
    clearActivity,
    createClient,
    isConnected,
    quit,
    setActivity,
    uploadArtwork,
};
