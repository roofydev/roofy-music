import isElectron from 'is-electron';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '/@/renderer/api';
import { useCurrentServer, useImportJobActions } from '/@/renderer/store';
import { ContextMenu } from '/@/shared/components/context-menu/context-menu';
import { toast } from '/@/shared/components/toast/toast';
import { ServerType, Song } from '/@/shared/types/domain-types';

interface DownloadActionProps {
    ids: string[];
    songs?: Song[];
}

const utils = isElectron() ? window.api.utils : null;

export const DownloadAction = ({ ids, songs = [] }: DownloadActionProps) => {
    const { t } = useTranslation();
    const server = useCurrentServer();
    const { setJob } = useImportJobActions();
    const youtubeSongs = songs.filter(
        (song) => song._serverType === ServerType.YOUTUBE_MUSIC && song.youtubeMusic?.videoId,
    );
    const isYoutubeOnlySelection = youtubeSongs.length > 0 && youtubeSongs.length === songs.length;

    const onSelect = useCallback(async () => {
        try {
            if (isYoutubeOnlySelection) {
                if (!isElectron() || !window.api?.youtubeMusic?.downloadTrack) {
                    toast.error({
                        message: 'Import to Roofy Music is only available in the desktop app.',
                    });
                    return;
                }

                for (const song of youtubeSongs) {
                    const job = await window.api.youtubeMusic.downloadTrack({
                        album: song.album || undefined,
                        artist: song.artistName || song.albumArtistName || 'Unknown Artist',
                        imageUrl: song.imageUrl || undefined,
                        sourceTrackId: song.id,
                        title: song.name,
                        videoId: song.youtubeMusic!.videoId!,
                    });
                    setJob(job);
                }
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
            console.error('Failed to download items:', error);
            toast.error({ message: (error as Error).message });
        }
    }, [ids, isYoutubeOnlySelection, server.id, setJob, youtubeSongs]);

    return (
        <ContextMenu.Item
            disabled={!isYoutubeOnlySelection && ids.length > 1}
            leftIcon="download"
            onSelect={onSelect}
        >
            {isYoutubeOnlySelection ? 'Import to Roofy Music' : t('page.contextMenu.download')}
        </ContextMenu.Item>
    );
};
