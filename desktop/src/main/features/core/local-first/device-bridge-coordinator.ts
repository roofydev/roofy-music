import { hostname } from 'os';

import type Store from 'electron-store';

import { logDeviceBridge } from '/@/main/features/core/local-first/device-bridge-log';
import { buildDevicePairingUrl } from '/@/main/features/core/local-first/pairing-urls';
import type {
    DeviceActiveOutput,
    PhoneLinkStatus,
} from '/@/shared/types/device-session-types';

export type LocalPairingMode = 'lan' | 'tunnel';

export type PhoneLinkRequestMode = 'auto' | LocalPairingMode;

type LocalPairingStatus = {
    error?: string;
    mode: LocalPairingMode;
    pairingUrl?: string;
    state: 'connected' | 'disabled' | 'starting' | 'unavailable';
    url?: string;
};

type LocalMobileImportStatus = {
    error?: string;
    mode: LocalPairingMode;
    pairingUrl?: string;
    state: 'connected' | 'disabled' | 'starting' | 'unavailable';
    url?: string;
};

export type DeviceBridgeCoordinatorDeps = {
    getLocalFirstStatus: () => unknown;
    getLocalPairingStatus: () => LocalPairingStatus;
    getMobileImportStatus: () => LocalMobileImportStatus;
    getMobileImportToken: () => string;
    getPassword: () => string;
    getRemoteClientCount: () => number;
    getUsername: () => string;
    settleStuckPhoneLinkStarting: () => void;
    startLocalPairing: (mode: LocalPairingMode) => Promise<unknown>;
    startMobileImport: (mode: LocalPairingMode) => Promise<unknown>;
    stopLocalPairing: () => void;
    stopMobileImport: () => void;
    store: Store;
    withMobileImportPairingUrl: (status: LocalMobileImportStatus) => LocalMobileImportStatus;
    withPairingUrl: (status: LocalPairingStatus) => LocalPairingStatus;
};

const PHONE_PAIRED_KEY = 'roofy.phoneHasPaired';
const PHONE_NAME_KEY = 'roofy.phoneName';
const PHONE_LAST_SEEN_KEY = 'roofy.phoneLastSeenAt';
const ACTIVE_OUTPUT_KEY = 'roofy.activeOutput';
const ACTIVE_OUTPUT_DEVICE_KEY = 'roofy.activeOutputDeviceName';
/** After this idle window the phone is treated as disconnected (e.g. app data cleared). */
const PHONE_REACHABLE_MS = 5 * 60 * 1000;

const normalizeActiveOutput = (value: unknown): DeviceActiveOutput => {
    if (value === 'phone' || value === 'computer') {
        return value;
    }
    return 'none';
};

const readRemoteTokenFromUrl = (remoteUrl?: string) => {
    if (!remoteUrl) return undefined;

    try {
        return new URL(remoteUrl).searchParams.get('token') || undefined;
    } catch {
        return undefined;
    }
};

