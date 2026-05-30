import isElectron from 'is-electron';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '/@/renderer/api';
import { useCurrentServer, useImportJobActions } from '/@/renderer/store';
import { getDownloadActionLabelKey, showImportError } from '/@/shared/product-ux';
import { ContextMenu } from '/@/shared/components/context-menu/context-menu';
import { toast } from '/@/shared/components/toast/toast';
import { ServerType, Song } from '/@/shared/types/domain-types';

interface DownloadActionProps {
    ids: string[];
    songs?: Song[];
}

const utils = window.api?.utils ?? null;

export const DownloadAction = ({ ids, songs = [] }: DownloadActionProps) => {
    const { t } = useTranslation();
    const server = useCurrentServer();
    const { setJob } = useImportJobActions();
    const youtubeSongs = songs.filter(
        (song) => song._serverType === ServerType.YOUTUBE_MUSIC && song.youtubeMusic?.videoId,
    );
    const isYoutubeOnlySelection = youtubeSongs.length > 0 && youtubeSongs.length === songs.length;

    const queueYoutubeImports = useCallback(
        async (saveVideo: boolean) => {
            if (!isElectron() || !window.api?.youtubeMusic?.downloadTrack) {
                showImportError(t, new Error('desktop_only'));
                return;
            }

            for (const song of youtubeSongs) {
                const job = await window.api.youtubeMusic.downloadTrack({
                    album: song.album || undefined,
                    artist: song.artistName || song.albumArtistName || 'Unknown Artist',
                    imageUrl: song.imageUrl || undefined,
                    saveVideo,
                    sourceTrackId: song.id,
                    title: song.name,
                    videoId: song.youtubeMusic!.videoId!,
                });
                setJob(job);
            }
        },
        [setJob, youtubeSongs],
    );

    const onSelect = useCallback(async () => {
        try {
            if (isYoutubeOnlySelection) {
                await queueYoutubeImports(false);
                return;
            }

            for (const id of ids) {
                const downloadUrl = api.controller.getDownloadUrl({
                    apiClientProps: { serverId: server.id },
                    query: { id },
                });

                if (isElectron()) {
                    utils?.download(downloadUrl);
                } else {
                    window.open(downloadUrl, '_blank');
                }
            }
        } catch (error) {
            showImportError(t, error);
        }
    }, [ids, isYoutubeOnlySelection, queueYoutubeImports, server.id, t]);

    const onSelectWithVideo = useCallback(async () => {
        try {
            await queueYoutubeImports(true);
        } catch (error) {
            showImportError(t, error);
        }
    }, [queueYoutubeImports, t]);

    const primaryLabelKey = getDownloadActionLabelKey(songs);

    return isYoutubeOnlySelection ? (
        <ContextMenu.Submenu>
            <ContextMenu.SubmenuTarget>
                <ContextMenu.Item leftIcon="download" onSelect={onSelect} rightIcon="arrowRightS">
                    {t(primaryLabelKey)}
                </ContextMenu.Item>
            </ContextMenu.SubmenuTarget>
            <ContextMenu.SubmenuContent>
                <ContextMenu.Item leftIcon="download" onSelect={onSelect}>
                    {t('productUx.action.addToLibraryAudioOnly')}
                </ContextMenu.Item>
                <ContextMenu.Item leftIcon="mediaPlay" onSelect={onSelectWithVideo}>
                    {t('productUx.action.addToLibraryWithVideo')}
                </ContextMenu.Item>
            </ContextMenu.SubmenuContent>
        </ContextMenu.Submenu>
    ) : (
        <ContextMenu.Item
            disabled={!isYoutubeOnlySelection && ids.length > 1}
            leftIcon="download"
            onSelect={onSelect}
        >
            {t(primaryLabelKey)}
        </ContextMenu.Item>
    );
};
