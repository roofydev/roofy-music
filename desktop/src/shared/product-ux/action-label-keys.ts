/**
 * Canonical i18n keys for user-facing track and product actions.
 * Mobile should mirror these keys when the Android app shares the same namespace.
 */
export const PRODUCT_UX_ACTION_KEYS = {
    addToLibrary: 'productUx.action.addToLibrary',
    addToLibraryAudioOnly: 'productUx.action.addToLibraryAudioOnly',
    addToLibraryWithVideo: 'productUx.action.addToLibraryWithVideo',
    addToPlaylist: 'action.addToPlaylist',
    addToQueue: 'productUx.action.addToQueue',
    connectPersonalLibrary: 'productUx.action.connectPersonalLibrary',
    connectPhone: 'productUx.action.connectPhone',
    continueOnDevice: 'productUx.action.continueOnDevice',
    play: 'player.play',
    playNext: 'productUx.action.playNext',
    playShuffled: 'player.shuffle',
    saveOffline: 'productUx.action.saveOffline',
    tryAnotherVersion: 'productUx.action.tryAnotherVersion',
    updateSongInfo: 'productUx.action.updateSongInfo',
    viewOriginalLink: 'productUx.action.viewOriginalLink',
    watchVideo: 'productUx.action.watchVideo',
} as const;

export type ProductUxActionKey =
    (typeof PRODUCT_UX_ACTION_KEYS)[keyof typeof PRODUCT_UX_ACTION_KEYS];
