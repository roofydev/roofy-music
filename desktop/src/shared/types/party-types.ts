import { Song } from './domain-types';
import { PlayerStatus } from './types';

export type PartyExposureMode = 'lan' | 'tunnel';

export type PartyControlMode = 'all' | 'host' | 'selected';

export type PartyControlAction = 'add_next' | 'play_now' | 'seek' | 'skip' | 'toggle_play';

export type PartyGuestStatus = 'approved' | 'pending';

export type PartyGuestRole = 'codj' | 'host' | 'listener';

export type PartyRoomTheme = 'dark' | 'dynamic';

export type PartySuggestionStatus = 'approved' | 'pending' | 'rejected';

export interface PartySettings {
    allowGuestQueueReorder: boolean;
    autoApproveJoins: boolean;
    autoApproveSuggestions: boolean;
    chatRateLimitEnabled: boolean;
    cloudflaredPath?: string;
    controlMode: PartyControlMode;
    exposureMode: PartyExposureMode;
    hostDisplayName: string;
    maxGuests: number;
    micAutoGainControl: boolean;
    micDeviceId?: string;
    micEchoCancellation: boolean;
    micGain: number;
    micNoiseSuppression: boolean;
    port: number;
    queueLocked: boolean;
    roomTheme: PartyRoomTheme;
    voteToSkipEnabled: boolean;
    voteToSkipThreshold: number;
}

export interface PartyLiveSettings {
    allowGuestQueueReorder: boolean;
    autoApproveJoins: boolean;
    autoApproveSuggestions: boolean;
    chatRateLimitEnabled: boolean;
    controlMode: PartyControlMode;
    exposureMode: PartyExposureMode;
    maxGuests: number;
    queueLocked: boolean;
    roomTheme: PartyRoomTheme;
    voteToSkipEnabled: boolean;
    voteToSkipThreshold: number;
}

export interface PartyTrack {
    album?: null | string;
    artist: string;
    artworkUrl?: null | string;
    durationMs: number;
    hostStreamUrl?: string;
    id: string;
    preferVideo?: boolean;
    source: 'host' | 'youtube';
    streamUrl?: string;
    suggestedBy?: string;
    suggestedByGuestId?: string;
    title: string;
    videoId?: string;
    videoStreamUrl?: string;
    votes: number;
    votedByGuestIds: string[];
}

export interface PartyGuest {
    avatarColor: string;
    canControlPlayer: boolean;
    displayName: string;
    id: string;
    isChatMuted: boolean;
    joinedAt: number;
    role: PartyGuestRole;
    status: PartyGuestStatus;
}

export interface PartySuggestion {
    createdAt: number;
    error?: string;
    guestDisplayName: string;
    guestId: string;
    id: string;
    query: string;
    status: PartySuggestionStatus;
    track?: PartyTrack;
}

export interface PartyChatMessage {
    body: string;
    id: string;
    role: 'guest' | 'host';
    senderId: string;
    senderName: string;
    sentAt: number;
}

export interface PartyRoomState {
    chat: PartyChatMessage[];
    code: string;
    currentGuestCanControlPlayer?: boolean;
    currentGuestCanReorderQueue?: boolean;
    currentGuestId?: string;
    guests: PartyGuest[];
    hostDisplayName: string;
    hostMicActive: boolean;
    isActive: boolean;
    joinUrl: string;
    nowPlaying: null | PartyTrack;
    playbackStatus: PlayerStatus;
    positionMs: number;
    publicUrl: string;
    queue: PartyTrack[];
    requestQueue: PartySuggestion[];
    serverTimeMs: number;
    sessionStartedAt: number;
    settings: PartyLiveSettings;
    suggestions: PartySuggestion[];
    tunnelStatus: PartyTunnelStatus;
}

export interface PartyTunnelStatus {
    error?: string;
    mode: PartyExposureMode;
    state: 'connected' | 'disabled' | 'starting' | 'unavailable';
    url?: string;
}

export interface PartyStartResult {
    error?: string;
    state?: PartyRoomState;
}

export interface PartyHostSnapshot {
    nowPlaying: null | PartyTrack;
    playbackStatus: PlayerStatus;
    positionMs: number;
    queue: PartyTrack[];
}

export interface PartyReorderQueueCommand {
    guestDisplayName: string;
    toIndex: number;
    trackId: string;
}

export interface PartyVoiceSignalPayload {
    guestId?: string;
    sdp?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
}

export type PartyClientMessage =
    | { action: PartyControlAction; positionMs?: number; query?: string; type: 'control' }
    | { body: string; type: 'chat_send' }
    | { candidate: RTCIceCandidateInit; guestId?: string; type: 'voice_ice' }
    | { displayName: string; sessionToken?: string; type: 'join' }
    | { query: string; type: 'search' }
    | { sdp: RTCSessionDescriptionInit; type: 'voice_answer' }
    | { preferVideo?: boolean; query: string; type: 'suggest' }
    | { toIndex: number; trackId: string; type: 'reorder_queue' }
    | { trackId: string; type: 'ready' }
    | { trackId: string; type: 'vote_track' }
    | { type: 'leave' }
    | { type: 'sync_request' }
    | { type: 'pong' };

export type PartyServerMessage =
    | { message: PartyChatMessage; type: 'chat_message' }
    | { messages: PartyChatMessage[]; type: 'chat_history' }
    | { reason: string; type: 'guest_kicked' }
    | { sessionToken: string; state: PartyRoomState; type: 'join_approved' }
    | { sessionToken: string; type: 'join_pending' }
    | { reason: string; type: 'join_rejected' }
    | { state: PartyRoomState; type: 'room_state' }
    | { state: PartyRoomState; type: 'sync' }
    | { suggestion: PartySuggestion; type: 'suggestion_update' }
    | { guests: PartyGuest[]; type: 'guest_update' }
    | { message: string; type: 'error' }
    | { type: 'room_ended' }
    | { type: 'ping' }
    | { query: string; results: PartyTrack[]; type: 'search_results' }
    | { trackId: string; type: 'buffer_complete' }
    | PartyVoiceSignalPayload & { type: 'voice_offer' }
    | PartyVoiceSignalPayload & { type: 'voice_answer' }
    | PartyVoiceSignalPayload & { type: 'voice_ice' };

export interface PartyApprovedSuggestion {
    insertAtFront?: boolean;
    song: Song;
    suggestionId: string;
}

export interface PartyControlCommand {
    action: PartyControlAction;
    guestDisplayName: string;
    positionMs?: number;
    query?: string;
    song?: Song;
}

export const defaultPartyTrackFields = (): Pick<PartyTrack, 'votes' | 'votedByGuestIds'> => ({
    votes: 0,
    votedByGuestIds: [],
});
