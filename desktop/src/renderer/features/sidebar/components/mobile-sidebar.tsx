import isElectron from 'is-electron';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';

import styles from './mobile-sidebar.module.css';

import { ActionBar } from '/@/renderer/features/sidebar/components/action-bar';
import { SidebarIcon } from '/@/renderer/features/sidebar/components/sidebar-icon';
import { SidebarItem } from '/@/renderer/features/sidebar/components/sidebar-item';
import {
    SidebarPlaylistList,
    SidebarSharedPlaylistList,
} from '/@/renderer/features/sidebar/components/sidebar-playlist-list';
import { YoutubeMusicAccountButton } from '/@/renderer/features/youtube-music/components/youtube-music-account-button';
import { YoutubeMusicIcon } from '/@/renderer/features/youtube-music/components/youtube-music-icon';
import { AppRoute } from '/@/renderer/router/routes';
import { useImportJobs } from '/@/renderer/store';
import {
    SidebarItemType,
    useSidebarItems,
    useSidebarPlaylistList,
} from '/@/renderer/store/settings.store';
import { Accordion } from '/@/shared/components/accordion/accordion';
import { Group } from '/@/shared/components/group/group';
import { ScrollArea } from '/@/shared/components/scroll-area/scroll-area';
import { Text } from '/@/shared/components/text/text';

export const MobileSidebar = () => {
    const { t } = useTranslation();
    const location = useLocation();
    const sidebarPlaylistList = useSidebarPlaylistList();
    const showYoutubeMusic = isElectron();

    const translatedSidebarItemMap = useMemo(
        () => ({
            Albums: t('page.sidebar.albums'),
            Artists: t('page.sidebar.artists'),
            'Artists-all': t('page.sidebar.allArtists'),
            Favorites: t('page.sidebar.favorites'),
            Genres: t('page.sidebar.genres'),
            Home: t('page.sidebar.home'),
            Imports: t('productUx.import.pageTitle'),
            'Now Playing': t('page.sidebar.nowPlaying'),
            Offline: t('page.sidebar.offline'),
            'Online Music': t('page.sidebar.onlineMusic'),
            Party: t('productUx.party.together'),
            Playlists: t('page.sidebar.playlists'),
            Search: t('page.sidebar.search'),
            Settings: t('page.sidebar.settings'),
            Tracks: t('page.sidebar.tracks'),
        }),
        [t],
    );

    const sidebarItems = useSidebarItems();
    const importJobs = useImportJobs();
    const hasActionableImportJobs = useMemo(
        () =>
            Object.values(importJobs).some((job) =>
                ['failed', 'queued', 'running'].includes(job.status),
            ),
        [importJobs],
    );
    const youtubeMusicItems = useMemo(
        () => [
            {
                label: t('productUx.search.youtubeMusic.browse'),
                search: '?view=browse',
            },
            {
                label: t('common.search'),
                search: '?view=search',
            },
            {
                label: t('productUx.search.youtubeMusic.mySongs'),
                search: '?view=songs',
            },
            {
                label: t('productUx.search.youtubeMusic.myPlaylists'),
                search: '?view=playlists',
            },
        ],
        [t],
    );

    const sidebarItemsWithRoute: SidebarItemType[] = useMemo(() => {
        if (!sidebarItems) return [];

        const items = sidebarItems
            .filter(
                (item) =>
                    (!item.disabled || (item.id === 'Imports' && hasActionableImportJobs)) &&
                    !(showYoutubeMusic && item.id === 'Online Music'),
            )
            .map((item) => ({
                ...item,
                disabled: item.id === 'Imports' && hasActionableImportJobs ? false : item.disabled,
                label:
                    translatedSidebarItemMap[item.id as keyof typeof translatedSidebarItemMap] ??
                    item.label,
            }));

        return items;
    }, [hasActionableImportJobs, showYoutubeMusic, sidebarItems, translatedSidebarItemMap]);

    return (
        <div className={styles.container} id="mobile-sidebar">
            <Group grow id="global-search-container" style={{ flexShrink: 0 }}>
                <ActionBar />
            </Group>
            <ScrollArea allowDragScroll className={styles.scrollArea} scrollbarsAutoHide="leave">
                <Accordion
                    classNames={{
                        content: styles.accordionContent,
                        control: styles.accordionControl,
                        item: styles.accordionItem,
                        root: styles.accordionRoot,
                    }}
                    defaultValue={[
                        'library',
                        ...(showYoutubeMusic ? ['youtube-music'] : []),
                        'playlists',
                    ]}
                    multiple
                >
                    <Accordion.Item value="library">
                        <Accordion.Control>
                            <Text fw={600} variant="secondary">
                                {t('page.sidebar.myLibrary')}
                            </Text>
                        </Accordion.Control>
                        <Accordion.Panel>
                            {sidebarItemsWithRoute.map((item) => {
                                return (
                                    <SidebarItem key={`sidebar-${item.route}`} to={item.route}>
                                        <Group gap="sm">
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
                                <Group align="center" gap="xs" justify="space-between" wrap="nowrap">
                                    <Group align="center" gap="xs" wrap="nowrap">
                                        <YoutubeMusicIcon size="1rem" />
                                        <Text fw={600} variant="secondary">
                                            {t('page.sidebar.youtubeMusic')}
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
                                            <Group gap="sm">
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
                    {sidebarPlaylistList && (
                        <>
                            <SidebarPlaylistList />
                            <SidebarSharedPlaylistList />
                        </>
                    )}
                </Accordion>
            </ScrollArea>
        </div>
    );
};
