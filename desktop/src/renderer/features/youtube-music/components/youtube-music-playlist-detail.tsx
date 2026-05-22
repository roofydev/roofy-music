import { forwardRef, useMemo } from 'react';

import styles from './youtube-music-playlist-detail.module.css';
import { YoutubeMusicSongsTable } from './youtube-music-songs-table';

import { PageHeader } from '/@/renderer/components/page-header/page-header';
import { FilterBar } from '/@/renderer/features/shared/components/filter-bar';
import { RefreshButton } from '/@/renderer/features/shared/components/refresh-button';
import { Button } from '/@/shared/components/button/button';
import { Group } from '/@/shared/components/group/group';
import { Image } from '/@/shared/components/image/image';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';
import { Playlist, Song } from '/@/shared/types/domain-types';
import { Play } from '/@/shared/types/types';

interface YoutubeMusicPlaylistDetailProps {
    onBack: () => void;
    onImportPlaylist: (playlist: Playlist) => void;
    onImportTracks: (playlist: Playlist) => void;
    onPlayPlaylist: (playlist: Playlist, playType: Play) => void;
    onRefresh?: () => void;
    playlist?: Playlist;
    songs: Song[];
}

export const YoutubeMusicPlaylistDetail = forwardRef<
    HTMLDivElement,
    YoutubeMusicPlaylistDetailProps
>(
    (
        {
            onBack,
            onImportPlaylist,
            onImportTracks,
            onPlayPlaylist,
            onRefresh,
            playlist,
            songs,
        }: YoutubeMusicPlaylistDetailProps,
        ref,
    ) => {
        const metadata = useMemo(() => {
            const parts: string[] = [];
            if (playlist?.owner) {
                parts.push(`by ${playlist.owner}`);
            }
            parts.push(`${songs.length} tracks`);
            return parts.join(' · ');
        }, [playlist?.owner, songs.length]);

        return (
            <Stack gap={0} ref={ref}>
                <PageHeader>
                    <div className={styles.headerRow}>
                        <Group gap="md" wrap="nowrap">
                            <Button onClick={onBack} size="compact-sm" variant="subtle">
                                Back
                            </Button>
                            {playlist?.imageUrl && (
                                <Image
                                    className={styles.artImage}
                                    containerClassName={styles.art}
                                    includeLoader={false}
                                    src={playlist.imageUrl}
                                    unloaderIcon="emptyPlaylistImage"
                                />
                            )}
                            <Stack gap="xs">
                                <Text fw={700} size="lg">
                                    {playlist?.name || 'YouTube Music playlist'}
                                </Text>
                                <Text isMuted size="sm">
                                    {metadata}
                                </Text>
                            </Stack>
                        </Group>
                        {playlist && (
                            <Group gap="xs" wrap="nowrap">
                                {onRefresh && <RefreshButton onClick={onRefresh} variant="subtle" />}
                                <Button
                                    onClick={() => onImportPlaylist(playlist)}
                                    size="compact-sm"
                                >
                                    Import playlist
                                </Button>
                                <Button
                                    onClick={() => onImportTracks(playlist)}
                                    size="compact-sm"
                                    variant="subtle"
                                >
                                    Import tracks
                                </Button>
                                <Button
                                    onClick={() => onPlayPlaylist(playlist, Play.NOW)}
                                    size="compact-sm"
                                    variant="subtle"
                                >
                                    Play
                                </Button>
                            </Group>
                        )}
                    </div>
                </PageHeader>
                <FilterBar />
                <div className={styles.songsContainer}>
                    <YoutubeMusicSongsTable songs={songs} />
                </div>
            </Stack>
        );
    },
);

YoutubeMusicPlaylistDetail.displayName = 'YoutubeMusicPlaylistDetail';
