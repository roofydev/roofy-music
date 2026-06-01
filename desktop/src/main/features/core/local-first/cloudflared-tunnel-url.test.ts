import { describe, expect, it } from 'vitest';

import { parseCloudflaredTunnelUrl } from './cloudflared-tunnel-url';

describe('parseCloudflaredTunnelUrl', () => {
    it('extracts trycloudflare URLs from cloudflared log lines', () => {
        const text =
            'INF Thank you for trying Cloudflare Tunnel. Doing so, without a Cloudflare account, is a quick way to experiment.\n' +
            'INF Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):\n' +
            'INF https://random-words-here.trycloudflare.com\n';

        expect(parseCloudflaredTunnelUrl(text)).toBe('https://random-words-here.trycloudflare.com');
    });
});
