import type { SourceAwareErrorCode } from '/@/shared/types/music-source-types';

export type UserErrorDomain =
    | 'devices'
    | 'import'
    | 'library'
    | 'playback'
    | 'search'
    | 'sync';

export interface UserFacingError {
    messageKey: string;
    recoveryActionKey?: string;
    showTechnicalDetails?: boolean;
}

const PLAYBACK_ERROR_MAP: Partial<Record<SourceAwareErrorCode, UserFacingError>> = {
    YT_STREAM_403: {
        messageKey: 'productUx.error.playback.sourceBlocked',
        recoveryActionKey: 'productUx.error.recovery.tryAnotherVersion',
    },
    YT_STREAM_EXPIRED: {
        messageKey: 'productUx.error.playback.streamExpired',
        recoveryActionKey: 'productUx.error.recovery.tryAgain',
    },
    YT_AUTH_REQUIRED: {
        messageKey: 'productUx.error.playback.signInRequired',
        recoveryActionKey: 'productUx.error.recovery.openSettings',
    },
    YT_VIDEO_UNAVAILABLE: {
        messageKey: 'productUx.error.playback.unavailable',
        recoveryActionKey: 'productUx.error.recovery.tryAnotherVersion',
    },
    LOCAL_FILE_MISSING: {
        messageKey: 'productUx.error.playback.fileMissing',
        recoveryActionKey: 'productUx.error.recovery.tryAgain',
    },
    NAVIDROME_OFFLINE: {
        messageKey: 'productUx.error.library.unreachable',
        recoveryActionKey: 'productUx.error.recovery.openSettings',
    },
};

export function mapPlaybackError(code: SourceAwareErrorCode): UserFacingError {
    return (
        PLAYBACK_ERROR_MAP[code] ?? {
            messageKey: 'productUx.error.playback.generic',
            recoveryActionKey: 'productUx.error.recovery.tryAgain',
        }
    );
}

export function mapHandoffError(rawMessage: string): UserFacingError {
    const normalized = rawMessage.toLowerCase();
    if (normalized.includes('nothing is playing')) {
        return { messageKey: 'productUx.error.devices.nothingPlaying' };
    }
    return {
        messageKey: 'productUx.error.devices.handoffUnavailable',
        recoveryActionKey: 'productUx.error.recovery.openSettings',
    };
}

export function mapImportError(_domain: UserErrorDomain = 'import'): UserFacingError {
    return {
        messageKey: 'productUx.error.import.failed',
        recoveryActionKey: 'productUx.error.recovery.tryAgain',
    };
}

const MESSAGE_CODE_PATTERNS: Array<{ code: SourceAwareErrorCode; pattern: RegExp }> = [
    { code: 'YT_STREAM_403', pattern: /\b403\b|forbidden/i },
    { code: 'YT_STREAM_EXPIRED', pattern: /expired|signature/i },
    { code: 'YT_AUTH_REQUIRED', pattern: /sign.?in|auth|login required/i },
    { code: 'YT_RATE_LIMITED', pattern: /rate.?limit/i },
    { code: 'YT_VIDEO_UNAVAILABLE', pattern: /unavailable|not found|private video/i },
    { code: 'YT_REGION_BLOCKED', pattern: /region|blocked|geo/i },
    { code: 'LOCAL_FILE_MISSING', pattern: /file.*not found|enoent|missing file/i },
    { code: 'NAVIDROME_OFFLINE', pattern: /navidrome|subsonic|personal library|econnrefused/i },
    { code: 'DOWNLOAD_FAILED', pattern: /download failed/i },
];

export function inferPlaybackErrorCode(message: string): SourceAwareErrorCode | undefined {
    const normalized = message.trim();
    if (!normalized) return undefined;

    for (const { code, pattern } of MESSAGE_CODE_PATTERNS) {
        if (pattern.test(normalized)) return code;
    }

    return undefined;
}

export function mapLibraryConnectionError(): UserFacingError {
    return {
        messageKey: 'productUx.error.library.unreachable',
        recoveryActionKey: 'productUx.error.recovery.openSettings',
    };
}

export function mapSearchError(): UserFacingError {
    return {
        messageKey: 'productUx.error.search.failed',
        recoveryActionKey: 'productUx.error.recovery.tryAgain',
    };
}
