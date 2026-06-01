import clsx from 'clsx';
import isElectron from 'is-electron';
import { MouseEvent, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';

import styles from './sidebar.module.css';

import { useItemImageUrl } from '/@/renderer/components/item-image/item-image';
import { ContextMenuController } from '/@/renderer/features/context-menu/context-menu-controller';
import {
    useSongVideoAvailability,
    VideoModeOverlay,
} from '/@/renderer/features/player/components/local-video-player';
import {
    useIsRadioActive,
    useRadioPlayer,
} from '/@/renderer/features/radio/hooks/use-radio-player';
import { ActionBar } from '/@/renderer/features/sidebar/components/action-bar';
import { SidebarCollectionList } from '/@/renderer/features/sidebar/components/sidebar-collection-list';
import { SidebarIcon } from '/@/renderer/features/sidebar/components/sidebar-icon';
import { SidebarItem } from '/@/renderer/features/sidebar/components/sidebar-item';
import {
    SidebarPlaylistList,
    SidebarSharedPlaylistList,
} from '/@/renderer/features/sidebar/components/sidebar-playlist-list';
import {
    dedupeSidebarItemsById,
    isPrimarySidebarNavItem,
    PRIMARY_SIDEBAR_NAV_IDS,
} from '/@/renderer/features/sidebar/sidebar-nav-utils';
import { YoutubeMusicAccountButton } from '/@/renderer/features/youtube-music/components/youtube-music-account-button';
import { YoutubeMusicIcon } from '/@/renderer/features/youtube-music/components/youtube-music-icon';
import { AppRoute } from '/@/renderer/router/routes';
import {
    useAppStore,
    useAppStoreActions,
    useFullScreenPlayerStore,
    useFullScreenPlayerStoreActions,
    useGeneralSettings,
    usePlayerSong,
    useSetFullScreenPlayerStore,
} from '/@/renderer/store';
import {
    SidebarItemType,
    useSidebarItems,
    useSidebarPlaylistList,
    useWindowSettings,
} from '/@/renderer/store/settings.store';
import { Accordion } from '/@/shared/components/accordion/accordion';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Center } from '/@/shared/components/center/center';
import { Group } from '/@/shared/components/group/group';
import { Icon } from '/@/shared/components/icon/icon';
import { ImageUnloader } from '/@/shared/components/image/image';
import { ScrollArea } from '/@/shared/components/scroll-area/scroll-area';
import { Text } from '/@/shared/components/text/text';
import { Tooltip } from '/@/shared/components/tooltip/tooltip';
import { ExplicitStatus, LibraryItem } from '/@/shared/types/domain-types';
import { Platform } from '/@/shared/types/types';

