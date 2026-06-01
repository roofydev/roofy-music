import isElectron from 'is-electron';
import { memo } from 'react';
import { Fragment } from 'react/jsx-runtime';

import { PasswordSettings } from '/@/renderer/features/settings/components/window/password-settings';
import { WindowSettings } from '/@/renderer/features/settings/components/window/window-settings';
import { Divider } from '/@/shared/components/divider/divider';
import { Stack } from '/@/shared/components/stack/stack';

const utils = window.api?.utils ?? null;

/** @deprecated Use AppearanceTab — kept for deep links that still mount WindowTab */
const sections = [
    { component: WindowSettings, key: 'window' },
    { component: PasswordSettings, hidden: !utils?.isLinux(), key: 'password' },
];

export const WindowTab = memo(() => {
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
