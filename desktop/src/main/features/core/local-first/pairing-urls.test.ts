import { describe, expect, it } from 'vitest';

import {
    buildDevicePairingUrl,
    buildImportPairingUrl,
    buildSubsonicPairingUrl,
} from './pairing-urls';

describe('pairing URLs', () => {
    it('builds a Subsonic deep link with encoded credentials', () => {
        const url = buildSubsonicPairingUrl({
            serverUrl: 'http://192.168.1.10:4533',
            computerName: 'Studio PC',
            username: 'roofy',
            password: 'secret&token',
        });

        const parsed = new URL(url);
        expect(parsed.protocol).toBe('roofymusic:');
        expect(parsed.hostname).toBe('pair');
        expect(parsed.pathname).toBe('/subsonic');
        expect(parsed.searchParams.get('serverUrl')).toBe('http://192.168.1.10:4533');
        expect(parsed.searchParams.get('username')).toBe('roofy');
        expect(parsed.searchParams.get('password')).toBe('secret&token');
    });

    it('builds a desktop import deep link', () => {
        const url = buildImportPairingUrl({
            endpointUrl: 'http://192.168.1.10:8765',
            token: 'import-token',
        });

        const parsed = new URL(url);
        expect(parsed.pathname).toBe('/import');
        expect(parsed.searchParams.get('endpointUrl')).toBe('http://192.168.1.10:8765');
        expect(parsed.searchParams.get('token')).toBe('import-token');
    });

    it('builds a unified device deep link with library and import params', () => {
        const url = buildDevicePairingUrl({
            serverUrl: 'https://abc.trycloudflare.com',
            username: 'roofy',
            password: 'secret',
            endpointUrl: 'https://xyz.trycloudflare.com',
            token: 'import-token',
        });

        const parsed = new URL(url);
        expect(parsed.pathname).toBe('/device');
        expect(parsed.searchParams.get('v')).toBe('2');
        expect(parsed.searchParams.get('serverUrl')).toBe('https://abc.trycloudflare.com');
        expect(parsed.searchParams.get('endpointUrl')).toBe('https://xyz.trycloudflare.com');
        expect(parsed.searchParams.get('token')).toBe('import-token');
    });

    it('includes optional web control URL in unified device link', () => {
        const url = buildDevicePairingUrl({
            computerName: 'Studio PC',
            serverUrl: 'http://192.168.1.10:4533',
            username: 'roofy',
            password: 'secret',
            endpointUrl: 'http://192.168.1.10:8765',
            lanEndpointUrl: 'http://192.168.1.10:8765',
            mode: 'lan',
            remoteControlToken: 'remote-token',
            remoteControlUrl: 'http://192.168.1.10:4333/?token=remote-token',
            token: 'import-token',
            webControlUrl: 'http://192.168.1.10:4333/?token=remote-token',
        });

        const parsed = new URL(url);
        expect(parsed.searchParams.get('mode')).toBe('lan');
        expect(parsed.searchParams.get('computerName')).toBe('Studio PC');
        expect(parsed.searchParams.get('lanEndpointUrl')).toBe('http://192.168.1.10:8765');
        expect(parsed.searchParams.get('remoteControlUrl')).toBe(
            'http://192.168.1.10:4333/?token=remote-token',
        );
        expect(parsed.searchParams.get('remoteControlToken')).toBe('remote-token');
        expect(parsed.searchParams.get('webControlUrl')).toBe(
            'http://192.168.1.10:4333/?token=remote-token',
        );
    });

    it('round-trips Subsonic params through URLSearchParams', () => {
        const built = buildSubsonicPairingUrl({
            serverUrl: 'http://10.0.0.5:8080',
            username: 'user',
            password: 'p@ss',
        });
        const parsed = new URL(built);
        expect(parsed.searchParams.get('serverUrl')).toBe('http://10.0.0.5:8080');
        expect(parsed.searchParams.get('username')).toBe('user');
        expect(parsed.searchParams.get('password')).toBe('p@ss');
    });
});
