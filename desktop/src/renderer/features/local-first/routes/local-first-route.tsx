import { useTranslation } from 'react-i18next';

import { NativeScrollArea } from '/@/renderer/components/native-scroll-area/native-scroll-area';
import { LocalTab } from '/@/renderer/features/settings/components/local/local-tab';
import { AnimatedPage } from '/@/renderer/features/shared/components/animated-page';
import { LibraryContainer } from '/@/renderer/features/shared/components/library-container';
import { LibraryHeaderBar } from '/@/renderer/features/shared/components/library-header-bar';
import { Group } from '/@/shared/components/group/group';
import { Icon } from '/@/shared/components/icon/icon';

const LocalFirstRoute = () => {
    const { t } = useTranslation();

    return (
        <AnimatedPage>
            <NativeScrollArea
                pageHeaderProps={{
                    backgroundColor: 'var(--theme-colors-background)',
                    children: (
                        <LibraryHeaderBar>
                            <Group wrap="nowrap">
                                <Icon icon="server" size="5xl" />
                                <LibraryHeaderBar.Title>
                                    {t('productUx.personalLibrary.settingsTitle')}
                                </LibraryHeaderBar.Title>
                            </Group>
                        </LibraryHeaderBar>
                    ),
                    offset: 50,
                }}
            >
                <LibraryContainer>
                    <LocalTab />
                </LibraryContainer>
            </NativeScrollArea>
        </AnimatedPage>
    );
};

export default LocalFirstRoute;
