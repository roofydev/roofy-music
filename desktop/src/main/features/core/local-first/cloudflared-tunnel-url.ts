const CLOUDFLARED_QUICK_TUNNEL =
    /https:\/\/[a-z0-9][-a-z0-9]*\.trycloudflare\.com(?:\/[^\s"'<>]*)?/gi;

/** Extract the first quick-tunnel URL cloudflared prints to stdout/stderr. */
export const parseCloudflaredTunnelUrl = (text: string): string | undefined => {
    const match = text.match(CLOUDFLARED_QUICK_TUNNEL)?.[0];
    if (!match) return undefined;
    return match.replace(/[),.;]+$/, '').replace(/\/+$/, '');
};
