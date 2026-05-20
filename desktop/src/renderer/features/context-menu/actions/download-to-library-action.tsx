import isElectron from 'is-electron';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { ContextMenu } from '/@/shared/components/context-menu/context-menu';
import { toast } from '/@/shared/components/toast/toast';
import { Song, ServerType } from '/@/shared/types/domain-types';

interface DownloadToLibraryActionProps {
    songs: Song[];
}

export const DownloadToLibraryAction = ({ songs }: DownloadToLibraryActionProps) => {
    const { t } = useTranslation();

    const hasYtTracks = songs.some(
        (song) => song._serverType === ServerType.YOUTUBE_MUSIC && song.youtubeMusic?.videoId,
    );

    const onSelect = useCallback(async () => {
        if (!isElectron() || !window.api?.youtubeMusic?.downloadTrack) {
            toast.error({ message: 'Download to library is only available in the desktop app.' });
            return;
        }

        for (const song of songs) {
            if (song._serverType !== ServerType.YOUTUBE_MUSIC || !song.youtubeMusic?.videoId) {
                continue;
            }

            try {
                await window.api.youtubeMusic.downloadTrack({
                    album: song.album || undefined,
                    artist: song.artistName || song.albumArtistName || 'Unknown Artist',
                    sourceTrackId: song.id,
                    title: song.name,
                    videoId: song.youtubeMusic.videoId,
                });
                toast.success({ message: `Queued "${song.name}" for local import` });
            } catch (error) {
                toast.error({
                    message: `Failed to queue "${song.name}": ${(error as Error).message}`,
                });
            }
        }
    }, [songs]);

    if (!hasYtTracks) return null;

    return (
        <ContextMenu.Item leftIcon="download" onSelect={onSelect}>
            {t('page.contextMenu.downloadToLibrary') || 'Import to Library'}
        </ContextMenu.Item>
    );
};
