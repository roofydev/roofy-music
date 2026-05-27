import { WebSocket } from 'ws';

import { PartyVoiceSignalPayload } from '/@/shared/types/party-types';

type PartySocket = WebSocket & { alive?: boolean; guestId?: string };

type SendFn = (client: PartySocket, message: Record<string, unknown>) => void;
type SendToRendererFn = (channel: string, data: unknown) => void;

let hostMicActive = false;

export const isHostMicActive = () => hostMicActive;

export const setHostMicActive = (active: boolean) => {
    hostMicActive = active;
};

export const relayVoiceToGuest = (
    guestId: string,
    message: Record<string, unknown>,
    guestSockets: Map<string, PartySocket>,
    send: SendFn,
) => {
    const client = guestSockets.get(guestId);
    if (client) send(client, message);
};

export const relayVoiceToHost = (
    message: PartyVoiceSignalPayload & { type: string },
    sendToRenderer: SendToRendererFn,
) => {
    sendToRenderer('party:voice-signal', message);
};

export const broadcastVoiceOffer = (
    message: Record<string, unknown>,
    guestSockets: Map<string, PartySocket>,
    send: SendFn,
) => {
    guestSockets.forEach((client, guestId) => {
        if (client.readyState === WebSocket.OPEN) {
            send(client, { ...message, guestId });
        }
    });
};

export const resetVoiceState = () => {
    hostMicActive = false;
};
