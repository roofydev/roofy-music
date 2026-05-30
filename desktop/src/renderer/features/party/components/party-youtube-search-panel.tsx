import { ActionIcon, Button, Group, Loader, Text, TextInput } from '@mantine/core';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RiAddLine, RiPlayFill, RiSearchLine, RiSkipForwardFill } from 'react-icons/ri';

import styles from '/@/renderer/features/party/party-dashboard.module.css';
import { usePlayer } from '/@/renderer/features/player/context/player-context';
import { toast } from '/@/shared/components/toast/toast';
import { Song } from '/@/shared/types/domain-types';
import { Play } from '/@/shared/types/types';

const YOUTUBE_VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

const youtubeVideoIdFromInput = (input: string) => {
    const trimmed = input.trim();
    if (YOUTUBE_VIDEO_ID_REGEX.test(trimmed)) return trimmed;

    try {
        const url = new URL(trimmed);
        const fromParam = url.searchParams.get('v');
        if (fromParam && YOUTUBE_VIDEO_ID_REGEX.test(fromParam)) return fromParam;

        const pathMatch = url.pathname.match(/\/(?:embed|shorts|watch)\/([A-Za-z0-9_-]{11})/);
        if (pathMatch) return pathMatch[1];

        if (url.hostname.includes('youtu.be')) {
            const shortMatch = url.pathname.match(/^\/([A-Za-z0-9_-]{11})/);
            if (shortMatch) return shortMatch[1];
        }
    } catch {
        return null;
    }

    return null;
};

export const PartyYoutubeSearchPanel = () => {
    const { t } = useTranslation();
    const player = usePlayer();

    const songArtists = (song: Song) =>
        song.artists?.map((artist) => artist.name).filter(Boolean).join(', ') ||
        song.artistName ||
        song.albumArtistName ||
        t('productUx.import.unknownArtist');
    const [addingId, setAddingId] = useState<null | string>(null);
    const [error, setError] = useState<null | string>(null);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<Song[]>([]);
    const [searching, setSearching] = useState(false);

    const trimmedQuery = query.trim();
    const pastedVideoId = useMemo(() => youtubeVideoIdFromInput(trimmedQuery), [trimmedQuery]);
    const youtubeMusic = window.api?.youtubeMusic;
    const canSearch = Boolean(youtubeMusic);

    useEffect(() => {
        if (!canSearch || !trimmedQuery || pastedVideoId) {
            setResults([]);
            setSearching(false);
            return;
        }

        const timeout = window.setTimeout(async () => {
            setSearching(true);
            setError(null);
            try {
                const response = await youtubeMusic!.search(trimmedQuery);
                setResults((response.songs || []).slice(0, 6));
            } catch (searchError) {
                setResults([]);
                setError(
                    (searchError as Error).message ||
                        t('productUx.search.youtubeMusic.searchFailed'),
                );
            } finally {
                setSearching(false);
            }
        }, 350);

        return () => window.clearTimeout(timeout);
    }, [canSearch, pastedVideoId, trimmedQuery, youtubeMusic]);

    const resolveSong = useCallback(
        async (song?: Song) => {
            if (song) return song;
            if (!pastedVideoId || !youtubeMusic) return null;
            return youtubeMusic.getSongDetail(pastedVideoId);
        },
        [pastedVideoId, youtubeMusic],
    );

    const addSong = useCallback(
        async (playType: Play, song?: Song) => {
            if (!youtubeMusic) {
                toast.error({ message: t('productUx.search.youtubeMusic.searchUnavailable') });
                return;
            }

            const actionId = song?.id || pastedVideoId || trimmedQuery;
            setAddingId(actionId);
            setError(null);

            try {
                const resolvedSong = await resolveSong(song);
                if (!resolvedSong) {
                    setError('Paste a YouTube link or choose a search result.');
                    return;
                }

                player.addToQueueByData([resolvedSong], playType);
                toast.success({
                    message: resolvedSong.name,
                    title:
                        playType === Play.NOW
                            ? 'Playing from party search'
                            : playType === Play.NEXT
                              ? 'Added next from party search'
                              : 'Added to party queue',
                });
                if (!song) setQuery('');
            } catch (addError) {
                setError((addError as Error).message || 'Could not add track');
            } finally {
                setAddingId(null);
            }
        },
        [pastedVideoId, player, resolveSong, trimmedQuery, youtubeMusic],
    );

    const handleSubmit = (event: FormEvent) => {
        event.preventDefault();
        if (pastedVideoId) {
            void addSong(Play.NEXT);
            return;
        }
        if (results[0]) void addSong(Play.NEXT, results[0]);
    };

    return (
        <section className={styles.partyYoutubeSearchPanel}>
            <form className={styles.partyYoutubeSearchForm} onSubmit={handleSubmit}>
                <TextInput
                    classNames={{ input: styles.partyYoutubeSearchInput }}
                    disabled={!canSearch}
                    leftSection={<RiSearchLine />}
                    onChange={(event) => setQuery(event.currentTarget.value)}
                    placeholder={t('productUx.search.youtubeMusic.searchPlaceholder')}
                    size="sm"
                    value={query}
                />
                <Button
                    disabled={!trimmedQuery || !canSearch}
                    loading={addingId === (pastedVideoId || trimmedQuery)}
                    size="sm"
                    type="submit"
                >
                    Next
                </Button>
            </form>

            <div className={styles.partyYoutubeSearchMeta}>
                <Text c="dimmed" size="xs">
                    {pastedVideoId
                        ? 'Link ready'
                        : canSearch
                          ? 'Remote search'
                          : t('productUx.search.youtubeMusic.searchUnavailable')}
                </Text>
                {searching && <Loader size="xs" />}
                {error && (
                    <Text c="red" lineClamp={1} size="xs">
                        {error}
                    </Text>
                )}
            </div>

            {results.length > 0 && (
                <div className={styles.partyYoutubeResults}>
                    {results.map((song) => (
                        <div className={styles.partyYoutubeResultRow} key={song.id}>
                            {song.imageUrl ? (
                                <img alt="" className={styles.partyYoutubeResultImage} src={song.imageUrl} />
                            ) : (
                                <span className={styles.partyYoutubeResultImage} />
                            )}
                            <div className={styles.partyYoutubeResultText}>
                                <Text lineClamp={1} size="sm">
                                    {song.name}
                                </Text>
                                <Text c="dimmed" lineClamp={1} size="xs">
                                    {songArtists(song)}
                                </Text>
                            </div>
                            <Group gap={4} wrap="nowrap">
                                <ActionIcon
                                    aria-label="Play now"
                                    loading={addingId === `${song.id}:now`}
                                    onClick={() => {
                                        setAddingId(`${song.id}:now`);
                                        void addSong(Play.NOW, song);
                                    }}
                                    size="sm"
                                    variant="subtle"
                                >
                                    <RiPlayFill />
                                </ActionIcon>
                                <ActionIcon
                                    aria-label="Play next"
                                    onClick={() => addSong(Play.NEXT, song)}
                                    size="sm"
                                    variant="subtle"
                                >
                                    <RiSkipForwardFill />
                                </ActionIcon>
                                <ActionIcon
                                    aria-label="Add to queue"
                                    onClick={() => addSong(Play.LAST, song)}
                                    size="sm"
                                    variant="subtle"
                                >
                                    <RiAddLine />
                                </ActionIcon>
                            </Group>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
};
