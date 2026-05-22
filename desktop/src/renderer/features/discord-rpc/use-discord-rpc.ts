import type { SetActivity } from '@xhayper/discord-rpc';

import isElectron from 'is-electron';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '/@/renderer/api';
import { useItemImageUrl } from '/@/renderer/components/item-image/item-image';
import {
    useIsRadioActive,
    useRadioPlayer,
} from '/@/renderer/features/radio/hooks/use-radio-player';
import {
    DiscordDisplayType,
    DiscordLinkType,
    useAppStore,
    useDiscordSettings,
    useLastfmApiKey,
    usePlayerSong,
    usePlayerStore,
    useSettingsStore,
    useTimestampStoreBase,
} from '/@/renderer/store';
import { getServerById } from '/@/renderer/store/auth.store';
import { sentenceCase } from '/@/renderer/utils';
import { LogCategory, logFn } from '/@/renderer/utils/logger';
import { logMsg } from '/@/renderer/utils/logger-message';
import { useDebouncedCallback } from '/@/shared/hooks/use-debounced-callback';
import { LibraryItem, QueueSong, ServerType } from '/@/shared/types/domain-types';
import { PlayerStatus } from '/@/shared/types/types';

const discordRpc = isElectron() ? window.api.discordRpc : null;

const DiscordStatusDisplayType = {
    DETAILS: 2,
    NAME: 0,
    STATE: 1,
} as const;

type ActivityState = [QueueSong | undefined, number, PlayerStatus];

const MAX_FIELD_LENGTH = 127;
const MAX_URL_LENGTH = 256;

const truncate = (field: string) =>
    field.length <= MAX_FIELD_LENGTH ? field : field.substring(0, MAX_FIELD_LENGTH - 1) + '…';

const isPrivateIpv4Host = (hostname: string) => {
    const parts = hostname.split('.').map((part) => Number(part));

    if (
        parts.length !== 4 ||
        parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
    ) {
        return false;
    }

    const [first, second] = parts;

    return (
        first === 0 ||
        first === 10 ||
        first === 127 ||
        (first === 169 && second === 254) ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168)
    );
};

const isDiscordFetchableImageUrl = (imageUrl?: null | string): imageUrl is string => {
    if (!imageUrl) {
        return false;
    }

    try {
        const url = new URL(imageUrl);
        const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
        const isIpv6Host = hostname.includes(':');

        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            return false;
        }

        if (
            hostname === 'localhost' ||
            hostname === '::1' ||
            hostname.endsWith('.local') ||
            isPrivateIpv4Host(hostname) ||
            (isIpv6Host &&
                (hostname.startsWith('fc') ||
                    hostname.startsWith('fd') ||
                    hostname.startsWith('fe80:')))
        ) {
            return false;
        }

        return true;
    } catch {
        return false;
    }
};

const firstDiscordFetchableImageUrl = (...imageUrls: Array<null | string | undefined>) =>
    imageUrls.find(isDiscordFetchableImageUrl) ?? undefined;

type ItunesSearchResponse = {
    results?: Array<{
        artistName?: string;
        artworkUrl100?: string;
        collectionName?: string;
        trackName?: string;
    }>;
};

type MusicBrainzRecordingResponse = {
    releases?: Array<{ id?: string }>;
};

const publicArtworkCache = new Map<string, null | string>();

