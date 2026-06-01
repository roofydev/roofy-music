import { useEffect, useRef, type RefObject } from 'react';

import { attachVoiceActivityMonitor } from '/@/shared/party-mic-audio';
import { PartyVoiceSignalPayload } from '/@/shared/types/party-types';

const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

interface UsePartyVoiceReceiverArgs {
    duckMusic?: boolean;
    duckMusicFactor?: number;
    hostMicActive: boolean;
    onSpeakingChange?: (speaking: boolean) => void;
    receiveVolume?: number;
    send: (message: Record<string, unknown>) => void;
    socketRef: RefObject<WebSocket | null>;
}

export const usePartyVoiceReceiver = ({
    duckMusic = true,
    duckMusicFactor = 0.7,
    hostMicActive,
    onSpeakingChange,
    receiveVolume = 100,
    send,
    socketRef,
}: UsePartyVoiceReceiverArgs) => {
    const peerRef = useRef<RTCPeerConnection | null>(null);
    const voiceAudioRef = useRef<HTMLAudioElement | null>(null);
    const sendRef = useRef(send);
    const onSpeakingChangeRef = useRef(onSpeakingChange);
    const stopVoiceMonitorRef = useRef<(() => void) | null>(null);

    sendRef.current = send;
    onSpeakingChangeRef.current = onSpeakingChange;

    useEffect(() => {
        if (voiceAudioRef.current) {
            voiceAudioRef.current.volume = Math.min(1, Math.max(0, receiveVolume / 100));
        }
    }, [receiveVolume]);

    useEffect(() => {
        if (!hostMicActive) {
            peerRef.current?.close();
            peerRef.current = null;
            stopVoiceMonitorRef.current?.();
            stopVoiceMonitorRef.current = null;
            if (voiceAudioRef.current) {
                voiceAudioRef.current.srcObject = null;
            }
            onSpeakingChangeRef.current?.(false);
            return undefined;
        }

        if (!voiceAudioRef.current) {
            const audio = document.createElement('audio');
            audio.autoplay = true;
            audio.setAttribute('playsinline', 'true');
            audio.style.display = 'none';
            document.body.appendChild(audio);
            voiceAudioRef.current = audio;
        }

        voiceAudioRef.current.volume = Math.min(1, Math.max(0, receiveVolume / 100));

        const peer = new RTCPeerConnection({
            bundlePolicy: 'max-bundle',
            iceServers: ICE_SERVERS,
        });
        peerRef.current = peer;

        peer.ontrack = (event) => {
            const [stream] = event.streams;
            const audio = voiceAudioRef.current;
            if (!audio || !stream) return;

            audio.srcObject = stream;
            void audio.play().catch(() => {
                // Browser may require a user gesture before playback starts.
            });

            stopVoiceMonitorRef.current?.();
            if (duckMusic) {
                stopVoiceMonitorRef.current = attachVoiceActivityMonitor(
                    stream,
                    (speaking) => onSpeakingChangeRef.current?.(speaking),
                );
            } else {
                onSpeakingChangeRef.current?.(false);
            }
        };

        peer.onicecandidate = (event) => {
            if (event.candidate) {
                sendRef.current({
                    candidate: event.candidate.toJSON(),
                    type: 'voice_ice',
                });
            }
        };

        const handleMessage = async (event: MessageEvent) => {
            const message = JSON.parse(event.data as string) as PartyVoiceSignalPayload & {
                type: string;
            };

            if (message.type === 'voice_offer' && message.sdp) {
                await peer.setRemoteDescription(message.sdp);
                const answer = await peer.createAnswer();
                await peer.setLocalDescription(answer);
                sendRef.current({
                    sdp: answer,
                    type: 'voice_answer',
                });
            }

            if (message.type === 'voice_ice' && message.candidate) {
                try {
                    await peer.addIceCandidate(message.candidate);
                } catch {
                    // Ignore stale ICE candidates.
                }
            }
        };

        const socket = socketRef.current;
        socket?.addEventListener('message', handleMessage);

        return () => {
            socket?.removeEventListener('message', handleMessage);
            stopVoiceMonitorRef.current?.();
            stopVoiceMonitorRef.current = null;
            peer.close();
            peerRef.current = null;
            onSpeakingChangeRef.current?.(false);
        };
    }, [duckMusic, hostMicActive, socketRef]);

    useEffect(
        () => () => {
            stopVoiceMonitorRef.current?.();
            if (voiceAudioRef.current) {
                voiceAudioRef.current.remove();
                voiceAudioRef.current = null;
            }
        },
        [],
    );

    return {
        duckMusicFactor,
        voiceAudioRef,
    };
};
