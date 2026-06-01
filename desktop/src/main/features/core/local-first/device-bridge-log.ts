/** Structured logging for device bridge / phone link flows. */
export const logDeviceBridge = (event: string, detail?: Record<string, unknown>) => {
    const payload = detail ? ` ${JSON.stringify(detail)}` : '';
    console.log(`[RoofyDevice] ${event}${payload}`);
};
