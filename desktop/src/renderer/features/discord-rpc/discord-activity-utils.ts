import type { SetActivity } from '@xhayper/discord-rpc';

import i18n from '/@/i18n/i18n';
import { QueueSong } from '/@/shared/types/domain-types';
import { PartyRoomState } from '/@/shared/types/party-types';
import {
    extractYoutubeVideoId,
    isYoutubeVideoId,
} from '/@/shared/utils/youtube-video-id';

const DISCORD_MAX_BUTTONS = 2;
const MAX_URL_LENGTH = 256;

export const buildYoutubeMusicWatchUrl = (videoId: string) =>
    `https://music.youtube.com/watch?v=${encodeURIComponent(videoId)}`;

export const resolveYoutubeMusicVideoId = (song: QueueSong | undefined): string | undefined => {
    if (!song) {
        return undefined;
    }

    const candidates = [
        song.youtubeMusic?.videoId,
        extractYoutubeVideoId(song.youtubeMusic?.watchUrl),
        extractYoutubeVideoId(song.id),
        extractYoutubeVideoId(song.path),
        extractYoutubeVideoId(song.comment),
    ];

    return candidates.find((candidate) => isYoutubeVideoId(candidate));
};

export const getYoutubeMusicWatchUrl = (song: QueueSong | undefined): null | string => {
    const videoId = resolveYoutubeMusicVideoId(song);

    if (!videoId) {
        return null;
    }

    const watchUrl = song?.youtubeMusic?.watchUrl?.trim();
    if (watchUrl) {
        try {
            const url = new URL(watchUrl);
            const hostname = url.hostname.toLowerCase();

            if (hostname === 'music.youtube.com') {
                return url.toString();
            }

            if (hostname === 'youtube.com' || hostname === 'www.youtube.com') {
                return buildYoutubeMusicWatchUrl(videoId);
            }
        } catch {
            /* fall through */
        }
    }

    return buildYoutubeMusicWatchUrl(videoId);
};

export const resolveYoutubeMusicWatchUrl = async (
    song: QueueSong | undefined,
): Promise<null | string> => {
    const directUrl = getYoutubeMusicWatchUrl(song);
    if (directUrl) {
        return directUrl;
    }

    if (!song || typeof window === 'undefined' || !window.api?.localFirst?.getVideoMetadata) {
        return null;
    }

    try {
        const metadata = await window.api.localFirst.getVideoMetadata({
            path: song.path,
            songId: song.id,
            youtubeMusic: song.youtubeMusic,
        });

        const videoId =
            (isYoutubeVideoId(metadata?.videoId) ? metadata.videoId : undefined) ||
            extractYoutubeVideoId(metadata?.sourceUrl);

        return videoId ? buildYoutubeMusicWatchUrl(videoId) : null;
    } catch {
        return null;
    }
};

export const applyYoutubeMusicDiscordLinks = (
    activity: SetActivity,
    watchUrl: null | string,
) => {
    if (!watchUrl || watchUrl.length > MAX_URL_LENGTH) {
        return;
    }

    activity.detailsUrl = watchUrl;
    activity.largeImageUrl = watchUrl;
};

export const applyDiscordActivityButtons = (
    activity: SetActivity,
    options: {
        partyJoinUrl?: null | string;
        watchUrl?: null | string;
    },
) => {
    const buttons: NonNullable<SetActivity['buttons']> = [];

    if (options.watchUrl) {
        buttons.push({
            label: i18n.t('setting.discordListenNow'),
            url: options.watchUrl,
        });
    }

    if (options.partyJoinUrl) {
        buttons.push({
            label: i18n.t('setting.discordListenTogether'),
            url: options.partyJoinUrl,
        });
    }

    if (buttons.length) {
        activity.buttons = buttons.slice(0, DISCORD_MAX_BUTTONS);
    }
};

export const applyPartyDiscordActivity = (
    activity: SetActivity,
    partyState: null | PartyRoomState | undefined,
    options?: {
        watchUrl?: null | string;
    },
) => {
    const joinUrl = getPublicPartyJoinUrl(partyState);

    if (joinUrl && partyState) {
        activity.partyId = partyState.code;
        const partySize = getPartyDiscordSize(partyState);

        activity.partySize = partySize.size;
        activity.partyMax = partySize.max;
    }

    applyDiscordActivityButtons(activity, {
        partyJoinUrl: joinUrl,
        watchUrl: options?.watchUrl,
    });
};

export const getPublicPartyJoinUrl = (partyState: null | PartyRoomState | undefined) => {
    if (
        !partyState?.isActive ||
        partyState.tunnelStatus.mode !== 'tunnel' ||
        partyState.tunnelStatus.state !== 'connected'
    ) {
        return null;
    }

    const joinUrl = partyState.joinUrl.startsWith('https://')
        ? partyState.joinUrl
        : partyState.tunnelStatus.url
          ? `${partyState.tunnelStatus.url.replace(/\/$/, '')}/party/${encodeURIComponent(partyState.code)}`
          : '';

    if (!joinUrl) {
        return null;
    }

    try {
        const url = new URL(joinUrl);
        if (url.protocol !== 'https:') {
            return null;
        }

        return url.toString();
    } catch {
        return null;
    }
};

const getPartyDiscordSize = (partyState: PartyRoomState) => ({
    max: partyState.settings.maxGuests + 1,
    size: partyState.guests.filter((guest) => guest.status === 'approved').length + 1,
});
