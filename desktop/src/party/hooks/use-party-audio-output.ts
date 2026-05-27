import { RefObject, useEffect, useRef, useState } from 'react';

const clampVolume = (value: number) => Math.min(1, Math.max(0, value));

export const usePartyAudioOutput = (
    audioRef: RefObject<HTMLAudioElement | null>,
    outputVolume: number,
) => {
    const contextRef = useRef<AudioContext | null>(null);
    const gainRef = useRef<GainNode | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const connectedRef = useRef(false);
    const connectFrameRef = useRef(0);
    const [audioGraphReady, setAudioGraphReady] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const connectAudio = () => {
            if (cancelled || connectedRef.current) return;

            const audio = audioRef.current;
            if (!audio) {
                connectFrameRef.current = requestAnimationFrame(connectAudio);
                return;
            }

            try {
                const AudioContextClass =
                    window.AudioContext ||
                    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
                        .webkitAudioContext;

                if (!AudioContextClass) {
                    return;
                }

                const context = new AudioContextClass();
                const source = context.createMediaElementSource(audio);
                const gain = context.createGain();
                const analyser = context.createAnalyser();
                analyser.fftSize = 64;
                analyser.smoothingTimeConstant = 0.78;

                source.connect(gain);
                gain.connect(analyser);
                analyser.connect(context.destination);

                gain.gain.value = clampVolume(outputVolume);

                contextRef.current = context;
                gainRef.current = gain;
                analyserRef.current = analyser;
                connectedRef.current = true;
                setAudioGraphReady(true);
            } catch (error) {
                console.warn('Party audio output failed to initialize Web Audio:', error);
            }
        };

        connectAudio();

        return () => {
            cancelled = true;
            cancelAnimationFrame(connectFrameRef.current);
            connectedRef.current = false;
            gainRef.current = null;
            analyserRef.current = null;
            setAudioGraphReady(false);
            const context = contextRef.current;
            contextRef.current = null;
            void context?.close();
        };
    }, [audioRef]);

    useEffect(() => {
        const clampedVolume = clampVolume(outputVolume);
        const gain = gainRef.current;
        const context = contextRef.current;
        const audio = audioRef.current;

        if (gain) {
            gain.gain.value = clampedVolume;
            if (context?.state === 'suspended') {
                void context.resume();
            }
            return;
        }

        if (audio) {
            audio.volume = clampedVolume;
        }
    }, [audioRef, audioGraphReady, outputVolume]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || !audioGraphReady) return;

        const resumeContext = () => {
            const context = contextRef.current;
            if (context?.state === 'suspended') {
                void context.resume();
            }
        };

        audio.addEventListener('play', resumeContext);
        return () => audio.removeEventListener('play', resumeContext);
    }, [audioGraphReady, audioRef]);

    return {
        analyserRef,
        audioGraphReady,
        contextRef,
    };
};