export const Sidebar = () => {
    const { t } = useTranslation();

    const sidebarPlaylistList = useSidebarPlaylistList();
    const location = useLocation();

    const translatedSidebarItemMap = useMemo(
        () => ({
            Albums: t('page.sidebar.albums'),
            Artists: t('page.sidebar.albumArtists'),
            'Artists-all': t('page.sidebar.artists'),
            Collections: t('page.sidebar.collections'),
            Favorites: t('page.sidebar.favorites'),
            Folders: t('page.sidebar.folders'),
            Genres: t('page.sidebar.genres'),
            Home: t('page.sidebar.home'),
            'Now Playing': t('page.sidebar.nowPlaying'),
            Playlists: t('page.sidebar.playlists'),
            Radio: t('page.sidebar.radio'),
            Search: t('page.sidebar.search'),
            Settings: t('page.sidebar.settings'),
            Stats: t('page.sidebar.stats'),
            Tracks: t('page.sidebar.tracks'),
            Offline: t('page.sidebar.offline'),
        }),
        [t],
    );

    const sidebarItems = useSidebarItems();
    const { windowBarStyle } = useWindowSettings();
    const sidebarImageEnabled = useAppStore((state) => state.sidebar.image);
    const showImage = sidebarImageEnabled;

    const sidebarItemsWithRoute: SidebarItemType[] = useMemo(() => {
        if (!sidebarItems) return [];

        const items = dedupeSidebarItemsById(sidebarItems)
            .filter((item) => !item.disabled && item.route !== AppRoute.LOCAL_FIRST)
            .map((item) => ({
                ...item,
                label:
                    translatedSidebarItemMap[item.id as keyof typeof translatedSidebarItemMap] ??
                    item.label,
            }));

        return items;
    }, [sidebarItems, translatedSidebarItemMap]);

    const primaryNavItems = useMemo(
        () => sidebarItemsWithRoute.filter((item) => PRIMARY_SIDEBAR_NAV_IDS.has(item.id)),
        [sidebarItemsWithRoute],
    );

    /* Library accordion: library routes only (not top-level nav) */
    const libraryItemsWithRoute = useMemo(
        () =>
            sidebarItemsWithRoute.filter(
                (item) =>
                    item.id !== 'Collections' &&
                    item.id !== 'Home' &&
                    item.id !== 'Offline' &&
                    !isPrimarySidebarNavItem(item) &&
                    item.route,
            ),
        [sidebarItemsWithRoute],
    );
    const homeItem = useMemo(
        () => sidebarItemsWithRoute.find((item) => item.id === 'Home' && item.route),
        [sidebarItemsWithRoute],
    );

    const isCustomWindowBar =
        windowBarStyle === Platform.WINDOWS || windowBarStyle === Platform.MACOS;
    const showYoutubeMusic = isElectron();
    const youtubeMusicItems = useMemo(
        () => [
            { label: t('productUx.search.youtubeMusic.browse'), search: '?view=browse' },
            { label: t('common.search'), search: '?view=search' },
            { label: t('productUx.search.youtubeMusic.mySongs'), search: '?view=songs' },
            { label: t('productUx.search.youtubeMusic.myPlaylists'), search: '?view=playlists' },
        ],
        [t],
    );

    return (
        <div
            className={clsx(styles.container, {
                [styles.customBar]: isCustomWindowBar,
            })}
            id="left-sidebar"
        >
            <Group grow id="global-search-container" style={{ flexShrink: 0 }}>
                <ActionBar />
            </Group>
            <ScrollArea allowDragScroll className={styles.scrollArea} scrollbarsAutoHide="leave">
                {homeItem && (
                    <SidebarItem to={homeItem.route}>
                        <Group gap="md">
                            <SidebarIcon route={homeItem.route} />
                            {homeItem.label}
                        </Group>
                    </SidebarItem>
                )}
                {primaryNavItems.map((item) => (
                    <SidebarItem key={`sidebar-primary-${item.id}`} to={item.route}>
                        <Group gap="md">
                            <SidebarIcon route={item.route} />
                            {item.label}
                        </Group>
                    </SidebarItem>
                ))}
                <Accordion
                    classNames={{
                        content: styles.accordionContent,
                        control: styles.accordionControl,
                        item: styles.accordionItem,
                        root: styles.accordionRoot,
                    }}
                    defaultValue={['library', 'youtube-music', 'collections', 'playlists']}
                    multiple
                    transitionDuration={0}
                >
                    <Accordion.Item value="library">
                        <Accordion.Control>
                            <Text fw={500} variant="secondary">
                                {t('page.sidebar.myLibrary')}
                            </Text>
                        </Accordion.Control>
                        <Accordion.Panel>
                            {libraryItemsWithRoute.map((item) => {
                                return (
                                    <SidebarItem key={`sidebar-${item.route}`} to={item.route}>
                                        <Group gap="md">
                                            <SidebarIcon route={item.route} />
                                            {item.label}
                                        </Group>
                                    </SidebarItem>
                                );
                            })}
                        </Accordion.Panel>
                    </Accordion.Item>
                    {showYoutubeMusic && (
                        <Accordion.Item value="youtube-music">
                            <Accordion.Control>
                                <Group
                                    align="center"
                                    className={styles.youtubeMusicHeader}
                                    gap="xs"
                                    justify="space-between"
                                    wrap="nowrap"
                                >
                                    <Group align="center" gap="xs" wrap="nowrap">
                                        <YoutubeMusicIcon size="1rem" />
                                        <Text fw={500} variant="secondary">
                                            {t('page.sidebar.online')}
                                        </Text>
                                    </Group>
                                    <YoutubeMusicAccountButton compact labelMode="auth-only" />
                                </Group>
                            </Accordion.Control>
                            <Accordion.Panel>
                                {youtubeMusicItems.map((item) => {
                                    const to = `${AppRoute.YOUTUBE_MUSIC}${item.search}`;
                                    return (
                                        <SidebarItem key={item.search} to={to}>
                                            <Group gap="md">
                                                <SidebarIcon
                                                    active={
                                                        location.pathname ===
                                                            AppRoute.YOUTUBE_MUSIC &&
                                                        location.search === item.search
                                                    }
                                                    route={AppRoute.YOUTUBE_MUSIC}
                                                />
                                                {item.label}
                                            </Group>
                                        </SidebarItem>
                                    );
                                })}
                            </Accordion.Panel>
                        </Accordion.Item>
                    )}
                    <SidebarCollectionList />
                    {sidebarPlaylistList && (
                        <>
                            <SidebarPlaylistList />
                            <SidebarSharedPlaylistList />
                        </>
                    )}
                </Accordion>
            </ScrollArea>
            {showImage && <SidebarImage />}
        </div>
    );
};

