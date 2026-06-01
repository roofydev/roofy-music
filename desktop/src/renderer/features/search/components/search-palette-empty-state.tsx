import { useTranslation } from 'react-i18next';

import { useCommandPaletteSearchStatus } from '/@/renderer/features/search/hooks/use-command-palette-search-status';
import { Box } from '/@/shared/components/box/box';
import { Icon } from '/@/shared/components/icon/icon';
import { Spinner } from '/@/shared/components/spinner/spinner';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';

interface SearchPaletteEmptyStateProps {
    debouncedQuery: string;
    isHome: boolean;
}

export function SearchPaletteEmptyState({
    debouncedQuery,
    isHome,
}: SearchPaletteEmptyStateProps) {
    const { t } = useTranslation();
    const { isLoading, showEmpty } = useCommandPaletteSearchStatus(debouncedQuery, isHome);

    if (!showEmpty && !isLoading) {
        return null;
    }

    return (
        <Box p="md" style={{ textAlign: 'center' }}>
            {isLoading ? (
                <Spinner container />
            ) : (
                <Stack align="center" gap="xs">
                    <Icon icon="search" size="xl" />
                    <Text fw={600}>{t('productUx.search.empty.title')}</Text>
                    <Text isMuted size="sm">
                        {t('productUx.search.empty.description')}
                    </Text>
                </Stack>
            )}
        </Box>
    );
}
