import i18n from '/@/i18n/i18n';
import { JellyfinController } from '/@/renderer/api/jellyfin/jellyfin-controller';
import { NavidromeController } from '/@/renderer/api/navidrome/navidrome-controller';
import { SubsonicController } from '/@/renderer/api/subsonic/subsonic-controller';
import { mergeMusicFolderId } from '/@/renderer/api/utils-music-folder';
import { YoutubeMusicController } from '/@/renderer/api/youtube-music/youtube-music-controller';
import { getServerById, useAuthStore, useSettingsStore } from '/@/renderer/store';
import { toast } from '/@/shared/components/toast/toast';
import {
    AuthenticationResponse,
    ControllerEndpoint,
    InternalControllerEndpoint,
    ServerType,
    SetPlaylistSongsArgs,
    SetPlaylistSongsResponse,
} from '/@/shared/types/domain-types';
import { YOUTUBE_MUSIC_SOURCE_ID } from '/@/shared/types/youtube-music-types';

type ApiController = {
    jellyfin: Partial<InternalControllerEndpoint>;
    navidrome: Partial<InternalControllerEndpoint>;
    subsonic: Partial<InternalControllerEndpoint>;
    youtube_music: Partial<InternalControllerEndpoint>;
};

const endpoints: ApiController = {
    jellyfin: JellyfinController,
    navidrome: NavidromeController,
    subsonic: SubsonicController,
    youtube_music: YoutubeMusicController,
};

const apiController = <K extends keyof ControllerEndpoint>(
    endpoint: K,
    type?: ServerType,
): NonNullable<InternalControllerEndpoint[K]> => {
    const serverType = type || useAuthStore.getState().currentServer?.type;

    if (!serverType) {
        toast.error({
            message: i18n.t('error.serverNotSelectedError') as string,
            title: i18n.t('error.apiRouteError') as string,
        });
        throw new Error(`No server selected`);
    }

    const controllerFn = endpoints?.[serverType]?.[endpoint];

    if (typeof controllerFn !== 'function') {
        toast.error({
            message: `Endpoint ${endpoint} is not implemented for ${serverType}`,
            title: i18n.t('error.apiRouteError') as string,
        });

        throw new Error(
            i18n.t('error.endpointNotImplementedError', {
                endpoint,

                serverType,
            }) as string,
        );
    }

    return controllerFn as NonNullable<InternalControllerEndpoint[K]>;
};

const getControllerServerById = (id?: string) => {
    const server = getServerById(id);
    if (server) return server;
    if (id === YOUTUBE_MUSIC_SOURCE_ID) {
        return {
            credential: YOUTUBE_MUSIC_SOURCE_ID,
            id: YOUTUBE_MUSIC_SOURCE_ID,
            name: 'YouTube Music',
            type: ServerType.YOUTUBE_MUSIC,
            url: 'https://music.youtube.com',
            userId: YOUTUBE_MUSIC_SOURCE_ID,
            username: 'YouTube Music',
        };
    }
    return null;
};

const getPathReplaceSettings = () => {
    const { pathReplace, pathReplaceWith } = useSettingsStore.getState().general;
    return { pathReplace, pathReplaceWith };
};

const addContext = <T extends { apiClientProps: any; context?: any }>(args: T): T => {
    const pathSettings = getPathReplaceSettings();

    return {
        ...args,
        context: {
            ...(args.context || {}),
            ...pathSettings,
        },
    };
};

export interface GeneralController extends Omit<Required<ControllerEndpoint>, 'authenticate'> {
    authenticate: (
        url: string,
        body: { legacy?: boolean; password: string; username: string },
        type: ServerType,
    ) => Promise<AuthenticationResponse>;
}

