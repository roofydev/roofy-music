import isElectron from 'is-electron';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useImportJobActions } from '/@/renderer/store';
import { ContextMenu } from '/@/shared/components/context-menu/context-menu';
import { toast } from '/@/shared/components/toast/toast';
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
                toast.error({
                    message: 'Download to library is only available in the desktop app.',
                });
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
                    toast.error({
                        message: `Failed to queue "${song.name}": ${(error as Error).message}`,
                    });
                }
            }
        },
        [setJob, songs],
    );

    const onSelect = useCallback(() => queueImports(false), [queueImports]);
    const onSelectWithVideo = useCallback(() => queueImports(true), [queueImports]);

    if (!hasYtTracks) return null;

    return (
        <>
            <ContextMenu.Item leftIcon="download" onSelect={onSelect}>
                {t('page.contextMenu.downloadToLibrary') || 'Import to Library'}
            </ContextMenu.Item>
            <ContextMenu.Item leftIcon="video" onSelect={onSelectWithVideo}>
                Import to Library with MP4
            </ContextMenu.Item>
        </>
    );
};
