import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { DownloadsScreen } from '/@/renderer/features/imports/components/downloads-screen';
import { AnimatedPage } from '/@/renderer/features/shared/components/animated-page';
import { LibraryContainer } from '/@/renderer/features/shared/components/library-container';
import { LibraryHeaderBar } from '/@/renderer/features/shared/components/library-header-bar';
import { ListWithSidebarContainer } from '/@/renderer/features/shared/components/list-with-sidebar-container';
import { PageHeader } from '/@/renderer/components/page-header/page-header';
import { AppRoute } from '/@/renderer/router/routes';
import { Button } from '/@/shared/components/button/button';
import { Stack } from '/@/shared/components/stack/stack';

const ImportsRoute = () => {
    const { t } = useTranslation();

    return (
        <AnimatedPage>
            <LibraryContainer>
                <Stack gap={0} style={{ height: '100%', minHeight: 0 }}>
                    <PageHeader>
                        <LibraryHeaderBar ignoreMaxWidth>
                            <LibraryHeaderBar.Title>
                                {t('productUx.import.pageTitle')}
                            </LibraryHeaderBar.Title>
                            <Button
                                component={Link}
                                size="compact-sm"
                                to={`${AppRoute.LIBRARY_SONGS}?offline=1`}
                                variant="light"
                            >
                                {t('productUx.import.downloads.viewSavedSongs')}
                            </Button>
                        </LibraryHeaderBar>
                    </PageHeader>
                    <ListWithSidebarContainer>
                        <DownloadsScreen />
                    </ListWithSidebarContainer>
                </Stack>
            </LibraryContainer>
        </AnimatedPage>
    );
};

export default ImportsRoute;
