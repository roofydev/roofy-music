import { AnimatedPage } from '/@/renderer/features/shared/components/animated-page';
import { ImportsQueue } from '/@/renderer/features/imports/components/imports-queue';
import { LibraryContainer } from '/@/renderer/features/shared/components/library-container';

const ImportsRoute = () => {
    return (
        <AnimatedPage>
            <LibraryContainer>
                <ImportsQueue />
            </LibraryContainer>
        </AnimatedPage>
    );
};

export default ImportsRoute;
