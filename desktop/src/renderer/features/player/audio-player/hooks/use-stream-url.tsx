import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { api } from '/@/renderer/api';
import { TranscodingConfig } from '/@/renderer/store';
import { QueueSong } from '/@/shared/types/domain-types';
import { ServerType } from '/@/shared/types/domain-types';

export function useSongUrl(
    song: QueueSong | undefined,
    current: boolean,
    transcode: TranscodingConfig,
): string | undefined {
    const prior = useRef(['', '']);
    const queryClient = useQueryClient();
    const shouldReusePrior = Boolean(
        song?._serverId && current && prior.current[0] === song._uniqueId && prior.current[1],
    );

    const isYoutubeMusic = song?._serverType === ServerType.YOUTUBE_MUSIC;

    const { data: queryStreamUrl } = useQuery({
        enabled: Boolean(song?._serverId) && !shouldReusePrior,
        queryFn: async () => {
            // For YouTube Music, use the new stream resolver if available
            if (isYoutubeMusic && window.api?.youtubeMusic?.resolveStream) {
                const result = await window.api.youtubeMusic.resolveStream(song!.id, 'playback');
                if (result?.url) {
                    return result.url;
                }
                if (result?.error) {
                    throw new Error(result.error);
                }
            }
            return api.controller.getStreamUrl({
                apiClientProps: { serverId: song!._serverId },
                query: {
                    bitrate: transcode.bitrate,
                    format: transcode.format,
                    id: song!.id,
                    transcode: transcode.enabled,
                },
            });
        },
        queryKey: [
            song?._serverId,
            'stream-url',
            song?.id,
            shouldReusePrior ? 'reuse-prior' : transcode.bitrate,
            shouldReusePrior ? 'reuse-prior' : transcode.format,
            shouldReusePrior ? 'reuse-prior' : transcode.enabled,
        ] as const,
        // YouTube Music streams expire quickly; use shorter stale time
        refetchOnWindowFocus: false,
        retry: isYoutubeMusic ? false : 3,
        staleTime: isYoutubeMusic ? 15 * 1000 : 60 * 1000,
    });

    useEffect(() => {
        if (!song?._serverId) {
            prior.current = ['', ''];
            return;
        }

        if (!queryStreamUrl) {
            return;
        }

        // Save resolved URL to avoid restarting current track on transcode setting changes.
        prior.current = [song._uniqueId, queryStreamUrl];
    }, [song?._serverId, song?._uniqueId, queryStreamUrl]);

    useEffect(() => {
        if (!song?._serverId) {
            prior.current = ['', ''];
        }
    }, [song?._serverId]);

    // Expose invalidate function on the ref for the player engine to call on 403
    useEffect(() => {
        if (!song || !isYoutubeMusic) return;

        const invalidate = async () => {
            try {
                await window.api?.youtubeMusic?.invalidateStream?.(song.id);
            } catch {
                // ignore
            }
            queryClient.invalidateQueries({
                queryKey: [song._serverId, 'stream-url', song.id],
            });
        };

        (useSongUrl as any)._invalidateYtStream = invalidate;
    }, [isYoutubeMusic, queryClient, song]);

    return shouldReusePrior ? prior.current[1] : queryStreamUrl;
}

export const invalidateYtStream = async (song: QueueSong) => {
    if (song._serverType !== ServerType.YOUTUBE_MUSIC) return;
    try {
        await window.api?.youtubeMusic?.invalidateStream?.(song.id);
    } catch {
        // ignore
    }
};

export const getSongUrl = async (
    song: QueueSong,
    transcode: TranscodingConfig,
    skipAutoTranscode?: boolean,
) => {
    // For YouTube Music, prefer the stream resolver
    if (song._serverType === ServerType.YOUTUBE_MUSIC && window.api?.youtubeMusic?.resolveStream) {
        const result = await window.api.youtubeMusic.resolveStream(song.id, 'playback');
        if (result?.url) {
            return result.url;
        }
    }

    const url = await api.controller.getStreamUrl({
        apiClientProps: { serverId: song._serverId },
        query: {
            bitrate: transcode.bitrate,
            format: transcode.format,
            id: song.id,
            skipAutoTranscode,
            transcode: transcode.enabled,
        },
    });

    return url;
};
