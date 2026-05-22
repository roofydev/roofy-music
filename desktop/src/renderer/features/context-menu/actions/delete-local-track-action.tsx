import { closeAllModals, openModal } from '@mantine/modals';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { queryKeys } from '/@/renderer/api/query-keys';
import { ROOFY_LOCAL_SERVER_ID } from '/@/renderer/features/servers/utils/server-logo';
import { queryClient } from '/@/renderer/lib/react-query';
import { ContextMenu } from '/@/shared/components/context-menu/context-menu';
import { ConfirmModal } from '/@/shared/components/modal/modal';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';
import { Song } from '/@/shared/types/domain-types';

interface DeleteLocalTrackActionProps {
    items: Song[];
}

export const DeleteLocalTrackAction = ({ items }: DeleteLocalTrackActionProps) => {
    const { t } = useTranslation();

    const ids = useMemo(() => items.map((item) => item.id), [items]);

    const allLocal = useMemo(() => {
        return items.length > 0 && items.every((item) => item._serverId === ROOFY_LOCAL_SERVER_ID);
    }, [items]);

    const handleDelete = useCallback(async () => {
        if (ids.length === 0) return;

        try {
            const result = (await window.api.localFirst.deleteTracks(ids)) as {
                deleted: number;
                failed: number;
            };

            if (result.deleted > 0) {
                toast.success({
                    message: t('action.deleteFromLibrary', { count: result.deleted }),
                });
                queryClient.invalidateQueries({
                    queryKey: queryKeys.songs.root(ROOFY_LOCAL_SERVER_ID),
                });
                queryClient.invalidateQueries({
                    queryKey: queryKeys.albums.root(ROOFY_LOCAL_SERVER_ID),
                });
                queryClient.invalidateQueries({
                    queryKey: queryKeys.playlists.root(ROOFY_LOCAL_SERVER_ID),
                });
            }

            if (result.failed > 0) {
                toast.error({
                    message: t('action.deleteFromLibraryFailed', { count: result.failed }),
                    title: t('error.genericError'),
                });
            }
        } catch (err: any) {
            toast.error({
                message: err.message,
                title: t('error.genericError'),
            });
        }

        closeAllModals();
    }, [ids, t]);

    const openDeleteModal = useCallback(() => {
        if (ids.length === 0) return;

        openModal({
            children: (
                <ConfirmModal onConfirm={handleDelete}>
                    <Text>{t('common.areYouSure')}</Text>
                </ConfirmModal>
            ),
            title: t('action.deleteFromLibrary', { count: ids.length }),
        });
    }, [handleDelete, ids.length, t]);

    if (!allLocal) return null;

    return (
        <ContextMenu.Item leftIcon="remove" onSelect={openDeleteModal}>
            {t('action.deleteFromLibrary', { count: ids.length })}
        </ContextMenu.Item>
    );
};
