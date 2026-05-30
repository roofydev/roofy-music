/**
 * Canonical i18n keys for user-facing track and product actions.
 * Mobile should mirror these keys when the Android app shares the same namespace.
 */
export const PRODUCT_UX_ACTION_KEYS = {
    addToLibrary: 'productUx.action.addToLibrary',
    addToLibraryAudioOnly: 'productUx.action.addToLibraryAudioOnly',
    addToLibraryWithVideo: 'productUx.action.addToLibraryWithVideo',
    addToPlaylist: 'action.addToPlaylist',
    addToQueue: 'player.addLast',
    play: 'player.play',
    playNext: 'player.addNext',
    playShuffled: 'player.shuffle',
    saveOffline: 'productUx.action.saveOffline',
    updateSongInfo: 'productUx.action.updateSongInfo',
    watchVideo: 'productUx.action.watchVideo',
    viewOriginalLink: 'productUx.action.viewOriginalLink',
    tryAnotherVersion: 'productUx.action.tryAnotherVersion',
    continueOnDevice: 'productUx.action.continueOnDevice',
    connectPhone: 'productUx.action.connectPhone',
    connectPersonalLibrary: 'productUx.action.connectPersonalLibrary',
} as const;

export type ProductUxActionKey =
    (typeof PRODUCT_UX_ACTION_KEYS)[keyof typeof PRODUCT_UX_ACTION_KEYS];
