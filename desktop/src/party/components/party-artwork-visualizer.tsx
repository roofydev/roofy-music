import { RefObject, useEffect, useRef } from 'react';

const BAR_COUNT = 24;
const BAR_GAP = 4;
const MAX_BAR_WIDTH = 6;
const MIN_BAR_RATIO = 0.1;

interface PartyArtworkVisualizerProps {
    active: boolean;
    analyserRef: RefObject<AnalyserNode | null>;
    audioGraphReady: boolean;
    contextRef: RefObject<AudioContext | null>;
}

const readCssColor = (name: string, fallback: string) => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
};

const lerpColor = (from: string, to: string, amount: number) => {
    const parse = (hex: string) => {
        const normalized = hex.replace('#', '');
        const full =
            normalized.length === 3
                ? normalized
                      .split('')
                      .map((char) => char + char)
                      .join('')
                : normalized;
        return [
            Number.parseInt(full.slice(0, 2), 16),
            Number.parseInt(full.slice(2, 4), 16),
            Number.parseInt(full.slice(4, 6), 16),
        ] as const;
    };

    const [r1, g1, b1] = parse(from);
    const [r2, g2, b2] = parse(to);
    const mix = Math.min(1, Math.max(0, amount));
    const r = Math.round(r1 + (r2 - r1) * mix);
    const g = Math.round(g1 + (g2 - g1) * mix);
    const b = Math.round(b1 + (b2 - b1) * mix);
    return `rgb(${r}, ${g}, ${b})`;
};

export const PartyArtworkVisualizer = ({
    active,
    analyserRef,
    audioGraphReady,
    contextRef,
}: PartyArtworkVisualizerProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

    useEffect(() => {
        const analyser = analyserRef.current;
        if (!audioGraphReady || !analyser) {
            dataArrayRef.current = null;
            return;
        }

        dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
    }, [analyserRef, audioGraphReady]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const analyser = analyserRef.current;
        if (!canvas || !analyser || !audioGraphReady) return;

        const dataArray = dataArrayRef.current;
        if (!dataArray) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const mutedColor = readCssColor('--party-muted-dim', '#555555');
        const peakColor = readCssColor('--party-text', '#ffffff');
        let frameId = 0;

        const draw = () => {
            frameId = requestAnimationFrame(draw);

            const rect = canvas.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;

            const dpr = window.devicePixelRatio || 1;
            const width = rect.width;
            const height = rect.height;

            if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
                canvas.width = Math.round(width * dpr);
                canvas.height = Math.round(height * dpr);
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            }

            ctx.clearRect(0, 0, width, height);

            const context = contextRef.current;
            if (active && context?.state === 'suspended') {
                void context.resume();
            }

            if (active) {
                analyser.getByteFrequencyData(dataArray);
            } else {
                dataArray.fill(0);
            }

            const naturalBarWidth = (width - BAR_GAP * (BAR_COUNT - 1)) / BAR_COUNT;
            const barWidth = Math.min(MAX_BAR_WIDTH, naturalBarWidth);
            const layoutWidth = barWidth * BAR_COUNT + BAR_GAP * (BAR_COUNT - 1);
            const layoutOffset = (width - layoutWidth) / 2;
            const binStep = Math.max(1, Math.floor(dataArray.length / BAR_COUNT));

            for (let index = 0; index < BAR_COUNT; index += 1) {
                let sum = 0;
                for (let bin = 0; bin < binStep; bin += 1) {
                    sum += dataArray[index * binStep + bin] ?? 0;
                }

                const level = active ? sum / binStep / 255 : 0;
                const barHeight = Math.max(height * MIN_BAR_RATIO, height * level);
                const x = layoutOffset + index * (barWidth + BAR_GAP);
                const y = height - barHeight;

                ctx.fillStyle = active ? lerpColor(mutedColor, peakColor, level) : mutedColor;
                ctx.beginPath();
                ctx.roundRect(x, y, barWidth, barHeight, 1);
                ctx.fill();
            }
        };

        draw();

        return () => cancelAnimationFrame(frameId);
    }, [active, analyserRef, audioGraphReady, contextRef]);

    return <canvas aria-hidden className="artwork-visualizer" ref={canvasRef} />;
};