export const controller: GeneralController = {
    addToPlaylist(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: addToPlaylist`);
        }

        return apiController(
            'addToPlaylist',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    authenticate(url, body, type) {
        return apiController('authenticate', type)(url, body);
    },
    createFavorite(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: createFavorite`);
        }

        return apiController(
            'createFavorite',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    createInternetRadioStation(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: createInternetRadioStation`);
        }

        return apiController(
            'createInternetRadioStation',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    createPlaylist(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: createPlaylist`);
        }

        return apiController(
            'createPlaylist',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    deleteArtistImage(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: deleteArtistImage`);
        }

        return apiController(
            'deleteArtistImage',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    deleteFavorite(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: deleteFavorite`);
        }

        return apiController(
            'deleteFavorite',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    deleteInternetRadioStation(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: deleteInternetRadioStation`);
        }

        return apiController(
            'deleteInternetRadioStation',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    deleteInternetRadioStationImage(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: deleteInternetRadioStationImage`);
        }

        return apiController(
            'deleteInternetRadioStationImage',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    deletePlaylist(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: deletePlaylist`);
        }

        return apiController(
            'deletePlaylist',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    deletePlaylistImage(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: deletePlaylistImage`);
        }

        return apiController(
            'deletePlaylistImage',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    getAlbumArtistDetail(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: getAlbumArtistDetail`);
        }

        return apiController(
            'getAlbumArtistDetail',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    getAlbumArtistInfo(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            return Promise.resolve(null);
        }

        const fn = apiController('getAlbumArtistInfo', server.type);
        return fn
            ? fn(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }))
            : Promise.resolve(null);
    },
    getAlbumArtistList(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: getAlbumArtistList`);
        }

        return apiController(
            'getAlbumArtistList',
            server.type,
        )?.(
            addContext({
                ...args,
                apiClientProps: { ...args.apiClientProps, server },
                query: mergeMusicFolderId(args.query, server),
            }),
        );
    },
    getAlbumArtistListCount(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: getAlbumArtistListCount`);
        }

        return apiController(
            'getAlbumArtistListCount',
            server.type,
        )?.(
            addContext({
                ...args,
                apiClientProps: { ...args.apiClientProps, server },
                query: mergeMusicFolderId(args.query, server),
            }),
        );
    },
    getAlbumDetail(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: getAlbumDetail`);
        }

        return apiController(
            'getAlbumDetail',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    getAlbumInfo(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: getAlbumInfo`);
        }

        return apiController(
            'getAlbumInfo',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    getAlbumList(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: getAlbumList`);
        }

        return apiController(
            'getAlbumList',
            server.type,
        )?.(
            addContext({
                ...args,
                apiClientProps: { ...args.apiClientProps, server },
                query: mergeMusicFolderId(args.query, server),
            }),
        );
    },
    getAlbumListCount(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: getAlbumListCount`);
        }

        return apiController(
            'getAlbumListCount',
            server.type,
        )?.(
            addContext({
                ...args,
                apiClientProps: { ...args.apiClientProps, server },
                query: mergeMusicFolderId(args.query, server),
            }),
        );
    },
    getAlbumRadio(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: getAlbumRadio`);
        }

        return apiController(
            'getAlbumRadio',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    getArtistList(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: getArtistList`);
        }

        return apiController(
            'getArtistList',
            server.type,
        )?.(
            addContext({
                ...args,
                apiClientProps: { ...args.apiClientProps, server },
                query: mergeMusicFolderId(args.query, server),
            }),
        );
    },
    getArtistListCount(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: getArtistListCount`);
        }

        return apiController(
            'getArtistListCount',
            server.type,
        )?.(
            addContext({
                ...args,
                apiClientProps: { ...args.apiClientProps, server },
                query: mergeMusicFolderId(args.query, server),
            }),
        );
    },
    getArtistRadio(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: getArtistRadio`);
        }

        return apiController(
            'getArtistRadio',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    getDownloadUrl(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: getDownloadUrl`);
        }

        return apiController(
            'getDownloadUrl',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    getFolder(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: getFolder`);
        }

        return apiController(
            'getFolder',
            server.type,
        )?.(
            addContext({
                ...args,
                apiClientProps: { ...args.apiClientProps, server },
                query: mergeMusicFolderId(args.query, server),
            }),
        );
    },
    getGenreList(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: getGenreList`);
        }

        return apiController(
            'getGenreList',
            server.type,
        )?.(
            addContext({
                ...args,
                apiClientProps: { ...args.apiClientProps, server },
                query: mergeMusicFolderId(args.query, server),
            }),
        );
    },
    getImageRequest(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            return null;
        }

        return (
            apiController(
                'getImageRequest',
                server.type,
            )?.(
                addContext({
                    ...args,
                    apiClientProps: { ...args.apiClientProps, server },
                }),
            ) || null
        );
    },
    getImageUrl(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            return null;
        }

        return (
            apiController(
                'getImageUrl',
                server.type,
            )?.(
                addContext({
                    ...args,
                    apiClientProps: { ...args.apiClientProps, server },
                }),
            ) || null
        );
    },
    getInternetRadioStations(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: getInternetRadioStations`);
        }
        return apiController(
            'getInternetRadioStations',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    getLyrics(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: getLyrics`);
        }

        return apiController(
            'getLyrics',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    getMusicFolderList(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: getMusicFolderList`);
        }

        return apiController(
            'getMusicFolderList',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    getPlaylistDetail(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: getPlaylistDetail`);
        }

        return apiController(
            'getPlaylistDetail',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    getPlaylistList(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: getPlaylistList`);
        }

        return apiController(
            'getPlaylistList',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    getPlaylistListCount(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: getPlaylistListCount`);
        }

        return apiController(
            'getPlaylistListCount',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    getPlaylistSongList(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: getPlaylistSongList`);
        }

        return apiController(
            'getPlaylistSongList',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    getPlayQueue(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: getPlayQueue`);
        }

        return apiController(
            'getPlayQueue',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    getRandomSongList(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: getRandomSongList`);
        }

        return apiController(
            'getRandomSongList',
            server.type,
        )?.(
            addContext({
                ...args,
                apiClientProps: { ...args.apiClientProps, server },
                query: mergeMusicFolderId(args.query, server),
            }),
        );
    },
    getRoles(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: getRoles`);
        }

        return apiController(
            'getRoles',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    getServerInfo(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: getServerInfo`);
        }

        return apiController(
            'getServerInfo',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    getSimilarSongs(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: getSimilarSongs`);
        }

        return apiController(
            'getSimilarSongs',
            server.type,
        )?.(
            addContext({
                ...args,
                apiClientProps: { ...args.apiClientProps, server },
                query: mergeMusicFolderId(args.query, server),
            }),
        );
    },
    getSongDetail(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: getSongDetail`);
        }

        return apiController(
            'getSongDetail',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    getSongList(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: getSongList`);
        }

        return apiController(
            'getSongList',
            server.type,
        )?.(
            addContext({
                ...args,
                apiClientProps: { ...args.apiClientProps, server },
                query: mergeMusicFolderId(args.query, server),
            }),
        );
    },
    getSongListCount(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: getSongListCount`);
        }

        return apiController(
            'getSongListCount',
            server.type,
        )?.(
            addContext({
                ...args,
                apiClientProps: { ...args.apiClientProps, server },
                query: mergeMusicFolderId(args.query, server),
            }),
        );
    },
    getStreamUrl(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: getStreamUrl`);
        }

        return apiController(
            'getStreamUrl',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    getStructuredLyrics(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: getStructuredLyrics`);
        }

        return apiController(
            'getStructuredLyrics',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    getTagList(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: getTags`);
        }

        return apiController(
            'getTagList',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    getTopSongs(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: getTopSongs`);
        }

        return apiController(
            'getTopSongs',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    getUserInfo(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: getUserInfo`);
        }

        return apiController(
            'getUserInfo',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    getUserList(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: getUserList`);
        }

        return apiController(
            'getUserList',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    movePlaylistItem(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: movePlaylistItem`);
        }

        return apiController(
            'movePlaylistItem',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    removeFromPlaylist(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: removeFromPlaylist`);
        }

        return apiController(
            'removeFromPlaylist',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    replacePlaylist(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: replacePlaylist`);
        }

        return apiController(
            'replacePlaylist',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    savePlayQueue(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: savePlayQueue`);
        }

        return apiController(
            'savePlayQueue',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    scrobble(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: scrobble`);
        }

        return apiController(
            'scrobble',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    search(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: search`);
        }

        return apiController(
            'search',
            server.type,
        )?.(
            addContext({
                ...args,
                apiClientProps: { ...args.apiClientProps, server },
                query: mergeMusicFolderId(args.query, server),
            }),
        );
    },
    setPlaylistSongs: function (args: SetPlaylistSongsArgs): Promise<SetPlaylistSongsResponse> {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: setPlaylistSongs`);
        }

        return apiController(
            'setPlaylistSongs',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    setRating(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: setRating`);
        }

        return apiController(
            'setRating',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    shareItem(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: shareItem`);
        }

        return apiController(
            'shareItem',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    updateInternetRadioStation(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: updateInternetRadioStation`);
        }

        return apiController(
            'updateInternetRadioStation',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    updatePlaylist(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: updatePlaylist`);
        }

        return apiController(
            'updatePlaylist',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    uploadArtistImage(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: uploadArtistImage`);
        }

        return apiController(
            'uploadArtistImage',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    uploadInternetRadioStationImage(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: uploadInternetRadioStationImage`);
        }

        return apiController(
            'uploadInternetRadioStationImage',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
    uploadPlaylistImage(args) {
        const server = getControllerServerById(args.apiClientProps.serverId);

        if (!server) {
            throw new Error(`${i18n.t('error.apiRouteError')}: uploadPlaylistImage`);
        }

        return apiController(
            'uploadPlaylistImage',
            server.type,
        )?.(addContext({ ...args, apiClientProps: { ...args.apiClientProps, server } }));
    },
};
