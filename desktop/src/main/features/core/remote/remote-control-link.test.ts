import { describe, expect, it } from 'vitest';

import { buildRemoteControlUrl, readRemoteAccessToken } from './remote-control-link';

describe('remote control links', () => {
    it('builds a tokenized URL without exposing username', () => {
        const url = buildRemoteControlUrl('192.168.1.10', {
            password: 'secret-token',
            port: 4333,
        });

        expect(url).toBe('http://192.168.1.10:4333/?token=secret-token');
    });

    it('reads access token from request path', () => {
        expect(readRemoteAccessToken('/?token=abc123')).toBe('abc123');
    });
});
