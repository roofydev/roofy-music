import { PlayerStatus } from '/@/shared/types/types';

export type HandoffTrackSource = 'subsonic' | 'unknown' | 'youtube';

export interface HandoffTrack {
    album?: string;
    artist: string;
    artworkUrl?: string;
    durationMs?: number;
    id: string;
    source: HandoffTrackSource;
    title: string;
}

export interface HandoffSnapshot {
    nowPlaying: HandoffTrack | null;
    playbackStatus: PlayerStatus;
    positionMs: number;
    queue: HandoffTrack[];
}
