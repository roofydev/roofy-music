import type { TFunction } from 'i18next';

import { toast } from '/@/shared/components/toast/toast';
import type { SourceAwareErrorCode } from '/@/shared/types/music-source-types';

import {
    inferPlaybackErrorCode,
    mapHandoffError,
    mapImportError,
    mapLibraryConnectionError,
    mapPlaybackError,
    mapSearchError,
} from './user-error-messages';

export function logTechnicalError(context: string, error: unknown) {
    console.error(`[${context}]`, error);
}

function formatUserFacingToast(t: TFunction, mapped: { messageKey: string; recoveryActionKey?: string }) {
    const message = t(mapped.messageKey);
    const recovery = mapped.recoveryActionKey ? t(mapped.recoveryActionKey) : undefined;
    return recovery ? `${message} ${recovery}` : message;
}

export function showPlaybackError(
    t: TFunction,
    error: unknown,
    code?: SourceAwareErrorCode,
) {
    logTechnicalError('playback', error);
    const mapped = code
        ? mapPlaybackError(code)
        : {
              messageKey: 'productUx.error.playback.generic',
              recoveryActionKey: 'productUx.error.recovery.tryAgain',
          };
    toast.error({
        message: formatUserFacingToast(t, mapped),
        title: t('player.play'),
    });
}

export function showPlaybackErrorFromUnknown(t: TFunction, error: unknown) {
    const rawMessage =
        error instanceof Error ? error.message : typeof error === 'string' ? error : '';
    const code = inferPlaybackErrorCode(rawMessage);
    showPlaybackError(t, error, code);
}

export function showImportError(t: TFunction, error: unknown) {
    logTechnicalError('import', error);
    const mapped = mapImportError();
    toast.error({
        message: t(mapped.messageKey),
        title: t('productUx.action.addToLibrary'),
    });
}

export function showHandoffError(t: TFunction, rawMessage: string) {
    logTechnicalError('handoff', rawMessage);
    const mapped = mapHandoffError(rawMessage);
    toast.warn({
        message: t(mapped.messageKey),
        title: t('productUx.action.continueOnDevice'),
    });
}

export function showLibraryConnectionError(t: TFunction, error?: unknown) {
    if (error) logTechnicalError('library', error);
    const mapped = mapLibraryConnectionError();
    toast.error({
        message: formatUserFacingToast(t, mapped),
        title: t('productUx.personalLibrary.settingsTab'),
    });
}

export function showSearchError(t: TFunction, error?: unknown) {
    if (error) logTechnicalError('search', error);
    const mapped = mapSearchError();
    toast.error({
        message: formatUserFacingToast(t, mapped),
        title: t('page.sidebar.search'),
    });
}

export function showGenericUserError(
    t: TFunction,
    messageKey: string,
    titleKey: string,
    error?: unknown,
) {
    if (error) logTechnicalError(titleKey, error);
    toast.error({
        message: t(messageKey),
        title: t(titleKey),
    });
}
