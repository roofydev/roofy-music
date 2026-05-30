import isElectron from 'is-electron';
import { lazy, memo, Suspense } from 'react';
import { Fragment } from 'react/jsx-runtime';

import { AnalyticsSettings } from '/@/renderer/features/settings/components/advanced/analytics-settings';
import { ExportImportSettings } from '/@/renderer/features/settings/components/advanced/export-import-settings';
import { LoggerSettings } from '/@/renderer/features/settings/components/advanced/logger-settings';
import { QueryBuilderSettings } from '/@/renderer/features/settings/components/general/query-builder-settings';
import { useCurrentServer } from '/@/renderer/store';
import { hasFeature } from '/@/shared/api/utils';
import { ServerFeature } from '/@/shared/types/features-types';
import { CacheSettings } from '/@/renderer/features/settings/components/window/cache-settngs';
import { RemoteSettings } from '/@/renderer/features/settings/components/window/remote-settings';
import { UpdateSettings } from '/@/renderer/features/settings/components/window/update-settings';
import { Divider } from '/@/shared/components/divider/divider';
import { Spinner } from '/@/shared/components/spinner/spinner';
import { Stack } from '/@/shared/components/stack/stack';

const HotkeysTab = lazy(() =>
    import('/@/renderer/features/settings/components/hotkeys/hotkeys-tab').then((module) => ({
        default: module.HotkeysTab,
    })),
);

const LocalTab = lazy(() =>
    import('/@/renderer/features/settings/components/local/local-tab').then((module) => ({
        default: module.LocalTab,
    })),
);

const sections = [
    { component: UpdateSettings, key: 'update' },
    { component: AnalyticsSettings, key: 'analytics' },
    { component: ExportImportSettings, key: 'export-import' },
    { component: LoggerSettings, key: 'logger' },
    { component: CacheSettings, key: 'cache' },
];

const AdvancedQueryBuilder = () => {
    const server = useCurrentServer();
    if (!hasFeature(server, ServerFeature.PLAYLISTS_SMART)) {
        return null;
    }

    return (
        <>
            <QueryBuilderSettings />
            <Divider />
        </>
    );
};

export const AdvancedTab = memo(() => {
    return (
        <Stack gap="md">
            {isElectron() && (
                <>
                    <Suspense fallback={<Spinner container />}>
                        <LocalTab />
                    </Suspense>
                    <Divider />
                    <RemoteSettings advanced />
                    <Divider />
                </>
            )}
            {sections.map(({ component: Section, key }, index) => (
                <Fragment key={key}>
                    <Section />
                    {index < sections.length - 1 && <Divider />}
                </Fragment>
            ))}
            <AdvancedQueryBuilder />
            <Suspense fallback={<Spinner container />}>
                <HotkeysTab />
            </Suspense>
        </Stack>
    );
});
