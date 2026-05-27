export interface PartyMicCaptureOptions {
    autoGainControl?: boolean;
    deviceId?: string;
    echoCancellation?: boolean;
    gain?: number;
    noiseSuppression?: boolean;
}

export interface PartyMicCapturePipeline {
    dispose: () => void;
    setGain: (gain: number) => void;
    stream: MediaStream;
}

export interface PartyMicInputDevice {
    deviceId: string;
    label: string;
}

export const DEFAULT_PARTY_MIC_GAIN = 100;

export const buildMicCaptureConstraints = (
    options: PartyMicCaptureOptions,
): MediaStreamConstraints => {
    const audio: MediaTrackConstraints = {
        autoGainControl: options.autoGainControl ?? false,
        echoCancellation: options.echoCancellation ?? false,
        noiseSuppression: options.noiseSuppression ?? true,
    };

    if (options.deviceId) {
        audio.deviceId = { exact: options.deviceId };
    }

    return { audio, video: false };
};

export const listPartyMicInputDevices = async (): Promise<PartyMicInputDevice[]> => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
        .filter((device) => device.kind === 'audioinput')
        .filter(
            (device, index, all) =>
                index === all.findIndex((candidate) => candidate.deviceId === device.deviceId),
        )
        .map((device, index) => ({
            deviceId: device.deviceId,
            label: device.label || `Microphone ${index + 1}`,
        }));
};

export const createPartyMicCapturePipeline = async (
    options: PartyMicCaptureOptions,
): Promise<PartyMicCapturePipeline> => {
    const rawStream = await navigator.mediaDevices.getUserMedia(buildMicCaptureConstraints(options));
    const context = new AudioContext();
    await context.resume();

    const source = context.createMediaStreamSource(rawStream);
    const gainNode = context.createGain();
    gainNode.gain.value = (options.gain ?? DEFAULT_PARTY_MIC_GAIN) / 100;
    const destination = context.createMediaStreamDestination();
    source.connect(gainNode);
    gainNode.connect(destination);

    return {
        dispose: () => {
            rawStream.getTracks().forEach((track) => track.stop());
            source.disconnect();
            gainNode.disconnect();
            destination.disconnect();
            void context.close();
        },
        setGain: (gain: number) => {
            gainNode.gain.value = gain / 100;
        },
        stream: destination.stream,
    };
};

export const attachVoiceActivityMonitor = (
    stream: MediaStream,
    onSpeakingChange: (speaking: boolean) => void,
    options?: { intervalMs?: number; threshold?: number },
) => {
    const intervalMs = options?.intervalMs ?? 80;
    const threshold = options?.threshold ?? 0.015;
    const context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.4;
    source.connect(analyser);

    const buffer = new Float32Array(analyser.fftSize);
    let speaking = false;
    let silentSince = 0;

    const tick = () => {
        analyser.getFloatTimeDomainData(buffer);
        let sum = 0;
        for (let index = 0; index < buffer.length; index += 1) {
            const sample = buffer[index];
            sum += sample * sample;
        }
        const rms = Math.sqrt(sum / buffer.length);
        const now = performance.now();

        if (rms >= threshold) {
            silentSince = 0;
            if (!speaking) {
                speaking = true;
                onSpeakingChange(true);
            }
            return;
        }

        if (speaking) {
            if (!silentSince) silentSince = now;
            if (now - silentSince >= 250) {
                speaking = false;
                onSpeakingChange(false);
            }
        }
    };

    void context.resume();
    const timer = window.setInterval(tick, intervalMs);

    return () => {
        window.clearInterval(timer);
        source.disconnect();
        analyser.disconnect();
        void context.close();
        if (speaking) onSpeakingChange(false);
    };
};
