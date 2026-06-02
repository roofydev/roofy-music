import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';

import { AnimatedPage } from '/@/renderer/features/shared/components/animated-page';
import { PageErrorBoundary } from '/@/renderer/features/shared/components/page-error-boundary';
import { Button } from '/@/shared/components/button/button';
import { Center } from '/@/shared/components/center/center';
import { Group } from '/@/shared/components/group/group';
import { Icon } from '/@/shared/components/icon/icon';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';

const InvalidRoute = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();

    return (
        <AnimatedPage>
            <Center style={{ height: '100%', width: '100%' }}>
                <Stack>
                    <Group justify="center" wrap="nowrap">
                        <Icon color="warn" icon="error" />
                        <Text size="xl">{t('productUx.route.invalidTitle')}</Text>
                    </Group>
                    <Text ta="center">{t('productUx.route.invalidDescription')}</Text>
                    <Text isMuted ta="center">
                        {location.pathname}
                    </Text>
                    <Group justify="center">
                        <Button onClick={() => navigate(-1)} variant="default">
                            {t('common.back')}
                        </Button>
                        <Button onClick={() => navigate('/')} variant="filled">
                            {t('common.home')}
                        </Button>
                    </Group>
                </Stack>
            </Center>
        </AnimatedPage>
    );
};

const InvalidRouteWithBoundary = () => {
    return (
        <PageErrorBoundary>
            <InvalidRoute />
        </PageErrorBoundary>
    );
};

export default InvalidRouteWithBoundary;
