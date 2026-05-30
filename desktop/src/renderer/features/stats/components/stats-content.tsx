import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import styles from './stats-content.module.css';

import {
    getStatsSnapshot,
    StatsRankedItem,
    StatsRange,
    StatsSnapshot,
    StatsSong,
    subscribeStatsUpdates,
} from '/@/renderer/features/stats/api/local-stats';
import { formatDurationString } from '/@/renderer/utils';
import { SegmentedControl } from '/@/shared/components/segmented-control/segmented-control';
import { Text } from '/@/shared/components/text/text';
import { Icon } from '/@/shared/components/icon/icon';

const currentYear = new Date().getFullYear();

const emptySnapshot = (range: StatsRange): StatsSnapshot => ({
    availableYears: [],
    range,
    songsPlayed: 0,
    topArtists: [],
    topGenres: [],
    topSongs: [],
    totalListenMs: 0,
    totalPlays: 0,
});

const formatListenTime = (value: number) => {
    if (value <= 0) return '0m';
    return formatDurationString(value);
};

const useStats = (range: StatsRange) => {
    const [snapshot, setSnapshot] = useState<StatsSnapshot>(() => emptySnapshot(range));

    useEffect(() => {
        let mounted = true;
        const load = () => {
            void getStatsSnapshot(range).then((next) => {
                if (mounted) setSnapshot(next);
            });
        };

        load();
        const unsubscribe = subscribeStatsUpdates(load);
        return () => {
            mounted = false;
            unsubscribe();
        };
    }, [range]);

    return snapshot;
};

export const StatsContent = () => {
    const { t } = useTranslation();
    const [range, setRange] = useState<StatsRange>('allTime');
    const snapshot = useStats(range);
    const years = snapshot.availableYears.length ? snapshot.availableYears : [currentYear];
    const rangeOptions = useMemo(
        () => [
            { label: t('productUx.stats.rangeAllTime'), value: 'allTime' },
            ...years.map((year) => ({ label: String(year), value: String(year) })),
        ],
        [t, years],
    );
    const topArtist = snapshot.topArtists[0]?.name ?? '-';
    const topGenre = snapshot.topGenres[0]?.name ?? '-';

    const handleRangeChange = (value: string) => {
        setRange(value === 'allTime' ? 'allTime' : Number(value));
    };

    return (
        <main className={styles.container}>
            <header className={styles.header}>
                <div className={styles.titleBlock}>
                    <Text component="h1" fw={700} size="2rem">
                        {t('productUx.stats.title')}
                    </Text>
                    <Text c="dimmed" size="sm">
                        {t('productUx.stats.subtitle')}
                    </Text>
                </div>
                <SegmentedControl
                    data={rangeOptions}
                    onChange={handleRangeChange}
                    value={String(range)}
                />
            </header>

            {snapshot.totalPlays === 0 && snapshot.totalListenMs === 0 ? (
                <div className={styles.empty} role="status">
                    <div>
                        <Text fw={600} size="lg">
                            {t('productUx.stats.emptyTitle')}
                        </Text>
                        <Text c="dimmed" size="sm">
                            {t('productUx.stats.emptyDescription')}
                        </Text>
                    </div>
                </div>
            ) : (
                <>
                    <section
                        aria-label={t('productUx.stats.summaryLabel')}
                        className={styles.summary}
                    >
                        <SummaryMetric
                            label={t('productUx.stats.plays')}
                            value={snapshot.totalPlays.toLocaleString()}
                        />
                        <SummaryMetric
                            label={t('productUx.stats.listenTime')}
                            value={formatListenTime(snapshot.totalListenMs)}
                        />
                        <SummaryMetric
                            label={t('productUx.stats.songsPlayed')}
                            value={snapshot.songsPlayed.toLocaleString()}
                        />
                        <SummaryMetric label={t('productUx.stats.topArtist')} value={topArtist} />
                        <SummaryMetric label={t('productUx.stats.topGenre')} value={topGenre} />
                    </section>

                    <div className={styles.layout}>
                        <section className={styles.section}>
                            <SectionHeader count={snapshot.topSongs.length} title="Top songs" />
                            <div className={styles.songList}>
                                {snapshot.topSongs.slice(0, 50).map((song, index) => (
                                    <SongRow index={index + 1} key={`${song.serverId}:${song.id}`} song={song} />
                                ))}
                            </div>
                        </section>

                        <aside className={styles.sideStack}>
                            <section className={styles.section}>
                                <SectionHeader count={snapshot.topArtists.length} title="Top artists" />
                                <RankedList items={snapshot.topArtists.slice(0, 12)} />
                            </section>
                            <section className={styles.section}>
                                <SectionHeader count={snapshot.topGenres.length} title="Top genres" />
                                <RankedList items={snapshot.topGenres.slice(0, 12)} />
                            </section>
                        </aside>
                    </div>
                </>
            )}
        </main>
    );
};

const SummaryMetric = ({ label, value }: { label: string; value: string }) => (
    <div className={styles.summaryItem}>
        <Text c="dimmed" size="xs" tt="uppercase">
            {label}
        </Text>
        <Text fw={700} lineClamp={1} size="xl">
            {value}
        </Text>
    </div>
);

const SectionHeader = ({ count, title }: { count: number; title: string }) => (
    <div className={styles.sectionHeader}>
        <Text fw={700} size="lg">
            {title}
        </Text>
        <Text c="dimmed" size="sm">
            {count.toLocaleString()}
        </Text>
    </div>
);

const SongRow = ({ index, song }: { index: number; song: StatsSong }) => (
    <div className={styles.songRow}>
        <Text c="dimmed" ta="right">
            {index}
        </Text>
        {song.imageUrl ? (
            <img alt="" className={styles.art} src={song.imageUrl} />
        ) : (
            <div className={styles.placeholderArt}>
                <Icon color="muted" icon="emptySongImage" size="lg" />
            </div>
        )}
        <div className={styles.meta}>
            <Text fw={600} lineClamp={1}>
                {song.name}
            </Text>
            <Text c="dimmed" lineClamp={1} size="sm">
                {song.artistName || song.artists.map((artist) => artist.name).join(', ')}
            </Text>
        </div>
        <Text c="dimmed" size="sm">
            {song.playCount.toLocaleString()} plays
        </Text>
        <Text c="dimmed" size="sm">
            {formatListenTime(song.totalListenMs)}
        </Text>
    </div>
);

const RankedList = ({ items }: { items: StatsRankedItem[] }) => (
    <div className={styles.rankedList}>
        {items.map((item, index) => (
            <div className={styles.rankedRow} key={item.id}>
                <Text c="dimmed" ta="right">
                    {index + 1}
                </Text>
                <Text fw={600} lineClamp={1}>
                    {item.name}
                </Text>
                <Text c="dimmed" size="sm">
                    {item.playCount.toLocaleString()}
                </Text>
            </div>
        ))}
    </div>
);