export const createDeviceBridgeCoordinator = (deps: DeviceBridgeCoordinatorDeps) => {
    let desktopConnectWebControlUrl: string | undefined;
    let phoneHasPaired = Boolean(deps.store.get(PHONE_PAIRED_KEY, false));
    let phoneName = String(deps.store.get(PHONE_NAME_KEY, '') || '');
    let phoneLastSeenAt = Number(deps.store.get(PHONE_LAST_SEEN_KEY, 0)) || 0;
    let activeOutput = normalizeActiveOutput(deps.store.get(ACTIVE_OUTPUT_KEY, 'none'));
    let activeDeviceName = String(deps.store.get(ACTIVE_OUTPUT_DEVICE_KEY, '') || '');

    const isPhoneReachable = () =>
        phoneHasPaired && phoneLastSeenAt > 0 && Date.now() - phoneLastSeenAt < PHONE_REACHABLE_MS;

    const readPhoneNameFromRequest = (req?: {
        headers: Record<string, string | string[] | undefined>;
    }) => {
        const headerName = req?.headers['x-roofy-device-name'];
        return (Array.isArray(headerName) ? headerName[0] : headerName)?.trim();
    };

    const persistActiveOutput = (output: DeviceActiveOutput, deviceName?: string) => {
        activeOutput = output;
        activeDeviceName = deviceName?.trim() || activeDeviceName;
        deps.store.set(ACTIVE_OUTPUT_KEY, output);
        if (activeDeviceName) {
            deps.store.set(ACTIVE_OUTPUT_DEVICE_KEY, activeDeviceName);
        } else {
            deps.store.delete(ACTIVE_OUTPUT_DEVICE_KEY);
        }
        logDeviceBridge('active_output', { deviceName: activeDeviceName || undefined, output });
    };

    const getRemoteClientCount = () => Math.max(0, deps.getRemoteClientCount());

    const buildPhoneLinkFields = () => {
        const phoneReachable = isPhoneReachable();
        const phoneControllingDesktop =
            phoneReachable && activeOutput === 'computer' && getRemoteClientCount() > 0;

        return {
            activeDeviceName: activeDeviceName || phoneName || undefined,
            activeOutput,
            phoneControllingDesktop,
            phoneReachable,
        };
    };
    let phoneLinkBootstrapInFlight: null | Promise<unknown> = null;
    let phoneLinkStartInFlight: null | Promise<unknown> = null;

    const refreshDesktopConnectWebControlUrl = async () => {
        try {
            const { ensureRemoteForPairing } = await import('/@/main/features/core/remote');
            desktopConnectWebControlUrl = await ensureRemoteForPairing();
            logDeviceBridge('remote_ready', { ok: Boolean(desktopConnectWebControlUrl) });
        } catch (error) {
            desktopConnectWebControlUrl = undefined;
            logDeviceBridge('remote_failed', {
                message: error instanceof Error ? error.message : String(error),
            });
        }
    };

    const isPhoneLinkReady = () => {
        const pairing = deps.getLocalPairingStatus();
        const mobileImport = deps.getMobileImportStatus();

        return (
            mobileImport.state === 'connected' &&
            pairing.state === 'connected' &&
            Boolean(mobileImport.url) &&
            Boolean(pairing.url)
        );
    };

    const getDevicePairingUrl = (
        subsonicUrl: string,
        importEndpoint: string,
        mode: LocalPairingMode,
    ) => {
        if (!desktopConnectWebControlUrl) {
            return undefined;
        }

        return buildDevicePairingUrl({
            computerName: hostname(),
            endpointUrl: importEndpoint,
            lanEndpointUrl: mode === 'lan' ? importEndpoint : undefined,
            mode,
            password: deps.getPassword(),
            publicEndpointUrl: mode === 'tunnel' ? importEndpoint : undefined,
            remoteControlToken: readRemoteTokenFromUrl(desktopConnectWebControlUrl),
            remoteControlUrl: desktopConnectWebControlUrl,
            serverUrl: subsonicUrl,
            token: deps.getMobileImportToken(),
            username: deps.getUsername(),
            webControlUrl: desktopConnectWebControlUrl,
        });
    };

    const getPhoneLinkStatus = (): PhoneLinkStatus => {
        const pairing = deps.withPairingUrl(deps.getLocalPairingStatus());
        const mobileImport = deps.withMobileImportPairingUrl(deps.getMobileImportStatus());
        const mode: LocalPairingMode =
            pairing.mode === 'lan' || mobileImport.mode === 'lan' ? 'lan' : pairing.mode || 'tunnel';

        const libraryReady =
            pairing.state === 'connected' && Boolean(pairing.url);
        const bridgeReady =
            mobileImport.state === 'connected' && Boolean(mobileImport.url);
        const remoteReady = Boolean(desktopConnectWebControlUrl?.trim());

        const linkFields = buildPhoneLinkFields();

        if (pairing.state === 'disabled' && mobileImport.state === 'disabled') {
            return {
                ...linkFields,
                bridgeReady,
                libraryReady,
                mode,
                phoneName,
                phonePaired: phoneHasPaired,
                remoteReady,
                state: 'disabled',
            };
        }

        if (pairing.state === 'starting' || mobileImport.state === 'starting') {
            return {
                ...linkFields,
                bridgeReady,
                libraryReady,
                mode,
                phoneName,
                phonePaired: phoneHasPaired,
                remoteReady,
                state: 'starting',
            };
        }

        if (libraryReady && bridgeReady && pairing.url && mobileImport.url) {
            const pairingUrl = remoteReady
                ? getDevicePairingUrl(pairing.url, mobileImport.url, mode)
                : undefined;

            const phoneLinkState = remoteReady ? 'connected' : 'starting';
            const stalePhone =
                phoneHasPaired && !linkFields.phoneReachable && phoneLinkState === 'connected';

            return {
                ...buildPhoneLinkFields(),
                bridgeReady,
                libraryReady,
                mode,
                phoneName,
                phonePaired: phoneHasPaired,
                pairingUrl,
                remoteReady,
                state: phoneLinkState,
                error: remoteReady
                    ? stalePhone
                        ? 'Phone not connected. Re-link from your phone or forget this device below.'
                        : undefined
                    : 'Preparing remote control for your phone…',
            };
        }

        const error =
            pairing.state === 'unavailable'
                ? pairing.error
                : mobileImport.state === 'unavailable'
                  ? mobileImport.error
                  : pairing.state !== 'connected'
                    ? pairing.error || 'Personal library link is not ready.'
                    : mobileImport.error || 'Save-to-desktop link is not ready.';

        return {
            ...linkFields,
            bridgeReady,
            error,
            libraryReady,
            mode,
            phoneName,
            phonePaired: phoneHasPaired,
            remoteReady,
            state: 'unavailable',
        };
    };

    const markPhoneReachable = (req?: {
        headers: Record<string, string | string[] | undefined>;
    }) => {
        phoneLastSeenAt = Date.now();
        deps.store.set(PHONE_LAST_SEEN_KEY, phoneLastSeenAt);
        const nextPhoneName = readPhoneNameFromRequest(req);
        if (nextPhoneName) {
            phoneName = nextPhoneName;
            deps.store.set(PHONE_NAME_KEY, nextPhoneName);
        }
    };

    const setActiveOutput = (
        output: DeviceActiveOutput,
        req?: { headers: Record<string, string | string[] | undefined> },
    ) => {
        const nextPhoneName = readPhoneNameFromRequest(req);
        if (output === 'phone') {
            persistActiveOutput('phone', nextPhoneName || phoneName || undefined);
            return;
        }
        if (output === 'computer') {
            persistActiveOutput('computer', nextPhoneName || phoneName || undefined);
            return;
        }
        persistActiveOutput('none');
    };

    const markPhoneHasPaired = (req?: { headers: Record<string, string | string[] | undefined> }) => {
        phoneHasPaired = true;
        deps.store.set(PHONE_PAIRED_KEY, true);
        markPhoneReachable(req);
        const nextPhoneName = readPhoneNameFromRequest(req);
        if (nextPhoneName) {
            logDeviceBridge('phone_paired', { phoneName: nextPhoneName });
        }
    };

    const ensurePhoneLinkReady = async () => {
        if (!phoneHasPaired || isPhoneLinkReady()) {
            if (phoneHasPaired && isPhoneLinkReady() && !desktopConnectWebControlUrl) {
                await refreshDesktopConnectWebControlUrl();
            }
            return;
        }

        if (phoneLinkBootstrapInFlight) {
            await phoneLinkBootstrapInFlight;
            return;
        }

        logDeviceBridge('bootstrap_start');
        phoneLinkBootstrapInFlight = startPhoneLink('auto');
        try {
            await phoneLinkBootstrapInFlight;
        } finally {
            phoneLinkBootstrapInFlight = null;
        }
    };

    const getPublicMobileImportEndpoint = () => {
        const mobileImport = deps.getMobileImportStatus();
        return mobileImport.state === 'connected' && mobileImport.url ? mobileImport.url : undefined;
    };

    const stopPhoneLink = () => {
        desktopConnectWebControlUrl = undefined;
        deps.stopLocalPairing();
        deps.stopMobileImport();
        logDeviceBridge('phone_link_stopped');
        return deps.getLocalFirstStatus();
    };

    const disconnectPhoneLink = () => {
        phoneHasPaired = false;
        phoneLastSeenAt = 0;
        activeOutput = 'none';
        activeDeviceName = '';
        deps.store.delete(PHONE_PAIRED_KEY);
        deps.store.delete(PHONE_NAME_KEY);
        deps.store.delete(PHONE_LAST_SEEN_KEY);
        deps.store.delete(ACTIVE_OUTPUT_KEY);
        deps.store.delete(ACTIVE_OUTPUT_DEVICE_KEY);
        phoneName = '';
        logDeviceBridge('phone_forgotten');
        return stopPhoneLink();
    };

    const startPhoneLink = async (mode: PhoneLinkRequestMode = 'auto') => {
        if (phoneLinkStartInFlight) {
            return phoneLinkStartInFlight;
        }

        const run = async () => {
            logDeviceBridge('phone_link_start', { mode });

            const finalizeLink = async () => {
                const status = getPhoneLinkStatus();
                if (libraryReadyBridge(status) && !status.remoteReady) {
                    await refreshDesktopConnectWebControlUrl();
                }
                return deps.getLocalFirstStatus();
            };

            const tryLink = async (linkMode: LocalPairingMode) => {
                stopPhoneLink();
                await deps.startMobileImport(linkMode);
                await deps.startLocalPairing(linkMode);
                deps.settleStuckPhoneLinkStarting();
                return finalizeLink();
            };

            const resolvePhoneLinkMode = (requestMode: PhoneLinkRequestMode): LocalPairingMode =>
                requestMode === 'lan' ? 'lan' : 'tunnel';

            if (mode === 'auto') {
                const lanStatus = await tryLink('lan');
                const phoneLink = (lanStatus as { phoneLink?: PhoneLinkStatus }).phoneLink;
                if (phoneLink?.state === 'connected') {
                    logDeviceBridge('phone_link_ready', { mode: 'lan' });
                    return lanStatus;
                }
                const tunnelStatus = await tryLink('tunnel');
                logDeviceBridge('phone_link_ready', {
                    mode: 'tunnel',
                    state: (tunnelStatus as { phoneLink?: PhoneLinkStatus }).phoneLink?.state,
                });
                return tunnelStatus;
            }

            return tryLink(resolvePhoneLinkMode(mode));
        };

        phoneLinkStartInFlight = run();
        try {
            return await phoneLinkStartInFlight;
        } finally {
            phoneLinkStartInFlight = null;
        }
    };

    return {
        disconnectPhoneLink,
        ensurePhoneLinkReady,
        getPhoneLinkStatus,
        getPublicMobileImportEndpoint,
        isPhoneLinkReady,
        markPhoneHasPaired,
        markPhoneReachable,
        setActiveOutput,
        startPhoneLink,
        stopPhoneLink,
    };
};

const libraryReadyBridge = (status: PhoneLinkStatus) => status.libraryReady && status.bridgeReady;