const normalizeSearchText = (value?: null | string) =>
    (value || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const includesNormalized = (source?: null | string, target?: null | string) => {
    const normalizedSource = normalizeSearchText(source);
    const normalizedTarget = normalizeSearchText(target);

    return Boolean(
        normalizedSource &&
        normalizedTarget &&
        (normalizedSource.includes(normalizedTarget) ||
            normalizedTarget.includes(normalizedSource)),
    );
};

const highResolutionItunesArtworkUrl = (imageUrl?: string) => {
    if (!imageUrl) {
        return undefined;
    }

    return imageUrl.replace(/\/\d+x\d+bb\.(jpg|png|webp)$/i, '/600x600bb.$1');
};

const getPublicArtworkCacheKey = (song: QueueSong) =>
    [
        song._serverId,
        song.id,
        normalizeSearchText(song.name),
        normalizeSearchText(song.artistName),
        normalizeSearchText(song.album),
    ].join('|');

const fetchItunesArtworkUrl = async (song: QueueSong) => {
    const term = [song.name, song.artistName, song.album].filter(Boolean).join(' ');

    if (!term) {
        return undefined;
    }

    const response = await fetch(
        `https://itunes.apple.com/search?${new URLSearchParams({
            entity: 'song',
            limit: '10',
            media: 'music',
            term,
        }).toString()}`,
    );

    if (!response.ok) {
        return undefined;
    }

    const data = (await response.json()) as ItunesSearchResponse;
    const results = data.results || [];

    const scoredResults = results
        .map((result) => {
            let score = 0;

            if (includesNormalized(result.trackName, song.name)) score += 4;
            if (includesNormalized(result.artistName, song.artistName)) score += 3;
            if (includesNormalized(result.collectionName, song.album)) score += 2;

            return { result, score };
        })
        .filter(({ result, score }) => score > 0 && result.artworkUrl100)
        .sort((a, b) => b.score - a.score);

    const imageUrl = highResolutionItunesArtworkUrl(scoredResults[0]?.result.artworkUrl100);

    return firstDiscordFetchableImageUrl(imageUrl);
};

const fetchMusicBrainzCoverArtUrl = async (song: QueueSong) => {
    const recordingId = song.mbzRecordingId || song.mbzTrackId;

    if (!recordingId) {
        return undefined;
    }

    const response = await fetch(
        `https://musicbrainz.org/ws/2/recording/${encodeURIComponent(recordingId)}?inc=releases&fmt=json`,
    );

    if (!response.ok) {
        return undefined;
    }

    const data = (await response.json()) as MusicBrainzRecordingResponse;
    const releaseId = data.releases?.find((release) => release.id)?.id;

    if (!releaseId) {
        return undefined;
    }

    return firstDiscordFetchableImageUrl(
        `https://coverartarchive.org/release/${encodeURIComponent(releaseId)}/front-500`,
    );
};

const resolvePublicArtworkUrl = async (song: QueueSong) => {
    const cacheKey = getPublicArtworkCacheKey(song);

    if (publicArtworkCache.has(cacheKey)) {
        return publicArtworkCache.get(cacheKey) || undefined;
    }

    const resolvers = [fetchItunesArtworkUrl, fetchMusicBrainzCoverArtUrl];

    for (const resolver of resolvers) {
        try {
            const imageUrl = await resolver(song);

            if (isDiscordFetchableImageUrl(imageUrl)) {
                publicArtworkCache.set(cacheKey, imageUrl);
                return imageUrl;
            }
        } catch {
            /* empty */
        }
    }

    publicArtworkCache.set(cacheKey, null);
    return undefined;
};

export const useDiscordRpc = () => {
    const discordSettings = useDiscordSettings();
    const lastfmApiKey = useLastfmApiKey();
    const privateMode = useAppStore((state) => state.privateMode);
    const [lastUniqueId, setlastUniqueId] = useState('');

    const isRadioActive = useIsRadioActive();
    const { isPlaying: isRadioPlaying, metadata: radioMetadata, stationName } = useRadioPlayer();

    const currentSong = usePlayerSong();
    const imageUrl = useItemImageUrl({
        id: currentSong?.imageId || undefined,
        imageUrl: currentSong?.imageUrl,
        itemType: LibraryItem.SONG,
        type: 'table',
        useRemoteUrl: true,
    });

    const imageUrlRef = useRef<null | string | undefined>(imageUrl);
    const previousEnabledRef = useRef<boolean>(discordSettings.enabled);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const previousActivityStateRef = useRef<ActivityState | null>(null);
    const previousLargeImageKeyRef = useRef<null | string>(null);

    // Update imageUrl ref when it changes
    useEffect(() => {
        imageUrlRef.current = imageUrl;
    }, [imageUrl]);

    const setActivity = useCallback(
        async (current: ActivityState, previous: ActivityState) => {
            // Check if track changed by comparing with previous state
            const song = current[0];
            const previousSong = previous[0];
            const trackChangedByState =
                song && previousSong
                    ? song._uniqueId !== previousSong._uniqueId
                    : song !== previousSong;
            const trackChanged = song ? lastUniqueId !== song._uniqueId : false;

            const isPlayingRadio = isRadioActive && isRadioPlaying;
            const hasTrackOrRadio = Boolean(current[0]) || isPlayingRadio;

            if (
                !hasTrackOrRadio || // No track and not playing radio
                (current[2] === 'paused' && !discordSettings.showPaused) // Paused with show paused setting disabled
            ) {
                let reason: string;
                if (!hasTrackOrRadio) {
                    reason = current[0] ? 'no_track' : 'no_track_or_radio';
                } else if (current[1] === 0 && !isPlayingRadio) {
                    reason = 'start_of_track';
                } else {
                    reason = 'paused_with_show_paused_disabled';
                }

                logFn.debug(logMsg[LogCategory.EXTERNAL].discordRpcActivityCleared, {
                    category: LogCategory.EXTERNAL,
                    meta: {
                        reason,
                        status: current[2],
                    },
                });
                return discordRpc?.clearActivity();
            }

            if (isPlayingRadio) {
                const title = radioMetadata?.title || stationName || 'Radio';
                const artist = radioMetadata?.artist || stationName || '';

                const activity: SetActivity = {
                    details: truncate(title),
                    instance: false,
                    largeImageKey: 'icon',
                    largeImageText: truncate(stationName || 'Radio'),
                    name: 'Roofy Music Desktop',
                    smallImageKey:
                        current[2] === PlayerStatus.PLAYING
                            ? discordSettings.showStateIcon
                                ? 'playing'
                                : undefined
                            : 'paused',
                    smallImageText:
                        current[2] === PlayerStatus.PLAYING
                            ? discordSettings.showStateIcon
                                ? sentenceCase(current[2])
                                : undefined
                            : sentenceCase(current[2]),
                    state: truncate(artist),
                    statusDisplayType: DiscordStatusDisplayType.STATE,
                    type: discordSettings.showAsListening ? 2 : 0,
                };

                const isConnected = await discordRpc?.isConnected();
                if (!isConnected) {
                    logFn.debug(logMsg[LogCategory.EXTERNAL].discordRpcInitialized, {
                        category: LogCategory.EXTERNAL,
                        meta: { clientId: discordSettings.clientId },
                    });
                    previousEnabledRef.current = true;
                    await discordRpc?.initialize(discordSettings.clientId);
                }

                logFn.debug(logMsg[LogCategory.EXTERNAL].discordRpcSetActivity, {
                    category: LogCategory.EXTERNAL,
                    meta: {
                        currentStatus: current[2],
                        reason: 'radio',
                        showAsListening: discordSettings.showAsListening,
                        stationName: stationName || 'Radio',
                        title,
                    },
                });
                discordRpc?.setActivity(activity);
                return;
            }

            if (!song) {
                return;
            }

            const currentLargeImageKey =
                firstDiscordFetchableImageUrl(imageUrlRef.current, song.imageUrl) ||
                imageUrlRef.current ||
                song.imageUrl ||
                song.imageId ||
                undefined;
            const largeImageChanged = currentLargeImageKey !== previousLargeImageKeyRef.current;

            /*
                1. If the song has just started, update status
                2. If we jump more then 1.2 seconds from last state, update status to match
                3. If the current song id is completely different, update status
                4. If the player state changed, update status
                5. If the song artwork resolved after the last update, refresh the image
            */
            if (
                previous[1] === 0 ||
                Math.abs(current[1] - previous[1]) > 1.2 ||
                trackChangedByState ||
                trackChanged ||
                current[2] !== previous[2] ||
                largeImageChanged
            ) {
                if (trackChangedByState || trackChanged) {
                    logFn.debug(logMsg[LogCategory.EXTERNAL].discordRpcTrackChanged, {
                        category: LogCategory.EXTERNAL,
                        meta: {
                            artistName: song.artists?.[0]?.name,
                            songId: song._uniqueId,
                            songName: song.name,
                        },
                    });
                    setlastUniqueId(song._uniqueId);
                }

                let reason: string;
                if (trackChangedByState || trackChanged) {
                    reason = 'track_changed';
                } else if (previous[1] === 0) {
                    reason = 'song_started';
                } else if (Math.abs(current[1] - previous[1]) > 1.2) {
                    reason = 'time_jump';
                } else if (largeImageChanged) {
                    reason = 'image_changed';
                } else {
                    reason = 'player_state_changed';
                }

                const start = Math.round(Date.now() - current[1] * 1000);
                const end = Math.round(start + song.duration);

                const artists = song?.artists.map((artist) => artist.name).join(', ');

                const statusDisplayMap = {
                    [DiscordDisplayType.ARTIST_NAME]: DiscordStatusDisplayType.STATE,
                    [DiscordDisplayType.ROOFY]: DiscordStatusDisplayType.NAME,
                    [DiscordDisplayType.SONG_NAME]: DiscordStatusDisplayType.DETAILS,
                };

                const activity: SetActivity = {
                    details: truncate((song?.name && song.name.padEnd(2, ' ')) || 'Idle'),
                    instance: false,
                    largeImageKey: undefined,
                    largeImageText: truncate(
                        (song?.album && song.album.padEnd(2, ' ')) || 'Unknown album',
                    ),
                    name: 'Roofy Music Desktop',
                    smallImageKey: undefined,
                    smallImageText: undefined,
                    state: truncate((artists && artists.padEnd(2, ' ')) || 'Unknown artist'),
                    statusDisplayType: statusDisplayMap[discordSettings.displayType],
                    // I would love to use the actual type as opposed to hardcoding to 2,
                    // but manually installing the discord-types package appears to break things
                    type: discordSettings.showAsListening ? 2 : 0,
                };

                if (
                    (discordSettings.linkType == DiscordLinkType.LAST_FM ||
                        discordSettings.linkType == DiscordLinkType.MBZ_LAST_FM) &&
                    song?.artistName
                ) {
                    activity.stateUrl =
                        'https://www.last.fm/music/' + encodeURIComponent(song.artists[0].name);

                    const detailsUrl =
                        'https://www.last.fm/music/' +
                        encodeURIComponent(song.albumArtists[0].name) +
                        '/' +
                        encodeURIComponent(song.album || '_') +
                        '/' +
                        encodeURIComponent(song.name);

                    // The details URL has a max length, only set it if it doesn't exceed it
                    if (detailsUrl.length <= MAX_URL_LENGTH) {
                        activity.detailsUrl = detailsUrl;
                    }
                }

                if (
                    discordSettings.linkType == DiscordLinkType.MBZ ||
                    discordSettings.linkType == DiscordLinkType.MBZ_LAST_FM
                ) {
                    if (song?.mbzTrackId) {
                        activity.detailsUrl = 'https://musicbrainz.org/track/' + song.mbzTrackId;
                    } else if (song?.mbzRecordingId) {
                        activity.detailsUrl =
                            'https://musicbrainz.org/recording/' + song.mbzRecordingId;
                    }
                }

                if (current[2] === PlayerStatus.PLAYING) {
                    if (start && end) {
                        activity.startTimestamp = start;
                        activity.endTimestamp = end;
                    }

                    if (discordSettings.showStateIcon) {
                        activity.smallImageKey = 'playing';
                        activity.smallImageText = sentenceCase(current[2]);
                    }
                } else {
                    activity.smallImageKey = 'paused';
                    activity.smallImageText = sentenceCase(current[2]);
                }

                const uploadLocalArtwork = async (
                    ...imageUrls: Array<null | string | undefined>
                ) => {
                    const imageUrl = imageUrls.find(
                        (url): url is string => Boolean(url) && !isDiscordFetchableImageUrl(url),
                    );

                    if (!imageUrl) {
                        return undefined;
                    }

                    return (
                        (await discordRpc?.uploadArtwork({
                            cacheKey: [
                                song._serverId,
                                song.imageId || song.id,
                                normalizeSearchText(song.name),
                                imageUrl,
                            ].join('|'),
                            imageUrl,
                            webhookUrl: discordSettings.artworkWebhookUrl || undefined,
                        })) || undefined
                    );
                };

                if (song) {
                    // 1. Use the pre-computed image URL from the hook.
                    activity.largeImageKey = firstDiscordFetchableImageUrl(imageUrlRef.current);

                    // 2. Fallback to the song's direct imageUrl if available.
                    if (!activity.largeImageKey && isDiscordFetchableImageUrl(song.imageUrl)) {
                        activity.largeImageKey = song.imageUrl;
                    }

                    if (!activity.largeImageKey) {
                        activity.largeImageKey = await uploadLocalArtwork(
                            imageUrlRef.current,
                            song.imageUrl,
                        );
                    }

                    // 3. Generate an absolute URL from the song's imageId.
                    if (!activity.largeImageKey && song.imageId) {
                        const server = getServerById(song._serverId);
                        const baseUrl = server?.remoteUrl || server?.url;
                        const generatedUrl = api.controller.getImageUrl({
                            apiClientProps: { serverId: song._serverId },
                            baseUrl,
                            query: { id: song.imageId, itemType: LibraryItem.SONG },
                        });
                        if (isDiscordFetchableImageUrl(generatedUrl)) {
                            activity.largeImageKey = generatedUrl;
                        }

                        if (!activity.largeImageKey) {
                            activity.largeImageKey = await uploadLocalArtwork(generatedUrl);
                        }
                    }

                    // 4. Fallback: try album endpoint for Navidrome/Subsonic.
                    if (
                        !activity.largeImageKey &&
                        (song._serverType === ServerType.NAVIDROME ||
                            song._serverType === ServerType.SUBSONIC)
                    ) {
                        try {
                            const info = await api.controller.getAlbumInfo({
                                apiClientProps: {
                                    forceRemoteUrl: true,
                                    serverId: song._serverId,
                                },
                                query: { id: song.albumId },
                            });

                            if (isDiscordFetchableImageUrl(info.imageUrl)) {
                                activity.largeImageKey = info.imageUrl;
                            }

                            if (!activity.largeImageKey) {
                                activity.largeImageKey = await uploadLocalArtwork(info.imageUrl);
                            }
                        } catch {
                            /* empty */
                        }
                    }

                    if (!activity.largeImageKey) {
                        activity.largeImageKey = await resolvePublicArtworkUrl(song);
                    }

                    logFn.debug('Discord RPC image resolution', {
                        category: LogCategory.EXTERNAL,
                        meta: {
                            imageId: song.imageId,
                            imageUrl: song.imageUrl,
                            imageUrlFetchable: isDiscordFetchableImageUrl(song.imageUrl),
                            imageUrlRef: imageUrlRef.current,
                            imageUrlRefFetchable: isDiscordFetchableImageUrl(imageUrlRef.current),
                            largeImageKey: activity.largeImageKey,
                            localArtworkUploadProvider: discordSettings.artworkWebhookUrl
                                ? 'discord-webhook'
                                : 'uguu',
                            serverType: song._serverType,
                            songId: song._uniqueId,
                        },
                    });
                }

                if (
                    activity.largeImageKey === undefined &&
                    lastfmApiKey &&
                    song?.album &&
                    song?.albumArtists.length
                ) {
                    const albumInfo = await fetch(
                        `https://ws.audioscrobbler.com/2.0/?method=album.getinfo&api_key=${lastfmApiKey}&artist=${encodeURIComponent(song.albumArtists[0].name)}&album=${encodeURIComponent(song.album)}&format=json`,
                    );

                    const albumInfoJson = await albumInfo.json();

                    if (isDiscordFetchableImageUrl(albumInfoJson.album?.image?.[3]['#text'])) {
                        activity.largeImageKey = albumInfoJson.album.image[3]['#text'];
                    }
                }

                // Fall back to default icon if not set
                if (!activity.largeImageKey) {
                    activity.largeImageKey = 'icon';
                }

                // Initialize if needed
                const isConnected = await discordRpc?.isConnected();
                if (!isConnected) {
                    logFn.debug(logMsg[LogCategory.EXTERNAL].discordRpcInitialized, {
                        category: LogCategory.EXTERNAL,
                        meta: {
                            clientId: discordSettings.clientId,
                        },
                    });

                    previousEnabledRef.current = true;

                    await discordRpc?.initialize(discordSettings.clientId);
                }

                logFn.debug(logMsg[LogCategory.EXTERNAL].discordRpcSetActivity, {
                    category: LogCategory.EXTERNAL,
                    meta: {
                        albumName: song.album,
                        artistName: song.artists?.[0]?.name,
                        currentStatus: current[2],
                        currentTime: current[1],
                        displayType: discordSettings.displayType,
                        hasLargeImage: !!activity.largeImageKey,
                        hasTimestamps: !!(activity.startTimestamp && activity.endTimestamp),
                        previousStatus: previous[2],
                        previousTime: previous[1],
                        reason,
                        showAsListening: discordSettings.showAsListening,
                        songName: song.name,
                        trackChanged: trackChangedByState || trackChanged,
                    },
                });
                discordRpc?.setActivity(activity);
                previousLargeImageKeyRef.current = currentLargeImageKey || null;
            } else {
                logFn.debug(logMsg[LogCategory.EXTERNAL].discordRpcUpdateSkipped, {
                    category: LogCategory.EXTERNAL,
                    meta: {
                        currentStatus: current[2],
                        currentTime: current[1],
                        previousStatus: previous[2],
                        previousTime: previous[1],
                        timeDiff: Math.abs(current[1] - previous[1]),
                        trackChanged: trackChangedByState || trackChanged,
                    },
                });
            }
        },
        [
            discordSettings.showAsListening,
            discordSettings.artworkWebhookUrl,
            discordSettings.showStateIcon,
            discordSettings.showPaused,
            lastfmApiKey,
            discordSettings.clientId,
            discordSettings.displayType,
            discordSettings.linkType,
            lastUniqueId,
            isRadioActive,
            isRadioPlaying,
            radioMetadata?.artist,
            radioMetadata?.title,
            stationName,
        ],
    );

    const debouncedSetActivity = useDebouncedCallback(setActivity, 500);

    // Quit Discord RPC if it was enabled and is now disabled
    useEffect(() => {
        if ((!discordSettings.enabled || privateMode) && Boolean(previousEnabledRef.current)) {
            logFn.info(logMsg[LogCategory.EXTERNAL].discordRpcQuit, {
                category: LogCategory.EXTERNAL,
                meta: {
                    enabled: discordSettings.enabled,
                    privateMode,
                },
            });

            previousEnabledRef.current = false;

            return discordRpc?.quit();
        }
    }, [discordSettings.clientId, privateMode, discordSettings.enabled]);

    useEffect(() => {
        if (!discordSettings.enabled || privateMode) {
            return;
        }

        const getCurrentActivityState = (): ActivityState => {
            const state = usePlayerStore.getState();
            const currentSong = state.getCurrentSong();
            const currentTime = useTimestampStoreBase.getState().timestamp;
            const status = state.player.status;
            return [currentSong, currentTime, status];
        };

        const resetInterval = () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
            intervalRef.current = setInterval(() => {
                const current = getCurrentActivityState();
                const previous = previousActivityStateRef.current || current;
                debouncedSetActivity(current, previous);
                previousActivityStateRef.current = current;
            }, 15000);
        };

        resetInterval();

        const initialState = getCurrentActivityState();
        let previousUniqueId = initialState[0]?._uniqueId || '';

        previousActivityStateRef.current = initialState;

        // Set activity immediately when Discord RPC is enabled
        debouncedSetActivity(initialState, initialState);

        const unsubSongChange = usePlayerStore.subscribe(
            (state): ActivityState => {
                const currentSong = state.getCurrentSong();
                const currentTime = useTimestampStoreBase.getState().timestamp;
                const status = state.player.status;

                return [currentSong, currentTime, status];
            },
            (current, previous) => {
                const currentUniqueId = current[0]?._uniqueId || '';
                const trackChanged = previousUniqueId !== currentUniqueId;

                if (trackChanged && current[0]) {
                    resetInterval();
                    previousUniqueId = currentUniqueId;
                }

                const activity: ActivityState = [
                    current[0] as QueueSong,
                    current[1] as number,
                    current[2] as PlayerStatus,
                ];

                // Use the ref as the source of truth for previous state
                const previousActivity: ActivityState =
                    previousActivityStateRef.current ||
                    (previous
                        ? [
                              previous[0] as QueueSong,
                              previous[1] as number,
                              previous[2] as PlayerStatus,
                          ]
                        : activity);

                debouncedSetActivity(activity, previousActivity);

                previousActivityStateRef.current = activity;
            },
        );

        return () => {
            unsubSongChange();
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [
        debouncedSetActivity,
        discordSettings.clientId,
        discordSettings.enabled,
        privateMode,
        setActivity,
    ]);
};

const DiscordRpcHookInner = () => {
    useDiscordRpc();
    return null;
};

export const DiscordRpcHook = () => {
    const isElectronEnv = isElectron();
    const isDiscordRpcEnabled = useSettingsStore((state) => state.discord.enabled);
    const isPrivateMode = useAppStore((state) => state.privateMode);
    const discordRpc = isElectronEnv ? window.api.discordRpc : null;

    if (!isElectronEnv || !discordRpc || !isDiscordRpcEnabled || isPrivateMode) {
        return null;
    }

    return React.createElement(DiscordRpcHookInner);
};
