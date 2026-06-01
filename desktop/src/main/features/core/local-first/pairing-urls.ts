export type SubsonicPairingParams = {
    name?: string;
    password: string;
    serverUrl: string;
    username: string;
};

export type ImportPairingParams = {
    endpointUrl: string;
    token: string;
};

/** Combined desktop connect: library + save-to-desktop + optional web control in one scan. */
export type DevicePairingParams = SubsonicPairingParams &
    ImportPairingParams & {
        computerName?: string;
        lanEndpointUrl?: string;
        mode?: 'lan' | 'tunnel';
        publicEndpointUrl?: string;
        /** Native remote endpoint for phone controls. Same host as web control, without requiring a browser. */
        remoteControlUrl?: string;
        /** Token used by native remote clients. */
        remoteControlToken?: string;
        /** Signed browser remote URL (`?token=…`). */
        webControlUrl?: string;
    };

export const buildSubsonicPairingUrl = ({
    name = 'Roofy Local Library',
    password,
    serverUrl,
    username,
}: SubsonicPairingParams): string => {
    const url = new URL('roofymusic://pair/subsonic');
    url.searchParams.set('name', name);
    url.searchParams.set('serverUrl', serverUrl);
    url.searchParams.set('username', username);
    url.searchParams.set('password', password);
    return url.toString();
};

export const buildImportPairingUrl = ({ endpointUrl, token }: ImportPairingParams): string => {
    const url = new URL('roofymusic://pair/import');
    url.searchParams.set('endpointUrl', endpointUrl);
    url.searchParams.set('token', token);
    return url.toString();
};

export const buildDevicePairingUrl = ({
    endpointUrl,
    computerName,
    lanEndpointUrl,
    mode,
    name = 'Roofy Local Library',
    password,
    publicEndpointUrl,
    remoteControlToken,
    remoteControlUrl,
    serverUrl,
    token,
    username,
    webControlUrl,
}: DevicePairingParams): string => {
    const url = new URL('roofymusic://pair/device');
    url.searchParams.set('v', '2');
    url.searchParams.set('name', name);
    url.searchParams.set('serverUrl', serverUrl);
    url.searchParams.set('username', username);
    url.searchParams.set('password', password);
    url.searchParams.set('endpointUrl', endpointUrl);
    url.searchParams.set('token', token);
    const deviceName = computerName?.trim();
    if (deviceName) {
        url.searchParams.set('computerName', deviceName);
    }
    if (mode) {
        url.searchParams.set('mode', mode);
    }
    const lanEndpoint = lanEndpointUrl?.trim();
    if (lanEndpoint) {
        url.searchParams.set('lanEndpointUrl', lanEndpoint);
    }
    const publicEndpoint = publicEndpointUrl?.trim();
    if (publicEndpoint) {
        url.searchParams.set('publicEndpointUrl', publicEndpoint);
    }
    const remote = remoteControlUrl?.trim();
    if (remote) {
        url.searchParams.set('remoteControlUrl', remote);
    }
    const remoteToken = remoteControlToken?.trim();
    if (remoteToken) {
        url.searchParams.set('remoteControlToken', remoteToken);
    }
    const web = webControlUrl?.trim();
    if (web) {
        url.searchParams.set('webControlUrl', web);
    }
    return url.toString();
};
