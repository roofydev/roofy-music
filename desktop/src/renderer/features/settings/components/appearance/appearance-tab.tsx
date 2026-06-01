import isElectron from 'is-electron';
import { Fragment, memo } from 'react';

import { ThemeSettings } from '/@/renderer/features/settings/components/general/theme-settings';
import { PasswordSettings } from '/@/renderer/features/settings/components/window/password-settings';
import { WindowSettings } from '/@/renderer/features/settings/components/window/window-settings';
import { Divider } from '/@/shared/components/divider/divider';
import { Stack } from '/@/shared/components/stack/stack';

const utils = window.api?.utils ?? null;

const sections = [
    { component: ThemeSettings, key: 'theme' },
    { component: WindowSettings, key: 'window' },
    { component: PasswordSettings, hidden: !utils?.isLinux(), key: 'password' },
];

export const AppearanceTab = memo(() => {
    if (!isElectron()) {
        return null;
    }

    return (
        <Stack gap="md">
            {sections.map(({ component: Section, hidden, key }, index) => (
                <Fragment key={key}>
                    {!hidden && <Section />}
                    {index < sections.length - 1 && <Divider />}
                </Fragment>
            ))}
        </Stack>
    );
});
