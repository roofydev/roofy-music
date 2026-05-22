import { useState } from 'react';

import { SettingsContent } from '/@/renderer/features/settings/components/settings-content';
import { SettingsHeader } from '/@/renderer/features/settings/components/settings-header';
import { SettingSearchContext } from '/@/renderer/features/settings/context/search-context';
import { AnimatedPage } from '/@/renderer/features/shared/components/animated-page';
import { LibraryContainer } from '/@/renderer/features/shared/components/library-container';
import { NativeScrollArea } from '/@/renderer/components/native-scroll-area/native-scroll-area';

const SettingsRoute = () => {
    const [search, setSearch] = useState('');

    return (
        <AnimatedPage>
            <SettingSearchContext.Provider value={search}>
                <NativeScrollArea
                    pageHeaderProps={{
                        backgroundColor: 'var(--theme-colors-background)',
                        children: <SettingsHeader setSearch={setSearch} />,
                        offset: 50,
                    }}
                >
                    <LibraryContainer>
                        <SettingsContent />
                    </LibraryContainer>
                </NativeScrollArea>
            </SettingSearchContext.Provider>
        </AnimatedPage>
    );
};

export default SettingsRoute;
