declare module 'qrcode' {
    interface QRCodeOptions {
        color?: {
            dark?: string;
            light?: string;
        };
        margin?: number;
        width?: number;
    }

    const QRCode: {
        toCanvas: (
            canvas: HTMLCanvasElement | null,
            text: string,
            options?: QRCodeOptions,
        ) => Promise<void>;
        toDataURL: (text: string, options?: QRCodeOptions) => Promise<string>;
    };

    export default QRCode;
}
