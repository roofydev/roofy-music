import { generatePath } from 'react-router';

import { AppRoute } from '/@/renderer/router/routes';
import type { SidebarItemType } from '/@/renderer/store/settings.store';
import { LibraryItem } from '/@/shared/types/domain-types';

/** Top-level sidebar entries rendered above the library accordion (not inside it). */
export const PRIMARY_SIDEBAR_NAV_IDS = new Set<string>(['Search', 'Now Playing', 'Settings']);

const PRIMARY_SIDEBAR_NAV_ROUTES = new Set<string>([
    AppRoute.NOW_PLAYING,
    AppRoute.SETTINGS,
    generatePath(AppRoute.SEARCH, { itemType: LibraryItem.SONG }),
]);

export const dedupeSidebarItemsById = (items: SidebarItemType[]): SidebarItemType[] => {
    const seen = new Set<string>();
    return items.filter((item) => {
        if (seen.has(item.id)) {
            return false;
        }
        seen.add(item.id);
        return true;
    });
};

export const isPrimarySidebarNavItem = (item: SidebarItemType): boolean => {
    const routePath = typeof item.route === 'string' ? item.route.split('?')[0] : item.route;
    return PRIMARY_SIDEBAR_NAV_IDS.has(item.id) || PRIMARY_SIDEBAR_NAV_ROUTES.has(routePath);
};
