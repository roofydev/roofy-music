import { describe, expect, it, vi } from 'vitest';

import { createDeviceBridgeCoordinator } from './device-bridge-coordinator';

describe('device bridge coordinator', () => {
    const createCoordinator = (remoteClientCount = 0) => {
        const storeData: Record<string, unknown> = {};
        const store = {
            get: vi.fn((key: string, fallback?: unknown) => storeData[key] ?? fallback),
            set: vi.fn((key: string, value: unknown) => {
                storeData[key] = value;
            }),
            delete: vi.fn((key: string) => {
                delete storeData[key];
            }),
        } as any;

        const pairing = {
            mode: 'lan' as const,
            state: 'connected' as const,
            url: 'http://192.168.1.2:4533',
        };
        const mobileImport = {
            mode: 'lan' as const,
            state: 'connected' as const,
            url: 'http://192.168.1.2:60952',
        };

        const coordinator = createDeviceBridgeCoordinator({
            getLocalFirstStatus: () => ({}),
            getLocalPairingStatus: () => pairing,
            getMobileImportStatus: () => mobileImport,
            getMobileImportToken: () => 'import-token',
            getPassword: () => 'secret',
            getRemoteClientCount: () => remoteClientCount,
            getUsername: () => 'admin',
            settleStuckPhoneLinkStarting: () => undefined,
            startLocalPairing: vi.fn(),
            startMobileImport: vi.fn(),
            stopLocalPairing: vi.fn(),
            stopMobileImport: vi.fn(),
            store,
            withMobileImportPairingUrl: (status) => status,
            withPairingUrl: (status) => status,
        });

        return { coordinator, storeData };
    };

    it('reports starting until remote is ready even when library and bridge are up', () => {
        const { coordinator } = createCoordinator();

        const status = coordinator.getPhoneLinkStatus();
        expect(status.libraryReady).toBe(true);
        expect(status.bridgeReady).toBe(true);
        expect(status.remoteReady).toBe(false);
        expect(status.state).toBe('starting');
        expect(status.pairingUrl).toBeUndefined();
        expect(status.phoneReachable).toBe(false);
        expect(status.activeOutput).toBe('none');
        expect(status.phoneControllingDesktop).toBe(false);
    });

    it('marks phone reachable after markPhoneHasPaired and stale after idle window', () => {
        vi.useFakeTimers();
        const now = Date.now();
        vi.setSystemTime(now);

        const storeData: Record<string, unknown> = {
            [PHONE_PAIRED_KEY]: true,
        };
        const store = {
            get: vi.fn((key: string, fallback?: unknown) => storeData[key] ?? fallback),
            set: vi.fn((key: string, value: unknown) => {
                storeData[key] = value;
            }),
            delete: vi.fn((key: string) => {
                delete storeData[key];
            }),
        } as any;

        const pairing = {
            mode: 'lan' as const,
            state: 'connected' as const,
            url: 'http://192.168.1.2:4533',
        };
        const mobileImport = {
            mode: 'lan' as const,
            state: 'connected' as const,
            url: 'http://192.168.1.2:60952',
        };

        const coordinator = createDeviceBridgeCoordinator({
            getLocalFirstStatus: () => ({}),
            getLocalPairingStatus: () => pairing,
            getMobileImportStatus: () => mobileImport,
            getMobileImportToken: () => 'import-token',
            getPassword: () => 'secret',
            getRemoteClientCount: () => 0,
            getUsername: () => 'admin',
            settleStuckPhoneLinkStarting: () => undefined,
            startLocalPairing: vi.fn(),
            startMobileImport: vi.fn(),
            stopLocalPairing: vi.fn(),
            stopMobileImport: vi.fn(),
            store,
            withMobileImportPairingUrl: (status) => status,
            withPairingUrl: (status) => status,
        });

        coordinator.markPhoneHasPaired({ headers: { 'x-roofy-device-name': 'Pixel' } });
        expect(coordinator.getPhoneLinkStatus().phoneReachable).toBe(true);
        expect(coordinator.getPhoneLinkStatus().phoneControllingDesktop).toBe(false);

        vi.setSystemTime(now + 6 * 60 * 1000);
        expect(coordinator.getPhoneLinkStatus().phoneReachable).toBe(false);

        vi.useRealTimers();
    });

    it('tracks active output separately from reachability', () => {
        const { coordinator } = createCoordinator(1);

        coordinator.markPhoneHasPaired({ headers: { 'x-roofy-device-name': 'Pixel 10' } });
        coordinator.setActiveOutput('computer', { headers: { 'x-roofy-device-name': 'Pixel 10' } });

        const status = coordinator.getPhoneLinkStatus();
        expect(status.phoneReachable).toBe(true);
        expect(status.activeOutput).toBe('computer');
        expect(status.phoneControllingDesktop).toBe(true);
    });

    it('does not mark phone as controlling desktop when output is phone', () => {
        const { coordinator } = createCoordinator(1);

        coordinator.markPhoneHasPaired({ headers: { 'x-roofy-device-name': 'Pixel 10' } });
        coordinator.setActiveOutput('phone', { headers: { 'x-roofy-device-name': 'Pixel 10' } });

        const status = coordinator.getPhoneLinkStatus();
        expect(status.activeOutput).toBe('phone');
        expect(status.phoneControllingDesktop).toBe(false);
    });
});

const PHONE_PAIRED_KEY = 'roofy.phoneHasPaired';
