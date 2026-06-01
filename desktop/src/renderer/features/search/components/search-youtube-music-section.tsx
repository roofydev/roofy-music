import { useQuery } from '@tanstack/react-query';
import isElectron from 'is-electron';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { CollapsibleCommandGroup } from '/@/renderer/features/search/components/collapsible-command-group';
import { CommandItemSelectable } from '/@/renderer/features/search/components/command-item-selectable';
import { LibraryCommandItem } from '/@/renderer/features/search/components/library-command-item';
import { useImportJobsStore } from '/@/renderer/store';
import { Badge } from '/@/shared/components/badge/badge';
import { Box } from '/@/shared/components/box/box';
import { Spinner } from '/@/shared/components/spinner/spinner';
import { toast } from '/@/shared/components/toast/toast';
import { showImportError, showSearchError } from '/@/shared/product-ux';
import { LibraryItem, Song } from '/@/shared/types/domain-types';

interface SearchYoutubeMusicSectionProps {
    debouncedQuery: string;
    expanded: boolean;
    isHome: boolean;
    onSelectResult: () => void;
    onToggle: () => void;
    query: string;
}

export function SearchYoutubeMusicSection({
    debouncedQuery,
    expanded,
    isHome,
    onSelectResult,
    onToggle,
    query,
}: SearchYoutubeMusicSectionProps) {
    const { t } = useTranslation();
    const enabled =
        isHome &&
        debouncedQuery !== '' &&
        query !== '' &&
        isElectron() &&
        Boolean(window.api?.youtubeMusic);

    const statusQuery = useQuery({
        enabled,
        queryFn: () => window.api.youtubeMusic.status(),
        queryKey: ['youtube-music', 'palette-status'],
        staleTime: 60_000,
    });

    const searchQuery = useQuery({
        enabled: enabled && Boolean(statusQuery.data?.connected),
        queryFn: () => window.api.youtubeMusic.search(debouncedQuery),
        queryKey: ['youtube-music', 'palette-search', debouncedQuery],
        staleTime: 30_000,
    });

    useEffect(() => {
        if (searchQuery.isError) {
            showSearchError(t, searchQuery.error);
        }
    }, [searchQuery.isError, searchQuery.error, t]);

    const handleImport = async (song: Song) => {
        const videoId = song.youtubeMusic?.videoId;
        if (!videoId || !window.api?.youtubeMusic?.downloadTrack) return;

        try {
            const job = await window.api.youtubeMusic.downloadTrack({
                album: song.album || undefined,
                artist: song.artistName || song.albumArtistName || 'Unknown Artist',
                imageUrl: song.imageUrl || undefined,
                sourceTrackId: song.id,
                title: song.name,
                videoId,
            });
            useImportJobsStore.getState().actions.setJob(job);
            toast.success({
                message: t('productUx.import.toast.queuedMessage', {
                    title: song.name,
                    target: t('productUx.personalLibrary.settingsTab'),
                }),
                title: t('productUx.import.toast.queuedTitle'),
            });
            onSelectResult();
        } catch (error) {
            showImportError(t, error);
        }
    };

    const songs = searchQuery.data?.songs?.slice(0, 4) || [];
    const showSection = isHome && enabled && statusQuery.data?.connected && query !== '';

    if (!showSection) return null;

    return (
        <CollapsibleCommandGroup
            expanded={expanded}
            heading={t('productUx.search.youtubeMusic.heading')}
            onToggle={onToggle}
            subtitle={
                searchQuery.isFetched ? (
                    <Badge>{t('productUx.search.youtubeMusic.badgeOnline')}</Badge>
                ) : undefined
            }
        >
            {searchQuery.isLoading ? (
                <Box p="md">
                    <Spinner container />
                </Box>
            ) : (
                songs.map((song) => (
                    <CommandItemSelectable
                        key={`ytm-search-song-${song.id}`}
                        onSelect={() => handleImport(song)}
                        value={`ytm-search-song-${song.id}`}
                    >
                        {({ isHighlighted }) => (
                            <LibraryCommandItem
                                explicitStatus={song.explicitStatus}
                                id={song.id}
                                imageId={null}
                                imageUrl={song.imageUrl}
                                isHighlighted={isHighlighted}
                                itemType={LibraryItem.SONG}
                                onImport={handleImport}
                                song={song}
                                subtitle={song.artists.map((artist) => artist.name).join(', ')}
                                title={song.name}
                            />
                        )}
                    </CommandItemSelectable>
                ))
            )}
        </CollapsibleCommandGroup>
    );
}
