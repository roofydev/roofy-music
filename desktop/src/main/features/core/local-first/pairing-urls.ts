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
    name = 'Roofy Local Library',
    password,
    serverUrl,
    token,
    username,
    webControlUrl,
}: DevicePairingParams): string => {
    const url = new URL('roofymusic://pair/device');
    url.searchParams.set('name', name);
    url.searchParams.set('serverUrl', serverUrl);
    url.searchParams.set('username', username);
    url.searchParams.set('password', password);
    url.searchParams.set('endpointUrl', endpointUrl);
    url.searchParams.set('token', token);
    const web = webControlUrl?.trim();
    if (web) {
        url.searchParams.set('webControlUrl', web);
    }
    return url.toString();
};
