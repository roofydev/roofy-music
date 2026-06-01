export const isSafariBrowser = () => {
    if (typeof navigator === 'undefined') {
        return false;
    }

    const ua = navigator.userAgent;
    return /Safari/i.test(ua) && !/Chrom(?:e|ium)|CriOS|Edg|OPR|Firefox|FxiOS/i.test(ua);
};

export const configurePartyAudioElement = (audio: HTMLAudioElement) => {
    audio.preload = 'auto';
    audio.preservesPitch = true;
    audio.setAttribute('playsinline', 'true');
    audio.setAttribute('webkit-playsinline', 'true');

    const legacySafariAudio = audio as HTMLAudioElement & { webkitPreservesPitch?: boolean };
    if ('webkitPreservesPitch' in legacySafariAudio) {
        legacySafariAudio.webkitPreservesPitch = true;
    }
};
