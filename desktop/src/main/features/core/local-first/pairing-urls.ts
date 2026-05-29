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
