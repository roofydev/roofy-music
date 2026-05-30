import isElectron from 'is-electron';
import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';

import { useSettingsStore, useSettingsStoreActions } from '/@/renderer/store/settings.store';
import { Spinner } from '/@/shared/components/spinner/spinner';
import { Tabs } from '/@/shared/components/tabs/tabs';

const GeneralTab = lazy(() =>
    import('/@/renderer/features/settings/components/general/general-tab').then((module) => ({
        default: module.GeneralTab,
    })),
);

const PlaybackTab = lazy(() =>
    import('/@/renderer/features/settings/components/playback/playback-tab').then((module) => ({
        default: module.PlaybackTab,
    })),
);

const AppearanceTab = lazy(() =>
    import('/@/renderer/features/settings/components/appearance/appearance-tab').then(
        (module) => ({
            default: module.AppearanceTab,
        }),
    ),
);

const DiscordTab = lazy(() =>
    import('/@/renderer/features/settings/components/discord/discord-tab').then((module) => ({
        default: module.DiscordTab,
    })),
);

const DevicesSettingsTab = lazy(() =>
    import('/@/renderer/features/settings/components/devices/devices-settings-tab').then(
        (module) => ({
            default: module.DevicesSettingsTab,
        }),
    ),
);

const DownloadsSettingsTab = lazy(() =>
    import('/@/renderer/features/settings/components/downloads/downloads-settings-tab').then(
        (module) => ({
            default: module.DownloadsSettingsTab,
        }),
    ),
);

const AdvancedTab = lazy(() =>
    import('/@/renderer/features/settings/components/advanced/advanced-tab').then((module) => ({
        default: module.AdvancedTab,
    })),
);

const resolveSettingsTab = (tab: string) => {
    if (tab === 'window' || tab === 'appearance') return 'appearance';
    if (tab === 'streaming') return 'downloads';
    if (tab === 'hotkeys' || tab === 'local') return 'advanced';
    return tab;
};

export const SettingsContent = () => {
    const { t } = useTranslation();
    const currentTab = useSettingsStore((state) => state.tab);
    const { setSettings } = useSettingsStoreActions();
    const activeTab = resolveSettingsTab(currentTab);

    return (
        <div
            style={{ height: 'min(76vh, 54rem)', overflow: 'auto', padding: '1rem', width: '100%' }}
        >
            <Tabs
                keepMounted={false}
                onChange={(e) => e && setSettings({ tab: e })}
                orientation="horizontal"
                value={activeTab}
                variant="default"
            >
                <Tabs.List>
                    <Tabs.Tab value="general">{t('page.setting.generalTab')}</Tabs.Tab>
                    <Tabs.Tab value="playback">{t('page.setting.playbackTab')}</Tabs.Tab>
                    {isElectron() && (
                        <Tabs.Tab value="downloads">
                            {t('page.setting.downloadsOffline')}
                        </Tabs.Tab>
                    )}
                    {isElectron() && (
                        <Tabs.Tab value="appearance">{t('page.setting.appearance')}</Tabs.Tab>
                    )}
                    {isElectron() && (
                        <Tabs.Tab value="discord">{t('page.setting.discord')}</Tabs.Tab>
                    )}
                    {isElectron() && (
                        <Tabs.Tab value="devices">{t('page.setting.devices')}</Tabs.Tab>
                    )}
                    <Tabs.Tab value="advanced">{t('page.setting.advanced')}</Tabs.Tab>
                </Tabs.List>
                <Tabs.Panel value="general">
                    <Suspense fallback={<Spinner container />}>
                        <GeneralTab />
                    </Suspense>
                </Tabs.Panel>
                <Tabs.Panel value="playback">
                    <Suspense fallback={<Spinner container />}>
                        <PlaybackTab />
                    </Suspense>
                </Tabs.Panel>
                {isElectron() && (
                    <Tabs.Panel value="downloads">
                        <Suspense fallback={<Spinner container />}>
                            <DownloadsSettingsTab />
                        </Suspense>
                    </Tabs.Panel>
                )}
                {isElectron() && (
                    <Tabs.Panel value="appearance">
                        <Suspense fallback={<Spinner container />}>
                            <AppearanceTab />
                        </Suspense>
                    </Tabs.Panel>
                )}
                {isElectron() && (
                    <Tabs.Panel value="discord">
                        <Suspense fallback={<Spinner container />}>
                            <DiscordTab />
                        </Suspense>
                    </Tabs.Panel>
                )}
                {isElectron() && (
                    <Tabs.Panel value="devices">
                        <Suspense fallback={<Spinner container />}>
                            <DevicesSettingsTab />
                        </Suspense>
                    </Tabs.Panel>
                )}
                <Tabs.Panel value="advanced">
                    <Suspense fallback={<Spinner container />}>
                        <AdvancedTab />
                    </Suspense>
                </Tabs.Panel>
            </Tabs>
        </div>
    );
};
