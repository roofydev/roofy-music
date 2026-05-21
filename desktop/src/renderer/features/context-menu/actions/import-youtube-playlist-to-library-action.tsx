import isElectron from 'is-electron';
import { useCallback } from 'react';

import { useImportJobActions } from '/@/renderer/store';
import { ContextMenu } from '/@/shared/components/context-menu/context-menu';
import { toast } from '/@/shared/components/toast/toast';
import { Playlist, ServerType } from '/@/shared/types/domain-types';

interface ImportYoutubePlaylistToLibraryActionProps {
    playlists: Playlist[];
}

export const ImportYoutubePlaylistToLibraryAction = ({
    playlists,
}: ImportYoutubePlaylistToLibraryActionProps) => {
    const { setJob } = useImportJobActions();
    const youtubePlaylists = playlists.filter(
        (playlist) =>
            playlist._serverType === ServerType.YOUTUBE_MUSIC && playlist.youtubeMusic?.playlistId,
    );

    const onSelect = useCallback(async () => {
        if (!isElectron() || !window.api?.localFirst?.createImport) {
            toast.error({ message: 'Playlist import is only available in the desktop app.' });
            return;
        }

        for (const playlist of youtubePlaylists) {
            const playlistId = playlist.youtubeMusic?.playlistId;
            if (!playlistId) continue;

            try {
                const job = await window.api.localFirst.createImport({
                    createPlaylist: true,
                    imageUrl: playlist.imageUrl || undefined,
                    input: `https://music.youtube.com/playlist?list=${playlistId}`,
                    playlist: true,
                    playlistName: playlist.name,
                    source: 'youtube_music',
                    sourceTrackId: playlist.id,
                    title: playlist.name,
                });
                setJob(job);
            } catch (error) {
                toast.error({
                    message: `Failed to queue "${playlist.name}": ${(error as Error).message}`,
                });
            }
        }
    }, [setJob, youtubePlaylists]);

    if (youtubePlaylists.length === 0) return null;

    return (
        <ContextMenu.Item leftIcon="download" onSelect={onSelect}>
            Import playlist to Library
        </ContextMenu.Item>
    );
};
