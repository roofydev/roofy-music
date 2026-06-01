import { ipcRenderer, IpcRendererEvent } from 'electron';

import {
    PartyApprovedSuggestion,
    PartyControlCommand,
    PartyHostSnapshot,
    PartyReorderQueueCommand,
    PartyRoomState,
    PartySettings,
    PartyStartResult,
    PartyChatMessage,
    PartyVoiceSignalPayload,
} from '/@/shared/types/party-types';

const start = (settings: Partial<PartySettings>): Promise<PartyStartResult> =>
    ipcRenderer.invoke('party:start', settings);

const stop = (): Promise<null> => ipcRenderer.invoke('party:stop');

const approveJoin = (guestId: string): Promise<boolean> =>
    ipcRenderer.invoke('party:approve-join', guestId);

const rejectJoin = (guestId: string): Promise<boolean> =>
    ipcRenderer.invoke('party:reject-join', guestId);

const approveSuggestion = (suggestionId: string): Promise<boolean> =>
    ipcRenderer.invoke('party:approve-suggestion', suggestionId);

const approveSuggestionNext = (suggestionId: string): Promise<boolean> =>
    ipcRenderer.invoke('party:approve-suggestion-next', suggestionId);

const rejectSuggestion = (suggestionId: string): Promise<boolean> =>
    ipcRenderer.invoke('party:reject-suggestion', suggestionId);

const updateSettings = (settings: Partial<PartySettings>): Promise<boolean> =>
    ipcRenderer.invoke('party:update-settings', settings);

const setGuestControl = (guestId: string, canControlPlayer: boolean): Promise<boolean> =>
    ipcRenderer.invoke('party:set-guest-control', guestId, canControlPlayer);

const kickGuest = (guestId: string): Promise<boolean> =>
    ipcRenderer.invoke('party:kick-guest', guestId);

const kickAllGuests = (): Promise<boolean> => ipcRenderer.invoke('party:kick-all-guests');

const muteGuestChat = (guestId: string, muted: boolean): Promise<boolean> =>
    ipcRenderer.invoke('party:mute-guest-chat', guestId, muted);

const muteAllChat = (muted: boolean): Promise<boolean> =>
    ipcRenderer.invoke('party:mute-all-chat', muted);

const promoteCoDj = (guestId: string): Promise<boolean> =>
    ipcRenderer.invoke('party:promote-codj', guestId);

const updateHostState = (snapshot: PartyHostSnapshot) => {
    ipcRenderer.send('party:host-state', snapshot);
};

const sendChat = (body: string) => {
    ipcRenderer.send('party:send-chat', body);
};

const startVoice = () => {
    ipcRenderer.send('party:voice-start');
};

const stopVoice = () => {
    ipcRenderer.send('party:voice-stop');
};

const sendVoiceSignal = (payload: PartyVoiceSignalPayload & { type: string }) => {
    ipcRenderer.send('party:voice-signal', payload);
};

const onState = (cb: (event: IpcRendererEvent, state: null | PartyRoomState) => void) => {
    ipcRenderer.on('party:state', cb);
    return () => ipcRenderer.off('party:state', cb);
};

const onSuggestionApproved = (
    cb: (event: IpcRendererEvent, data: PartyApprovedSuggestion) => void,
) => {
    ipcRenderer.on('party:suggestion-approved', cb);
    return () => ipcRenderer.off('party:suggestion-approved', cb);
};

const onControlCommand = (cb: (event: IpcRendererEvent, data: PartyControlCommand) => void) => {
    ipcRenderer.on('party:control-command', cb);
    return () => ipcRenderer.off('party:control-command', cb);
};

const onReorderQueue = (cb: (event: IpcRendererEvent, data: PartyReorderQueueCommand) => void) => {
    ipcRenderer.on('party:reorder-queue', cb);
    return () => ipcRenderer.off('party:reorder-queue', cb);
};

const onChatMessage = (cb: (event: IpcRendererEvent, message: PartyChatMessage) => void) => {
    ipcRenderer.on('party:chat-message', cb);
    return () => ipcRenderer.off('party:chat-message', cb);
};

const onVoiceSignal = (
    cb: (event: IpcRendererEvent, payload: PartyVoiceSignalPayload & { type: string }) => void,
) => {
    ipcRenderer.on('party:voice-signal', cb);
    return () => ipcRenderer.off('party:voice-signal', cb);
};

const removeAllListeners = () => {
    ipcRenderer.removeAllListeners('party:control-command');
    ipcRenderer.removeAllListeners('party:reorder-queue');
    ipcRenderer.removeAllListeners('party:chat-message');
    ipcRenderer.removeAllListeners('party:state');
    ipcRenderer.removeAllListeners('party:suggestion-approved');
    ipcRenderer.removeAllListeners('party:voice-signal');
};

export const party = {
    approveJoin,
    approveSuggestion,
    approveSuggestionNext,
    kickAllGuests,
    kickGuest,
    muteAllChat,
    muteGuestChat,
    onChatMessage,
    onControlCommand,
    onReorderQueue,
    onState,
    onSuggestionApproved,
    onVoiceSignal,
    promoteCoDj,
    rejectJoin,
    rejectSuggestion,
    removeAllListeners,
    sendChat,
    sendVoiceSignal,
    setGuestControl,
    start,
    startVoice,
    stop,
    stopVoice,
    updateSettings,
    updateHostState,
};

export type PartyPreload = typeof party;
