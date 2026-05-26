import { PageHeader } from '/@/renderer/components/page-header/page-header';
import { ImportsQueue } from '/@/renderer/features/imports/components/imports-queue';
import { AnimatedPage } from '/@/renderer/features/shared/components/animated-page';
import { FilterBar } from '/@/renderer/features/shared/components/filter-bar';
import { LibraryContainer } from '/@/renderer/features/shared/components/library-container';
import { LibraryHeaderBar } from '/@/renderer/features/shared/components/library-header-bar';
import { ListWithSidebarContainer } from '/@/renderer/features/shared/components/list-with-sidebar-container';
import { Stack } from '/@/shared/components/stack/stack';

const ImportsRoute = () => {
    return (
        <AnimatedPage>
            <LibraryContainer>
                <Stack gap={0} style={{ height: '100%', minHeight: 0 }}>
                    <PageHeader>
                        <LibraryHeaderBar ignoreMaxWidth>
                            <LibraryHeaderBar.Title>Imports / Downloads</LibraryHeaderBar.Title>
                        </LibraryHeaderBar>
                    </PageHeader>
                    <FilterBar />
                    <ListWithSidebarContainer>
                        <ImportsQueue />
                    </ListWithSidebarContainer>
                </Stack>
            </LibraryContainer>
        </AnimatedPage>
    );
};

export default ImportsRoute;
