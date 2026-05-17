type WindowConfigKey =
    | 'LEGACY_AUTHENTICATION'
    | 'REMOTE_URL'
    | 'SERVER_LOCK'
    | 'SERVER_NAME'
    | 'SERVER_TYPE'
    | 'SERVER_URL';

const getConfigValue = (key: WindowConfigKey) => {
    return window.api?.localSettings?.env?.[key] ?? window[key];
};

const isTrue = (value: unknown) => value === true || value === 'true';

export const getLegacyAuth = () => getConfigValue('LEGACY_AUTHENTICATION');
export const getRemoteUrl = () => String(getConfigValue('REMOTE_URL') || '');
export const getServerName = () => String(getConfigValue('SERVER_NAME') || '');
export const getServerType = () => String(getConfigValue('SERVER_TYPE') || '');
export const getServerUrl = () => String(getConfigValue('SERVER_URL') || '');

export const isLegacyAuth = () => isTrue(getLegacyAuth());

export const isServerLock = () => isTrue(getConfigValue('SERVER_LOCK'));
