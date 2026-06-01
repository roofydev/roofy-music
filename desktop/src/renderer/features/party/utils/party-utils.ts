import { QueueSong } from '/@/shared/types/domain-types';

import { hashAvatarColor } from '/@/shared/party-utils';

export { hashAvatarColor };

export const guestInitials = (displayName: string) => {
    const parts = displayName.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return displayName.slice(0, 2).toUpperCase();
};

export const formatPartyUptime = (sessionStartedAt: number, now = Date.now()) => {
    const elapsedMs = Math.max(0, now - sessionStartedAt);
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

export const formatTrackDuration = (durationMs?: number) => {
    if (!durationMs || durationMs < 0 || !Number.isFinite(durationMs)) return '0:00';
    const totalSeconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export const formatChatTime = (sentAt: number) => {
    const date = new Date(sentAt);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export const videoIdFromSong = (song: QueueSong | undefined): null | string => {
    const metadata = (song as (QueueSong & { youtubeMusic?: { videoId?: string } }) | undefined)
        ?.youtubeMusic;
    const candidate =
        metadata?.videoId ||
        (song?.id?.startsWith('ytm:') ? song.id.slice(4) : undefined) ||
        song?.id;
    return candidate && /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : null;
};

export const partyTrackIdFromSong = (song: QueueSong): string => {
    const videoId = videoIdFromSong(song);
    if (videoId) return `youtube:${videoId}`;
    return `host:${song._serverId}:${song._uniqueId || song.id}`;
};

export const sumQueueDurationMs = (tracks: { durationMs: number }[]) =>
    tracks.reduce((total, track) => total + (track.durationMs || 0), 0);

export const COMMON_PARTY_EMOJIS = ['😀', '😂', '🔥', '❤️', '👍', '🎵', '🎉', '💯', '🙌', '✨'];
