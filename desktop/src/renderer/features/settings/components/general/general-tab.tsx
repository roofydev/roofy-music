import { memo, useMemo } from 'react';
import { Fragment } from 'react/jsx-runtime';

import { ApplicationSettings } from '/@/renderer/features/settings/components/general/application-settings';
import { ControlSettings } from '/@/renderer/features/settings/components/general/control-settings';
import { ExternalLinksSettings } from '/@/renderer/features/settings/components/general/external-links-settings';
import { ScrobbleSettings } from '/@/renderer/features/settings/components/general/scrobble-settings';
import { SidebarSettings } from '/@/renderer/features/settings/components/general/sidebar-settings';
import { Divider } from '/@/shared/components/divider/divider';
import { Stack } from '/@/shared/components/stack/stack';

export const GeneralTab = memo(() => {
    const sections = useMemo(
        () => [
            { component: ApplicationSettings, key: 'application' },
            { component: ExternalLinksSettings, key: 'externalLinks' },
            { component: ControlSettings, key: 'control' },
            { component: SidebarSettings, key: 'sidebar' },
            { component: ScrobbleSettings, key: 'scrobble' },
        ],
        [],
    );

    return (
        <Stack gap="md">
            {sections.map(({ component: Section, key }, index) => (
                <Fragment key={key}>
                    <Section />
                    {index < sections.length - 1 && <Divider />}
                </Fragment>
            ))}
        </Stack>
    );
});
