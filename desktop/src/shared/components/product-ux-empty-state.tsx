import { useTranslation } from 'react-i18next';

import { Box } from '/@/shared/components/box/box';
import { AppIconSelection, Icon } from '/@/shared/components/icon/icon';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';

interface ProductUxEmptyStateProps {
    descriptionKey: string;
    icon?: AppIconSelection;
    titleKey: string;
}

export function ProductUxEmptyState({
    descriptionKey,
    icon = 'library',
    titleKey,
}: ProductUxEmptyStateProps) {
    const { t } = useTranslation();

    return (
        <Box aria-live="polite" p="xl" role="status" style={{ textAlign: 'center' }}>
            <Stack align="center" gap="xs">
                <Icon icon={icon} size="xl" />
                <Text fw={600}>{t(titleKey)}</Text>
                <Text isMuted size="sm">
                    {t(descriptionKey)}
                </Text>
            </Stack>
        </Box>
    );
}
