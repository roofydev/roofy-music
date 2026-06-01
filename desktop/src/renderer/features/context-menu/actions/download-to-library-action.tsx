import isElectron from 'is-electron';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useImportJobActions } from '/@/renderer/store';
import { showImportError } from '/@/shared/product-ux';
import { ContextMenu } from '/@/shared/components/context-menu/context-menu';
import { ServerType, Song } from '/@/shared/types/domain-types';

interface DownloadToLibraryActionProps {
    songs: Song[];
}

export const DownloadToLibraryAction = ({ songs }: DownloadToLibraryActionProps) => {
    const { t } = useTranslation();
    const { setJob } = useImportJobActions();

    const hasYtTracks = songs.some(
        (song) => song._serverType === ServerType.YOUTUBE_MUSIC && song.youtubeMusic?.videoId,
    );

    const queueImports = useCallback(
        async (saveVideo: boolean) => {
            if (!isElectron() || !window.api?.youtubeMusic?.downloadTrack) {
                showImportError(t, new Error('desktop_only'));
                return;
            }

            for (const song of songs) {
                if (song._serverType !== ServerType.YOUTUBE_MUSIC || !song.youtubeMusic?.videoId) {
                    continue;
                }

                try {
                    const job = await window.api.youtubeMusic.downloadTrack({
                        album: song.album || undefined,
                        artist: song.artistName || song.albumArtistName || 'Unknown Artist',
                        imageUrl: song.imageUrl || undefined,
                        saveVideo,
                        sourceTrackId: song.id,
                        title: song.name,
                        videoId: song.youtubeMusic.videoId,
                    });
                    setJob(job);
                } catch (error) {
                    showImportError(t, error);
                }
            }
        },
        [setJob, songs, t],
    );

    const onSelect = useCallback(() => queueImports(false), [queueImports]);
    const onSelectWithVideo = useCallback(() => queueImports(true), [queueImports]);

    if (!hasYtTracks) return null;

    return (
        <>
            <ContextMenu.Item leftIcon="download" onSelect={onSelect}>
                {t('productUx.action.addToLibrary')}
            </ContextMenu.Item>
            <ContextMenu.Item leftIcon="video" onSelect={onSelectWithVideo}>
                {t('productUx.action.addToLibraryWithVideo')}
            </ContextMenu.Item>
        </>
    );
};
