import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { getSongById } from '/@/renderer/features/player/utils';
import { useCurrentServer } from '/@/renderer/store';
import type { ImportJob } from '/@/renderer/store/import-jobs.store';
import type { Song } from '/@/shared/types/domain-types';

const isLikelyVideoId = (value: string | undefined) =>
    Boolean(value && /^[A-Za-z0-9_-]{11}$/.test(value));

export const isMultiTrackImportJob = (job: ImportJob) =>
    Boolean(job.downloadedCount && job.downloadedCount > 1);

export function useResolveImportSong() {
    const queryClient = useQueryClient();
    const server = useCurrentServer();

    return useCallback(
        async (job: ImportJob): Promise<Song | null> => {
            if (isMultiTrackImportJob(job)) {
                return null;
            }

            const videoId = job.videoId || (isLikelyVideoId(job.sourceTrackId) ? job.sourceTrackId : undefined);
            if (videoId && window.api?.youtubeMusic?.getSongDetail) {
                try {
                    return await window.api.youtubeMusic.getSongDetail(videoId);
                } catch {
                    // fall through to library lookup
                }
            }

            const libraryId = job.sourceTrackId;
            if (libraryId && server?.id) {
                try {
                    const response = await getSongById({
                        id: libraryId,
                        queryClient,
                        serverId: server.id,
                    });
                    return response.items[0] ?? null;
                } catch {
                    return null;
                }
            }

            return null;
        },
        [queryClient, server?.id],
    );
}