const SidebarImage = () => {
    const { t } = useTranslation();
    const { setSideBar } = useAppStoreActions();
    const currentSong = usePlayerSong();
    const { canPlayVideo, isCheckingVideo, metadata: videoMetadata, videoUnavailable } =
        useSongVideoAvailability();
    const videoButtonDisabled = videoUnavailable || isCheckingVideo;
    const isRadioActive = useIsRadioActive();
    const { currentStationArt, isPlaying: isRadioPlaying } = useRadioPlayer();
    const { blurExplicitImages } = useGeneralSettings();

    const imageUrl = useItemImageUrl({
        id: currentSong?.imageId || undefined,
        imageUrl: currentSong?.imageUrl,
        itemType: LibraryItem.SONG,
        serverId: currentSong?._serverId,
        type: 'sidebar',
    });

    const radioImageUrl = useItemImageUrl({
        id: isRadioActive ? currentStationArt?.imageId || undefined : undefined,
        imageUrl: isRadioActive ? currentStationArt?.imageUrl || undefined : undefined,
        itemType: LibraryItem.RADIO_STATION,
        serverId: isRadioActive ? currentStationArt?.serverId : undefined,
        type: 'sidebar',
    });

    const isPlayingRadio = isRadioActive && isRadioPlaying;
    const isSongDefined = Boolean(currentSong?.id);

    const setFullScreenPlayerStore = useSetFullScreenPlayerStore();
    const {
        expanded: isFullScreenPlayerExpanded,
        videoFullscreen,
        visualMode,
    } = useFullScreenPlayerStore();
    const { setStore } = useFullScreenPlayerStoreActions();
    const showVideo =
        !isPlayingRadio && canPlayVideo && visualMode === 'video' && !videoFullscreen;
    const showVisualModeToggle = !isPlayingRadio && isSongDefined;

    useEffect(() => {
        if (!canPlayVideo && visualMode === 'video') {
            setStore({ visualMode: 'image' });
        }
    }, [canPlayVideo, setStore, visualMode]);

    const expandFullScreenPlayer = () => {
        setFullScreenPlayerStore({ expanded: !isFullScreenPlayerExpanded });
    };

    const handleToggleContextMenu = (e: MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();

        if (!currentSong || isPlayingRadio) {
            return;
        }

        if (isSongDefined && !isFullScreenPlayerExpanded) {
            ContextMenuController.call({
                cmd: { items: [currentSong!], type: LibraryItem.SONG },
                event: e,
            });
        }
    };

    return (
        <div
            className={styles.imageContainer}
            onClick={expandFullScreenPlayer}
            onContextMenu={handleToggleContextMenu}
            role="button"
            style={{ aspectRatio: 1 }}
        >
            <Tooltip label={t('player.toggleFullscreenPlayer')}>
                {showVideo && videoMetadata ? (
                    <VideoModeOverlay metadata={videoMetadata} />
                ) : isRadioActive && radioImageUrl ? (
                    <img className={styles.sidebarImage} loading="eager" src={radioImageUrl} />
                ) : isRadioActive ? (
                    <Center
                        className={styles.sidebarImage}
                        style={{
                            background: 'var(--theme-colors-surface)',
                            borderRadius: 'var(--theme-card-default-radius)',
                            height: '100%',
                            width: '100%',
                        }}
                    >
                        <Icon color="muted" icon="radio" size="40%" />
                    </Center>
                ) : imageUrl ? (
                    <img
                        className={clsx(styles.sidebarImage, {
                            [styles.censored]:
                                currentSong?.explicitStatus === ExplicitStatus.EXPLICIT &&
                                blurExplicitImages,
                        })}
                        loading="eager"
                        src={imageUrl}
                    />
                ) : (
                    <ImageUnloader icon="emptySongImage" />
                )}
            </Tooltip>
            {showVisualModeToggle && (
                <div className={styles.sidebarVisualToggle}>
                    <button
                        className={styles.sidebarVisualButton}
                        data-active={!showVideo}
                        onClick={(e) => {
                            e.stopPropagation();
                            setStore({ visualMode: 'image' });
                        }}
                        title="Show artwork"
                        type="button"
                    >
                        <Icon icon="image" size="md" />
                    </button>
                    <button
                        className={clsx(styles.sidebarVisualButton, {
                            [styles.sidebarVisualButtonDisabled]: videoButtonDisabled,
                        })}
                        data-active={showVideo}
                        disabled={videoButtonDisabled}
                        onClick={(e) => {
                            e.stopPropagation();
                            setStore({ visualMode: 'video' });
                        }}
                        title={
                            videoButtonDisabled
                                ? isCheckingVideo
                                    ? 'Checking for video…'
                                    : 'No video available for this track'
                                : 'Show video'
                        }
                        type="button"
                    >
                        <Icon icon="mediaPlay" size="md" />
                    </button>
                </div>
            )}
            <ActionIcon
                icon="arrowDownS"
                iconProps={{
                    size: 'lg',
                }}
                onClick={(e) => {
                    e.stopPropagation();
                    setSideBar({ image: false });
                }}
                opacity={0.8}
                radius="md"
                style={{
                    cursor: 'default',
                    position: 'absolute',
                    right: '1rem',
                    top: '1rem',
                }}
                tooltip={{
                    label: t('common.collapse'),
                    openDelay: 500,
                }}
            />
        </div>
    );
};
