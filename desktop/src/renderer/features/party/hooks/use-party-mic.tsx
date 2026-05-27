import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { usePartyRoomState } from '/@/renderer/features/party/party-store';
import { usePartySettings } from '/@/renderer/store';
import { toast } from '/@/shared/components/toast/toast';
import {
    createPartyMicCapturePipeline,
    type PartyMicCapturePipeline,
} from '/@/shared/party-mic-audio';

const party = window.api?.party ?? null;

const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

const approvedGuestIds = (guests: { id: string; status: string }[] | undefined) =>
    (guests || [])
        .filter((guest) => guest.status === 'approved')
        .map((guest) => guest.id)
        .sort()
        .join(',');

export const usePartyMic = () => {
    const state = usePartyRoomState();
    const partySettings = usePartySettings();
    const [micEnabled, setMicEnabled] = useState(false);
    const [micError, setMicError] = useState<null | string>(null);
    const pipelineRef = useRef<PartyMicCapturePipeline | null>(null);
    const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
    const connectedGuestsRef = useRef<Set<string>>(new Set());
    const micEnabledRef = useRef(false);
    const createOfferRef = useRef<(guestId: string) => Promise<void>>(async () => {});

    const captureConfigKey = useMemo(
        () =>
            [
                partySettings.micDeviceId || '',
                partySettings.micEchoCancellation,
                partySettings.micNoiseSuppression,
                partySettings.micAutoGainControl,
            ].join('|'),
        [
            partySettings.micAutoGainControl,
            partySettings.micDeviceId,
            partySettings.micEchoCancellation,
            partySettings.micNoiseSuppression,
        ],
    );

    const cleanupPeer = useCallback((guestId: string) => {
        const peer = peersRef.current.get(guestId);
        if (peer) {
            peer.close();
            peersRef.current.delete(guestId);
        }
        connectedGuestsRef.current.delete(guestId);
    }, []);

    const cleanupAllPeers = useCallback(() => {
        peersRef.current.forEach((_peer, guestId) => cleanupPeer(guestId));
        connectedGuestsRef.current.clear();
    }, [cleanupPeer]);

    const disposePipeline = useCallback(() => {
        pipelineRef.current?.dispose();
        pipelineRef.current = null;
    }, []);

    const cleanupAll = useCallback(() => {
        cleanupAllPeers();
        disposePipeline();
        party?.stopVoice();
    }, [cleanupAllPeers, disposePipeline]);

    const createOfferForGuest = useCallback(
        async (guestId: string) => {
            const pipeline = pipelineRef.current;
            if (!pipeline || !party) return;

            cleanupPeer(guestId);
            const peer = new RTCPeerConnection({
                bundlePolicy: 'max-bundle',
                iceServers: ICE_SERVERS,
            });
            peersRef.current.set(guestId, peer);
            connectedGuestsRef.current.add(guestId);

            pipeline.stream.getTracks().forEach((track) => {
                peer.addTrack(track, pipeline.stream);
            });

            peer.onicecandidate = (event) => {
                if (event.candidate) {
                    party.sendVoiceSignal({
                        candidate: event.candidate.toJSON(),
                        guestId,
                        type: 'voice_ice',
                    });
                }
            };

            peer.onconnectionstatechange = () => {
                if (
                    peer.connectionState === 'failed' &&
                    micEnabledRef.current &&
                    pipelineRef.current
                ) {
                    window.setTimeout(() => {
                        if (micEnabledRef.current) {
                            createOfferRef.current(guestId).catch(() => {
                                setMicError('Voice connection failed');
                            });
                        }
                    }, 1500);
                }
            };

            const offer = await peer.createOffer();
            await peer.setLocalDescription(offer);
            party.sendVoiceSignal({
                guestId,
                sdp: offer,
                type: 'voice_offer',
            });
        },
        [cleanupPeer],
    );

    createOfferRef.current = createOfferForGuest;

    const connectApprovedGuests = useCallback(
        async (guestIds: string[]) => {
            await Promise.all(
                guestIds.map((guestId) =>
                    createOfferForGuest(guestId).catch(() => {
                        setMicError('Voice connection failed');
                    }),
                ),
            );
        },
        [createOfferForGuest],
    );

    useEffect(() => {
        micEnabledRef.current = micEnabled;
    }, [micEnabled]);

    useEffect(() => {
        if (!party || !micEnabled) return undefined;

        const offSignal = party.onVoiceSignal(async (_event, payload) => {
            const guestId = payload.guestId;
            if (!guestId) return;

            const peer = peersRef.current.get(guestId);
            if (!peer) return;

            if (payload.type === 'voice_answer' && payload.sdp) {
                await peer.setRemoteDescription(payload.sdp);
            }

            if (payload.type === 'voice_ice' && payload.candidate) {
                try {
                    await peer.addIceCandidate(payload.candidate);
                } catch {
                    // Ignore stale ICE candidates.
                }
            }
        });

        return () => {
            offSignal();
        };
    }, [micEnabled]);

    useEffect(() => {
        if (!micEnabled || !state) return;

        const approvedIds = state.guests
            .filter((guest) => guest.status === 'approved')
            .map((guest) => guest.id);

        approvedIds.forEach((guestId) => {
            if (!connectedGuestsRef.current.has(guestId)) {
                createOfferForGuest(guestId).catch(() => {
                    setMicError('Voice connection failed');
                });
            }
        });

        connectedGuestsRef.current.forEach((guestId) => {
            if (!approvedIds.includes(guestId)) {
                cleanupPeer(guestId);
            }
        });
    }, [cleanupPeer, createOfferForGuest, micEnabled, approvedGuestIds(state?.guests)]);

    useEffect(() => {
        if (!micEnabled) return;
        pipelineRef.current?.setGain(partySettings.micGain);
    }, [micEnabled, partySettings.micGain]);

    useEffect(() => {
        if (!micEnabled) return undefined;

        let cancelled = false;

        const activateMic = async () => {
            try {
                cleanupAllPeers();
                disposePipeline();
                const pipeline = await createPartyMicCapturePipeline({
                    autoGainControl: partySettings.micAutoGainControl,
                    deviceId: partySettings.micDeviceId,
                    echoCancellation: partySettings.micEchoCancellation,
                    gain: partySettings.micGain,
                    noiseSuppression: partySettings.micNoiseSuppression,
                });
                if (cancelled) {
                    pipeline.dispose();
                    return;
                }

                pipelineRef.current = pipeline;
                setMicError(null);

                const guestIds = (state?.guests || [])
                    .filter((guest) => guest.status === 'approved')
                    .map((guest) => guest.id);
                if (guestIds.length > 0) {
                    await connectApprovedGuests(guestIds);
                }
            } catch {
                if (cancelled) return;
                setMicError('Microphone permission denied');
                toast.error({ message: 'Could not access microphone', title: 'Mic unavailable' });
                setMicEnabled(false);
                cleanupAll();
            }
        };

        activateMic();

        return () => {
            cancelled = true;
        };
    }, [
        captureConfigKey,
        connectApprovedGuests,
        disposePipeline,
        cleanupAll,
        cleanupAllPeers,
        micEnabled,
        partySettings.micAutoGainControl,
        partySettings.micDeviceId,
        partySettings.micEchoCancellation,
        partySettings.micNoiseSuppression,
    ]);

    useEffect(
        () => () => {
            cleanupAll();
        },
        [cleanupAll],
    );

    const enableMic = () => {
        if (!party) return;
        setMicError(null);
        setMicEnabled(true);
        party.startVoice();
    };

    const disableMic = () => {
        setMicEnabled(false);
        setMicError(null);
        cleanupAll();
    };

    const toggleMic = () => {
        if (micEnabled) {
            disableMic();
            return;
        }
        enableMic();
    };

    return {
        micEnabled,
        micError,
        toggleMic,
    };
};
