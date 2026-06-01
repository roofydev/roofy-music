import { describe, expect, it } from 'vitest';

import {
    buildRemoteControlUrl,
    buildRemoteSessionCookie,
    readRemoteAccessToken,
    readRemoteSessionCookie,
    resolveRemoteRequestPath,
} from './remote-control-link';

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

    it('resolves pathname when token is in the query string', () => {
        expect(resolveRemoteRequestPath('/?token=abc123')).toBe('/');
        expect(resolveRemoteRequestPath('/remote.js')).toBe('/remote.js');
    });

    it('reads access token from session cookie', () => {
        expect(
            readRemoteSessionCookie('other=1; roofy_remote_token=abc%2F123; path=/'),
        ).toBe('abc/123');
    });

    it('builds a session cookie header', () => {
        expect(buildRemoteSessionCookie('tok/en')).toContain('roofy_remote_token=tok%2Fen');
        expect(buildRemoteSessionCookie('tok/en')).toContain('HttpOnly');
    });
});
