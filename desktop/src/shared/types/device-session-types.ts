/** Cross-platform device session contract (mobile stores full session; desktop exposes link status). */

export type DeviceSessionMode = 'lan' | 'tunnel';

export type DeviceConnectionState = 'connected' | 'disabled' | 'starting' | 'unavailable';

/** Which device currently owns audio output for the active session. */
export type DeviceActiveOutput = 'computer' | 'none' | 'phone';

export type DeviceSessionCapabilities = {
    handoff: boolean;
    import: boolean;
    library: boolean;
    remote: boolean;
};

export type DeviceSessionLibrary = {
    password: string;
    serverUrl: string;
    username: string;
};

export type DeviceSessionBridge = {
    baseUrl: string;
    token: string;
};

export type DeviceSessionRemote = {
    token: string;
    wsUrl: string;
};

/** Mobile-persisted session (v1). */
export type DeviceSessionV1 = {
    bridge: DeviceSessionBridge;
    capabilities: DeviceSessionCapabilities;
    computerName: string;
    lastError?: string;
    lastHealthyAt?: string;
    library: DeviceSessionLibrary;
    mode: DeviceSessionMode;
    pairedAt: string;
    remote: DeviceSessionRemote;
    sessionId: string;
    webControlUrl?: string;
};

export type PhoneLinkStatus = {
    /** Device that is currently playing audio. */
    activeDeviceName?: string;
    activeOutput: DeviceActiveOutput;
    bridgeReady: boolean;
    error?: string;
    libraryReady: boolean;
    mode: DeviceSessionMode | 'auto';
    phoneName?: string;
    phonePaired: boolean;
    /** Phone is actively controlling desktop playback via the remote WebSocket. */
    phoneControllingDesktop: boolean;
    /** Phone contacted this computer recently (health/handoff/import). */
    phoneReachable: boolean;
    pairingUrl?: string;
    remoteReady: boolean;
    state: DeviceConnectionState;
};
