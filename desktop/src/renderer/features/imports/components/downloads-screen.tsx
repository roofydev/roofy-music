import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DownloadJobRow } from './download-job-row';
import styles from './downloads-screen.module.css';

import { useImportJobActions, useImportJobs } from '/@/renderer/store';
import { ProductUxEmptyState } from '/@/shared/components/product-ux-empty-state';
import { Progress } from '/@/shared/components/progress/progress';

type DownloadFilter = 'active' | 'all' | 'completed' | 'failed';

const statusOrder: Record<string, number> = {
    failed: 0,
    running: 1,
    queued: 2,
    completed: 3,
};

const filterEmptyConfig: Record<
    Exclude<DownloadFilter, 'all'>,
    { descriptionKey: string; titleKey: string }
> = {
    active: {
        descriptionKey: 'productUx.import.downloads.emptyActive.description',
        titleKey: 'productUx.import.downloads.emptyActive.title',
    },
    completed: {
        descriptionKey: 'productUx.import.downloads.emptySaved.description',
        titleKey: 'productUx.import.downloads.emptySaved.title',
    },
    failed: {
        descriptionKey: 'productUx.import.downloads.emptyFailed.description',
        titleKey: 'productUx.import.downloads.emptyFailed.title',
    },
};

export const DownloadsScreen = () => {
    const { t } = useTranslation();
    const jobs = useImportJobs();
    const { clearCompleted, clearFailed, removeJob } = useImportJobActions();
    const [filter, setFilter] = useState<DownloadFilter>('active');
    const [filterBootstrapped, setFilterBootstrapped] = useState(false);

    const allJobs = useMemo(() => {
        return Object.values(jobs).sort((a, b) => {
            if (statusOrder[a.status] !== statusOrder[b.status]) {
                return statusOrder[a.status] - statusOrder[b.status];
            }
            const aTime = Date.parse(a.updatedAt || a.createdAt || '') || 0;
            const bTime = Date.parse(b.updatedAt || b.createdAt || '') || 0;
            return bTime - aTime;
        });
    }, [jobs]);

    const stats = useMemo(() => {
        return allJobs.reduce(
            (acc, job) => {
                acc.total += 1;
                acc[job.status] += 1;
                if (job.status === 'queued' || job.status === 'running') {
                    acc.active += 1;
                }
                return acc;
            },
            { active: 0, completed: 0, failed: 0, queued: 0, running: 0, total: 0 },
        );
    }, [allJobs]);

    useEffect(() => {
        if (filterBootstrapped || stats.total === 0) {
            return;
        }
        setFilterBootstrapped(true);
        if (stats.active === 0) {
            if (stats.failed > 0) {
                setFilter('failed');
            } else if (stats.completed > 0) {
                setFilter('completed');
            } else {
                setFilter('all');
            }
        }
    }, [filterBootstrapped, stats]);

    const visibleJobs = useMemo(() => {
        if (filter === 'active') {
            return allJobs.filter((job) => job.status === 'queued' || job.status === 'running');
        }
        if (filter === 'completed') {
            return allJobs.filter((job) => job.status === 'completed');
        }
        if (filter === 'failed') {
            return allJobs.filter((job) => job.status === 'failed');
        }
        return allJobs;
    }, [allJobs, filter]);

    const aggregateProgress = useMemo(() => {
        const activeJobs = allJobs.filter(
            (job) => job.status === 'queued' || job.status === 'running',
        );
        if (activeJobs.length === 0) return 0;
        const total = activeJobs.reduce((sum, job) => sum + (job.progress || 0), 0);
        return Math.round(total / activeJobs.length);
    }, [allJobs]);

    const handleClearCompleted = () => {
        window.api?.localFirst?.clearImports?.('completed');
        clearCompleted();
    };

    const handleClearFailed = () => {
        window.api?.localFirst?.clearImports?.('failed');
        clearFailed();
    };

    const handleDismiss = (id: string) => {
        window.api?.localFirst?.removeImport?.(id);
        removeJob(id);
    };

    const segments: Array<{ count: number; id: DownloadFilter; labelKey: string }> = [
        { count: stats.active, id: 'active', labelKey: 'productUx.import.summary.active' },
        { count: stats.completed, id: 'completed', labelKey: 'productUx.import.summary.completed' },
        { count: stats.failed, id: 'failed', labelKey: 'productUx.import.summary.failed' },
        { count: stats.total, id: 'all', labelKey: 'productUx.import.summary.all' },
    ];

    const emptyFilter = filter !== 'all' ? filterEmptyConfig[filter] : null;

    return (
        <div className={styles.screen}>
            {stats.active > 0 ? (
                <section aria-live="polite" className={styles.hero}>
                    <h2 className={styles.heroTitle}>
                        {stats.active === 1
                            ? t('productUx.import.downloads.hero.savingOne')
                            : t('productUx.import.downloads.hero.savingMany', {
                                  count: stats.active,
                              })}
                    </h2>
                    <p className={styles.heroSubtitle}>
                        {t('productUx.import.downloads.hero.savingHint')}
                    </p>
                    <Progress
                        aria-label={t('productUx.import.downloads.hero.progressLabel')}
                        className={styles.heroProgress}
                        size="sm"
                        value={aggregateProgress}
                    />
                </section>
            ) : stats.total > 0 ? (
                <section className={clsx(styles.hero, styles.heroCaughtUp)} role="status">
                    <h2 className={styles.heroTitle}>
                        {stats.failed > 0
                            ? t('productUx.import.downloads.hero.needsAttention', {
                                  count: stats.failed,
                              })
                            : t('productUx.import.downloads.hero.allCaughtUp')}
                    </h2>
                    {stats.failed > 0 && (
                        <p className={styles.heroSubtitle}>
                            {t('productUx.import.downloads.hero.needsAttentionHint')}
                        </p>
                    )}
                </section>
            ) : null}

            {stats.total > 0 && (
                <div className={styles.segmented} role="tablist">
                    {segments.map((segment) => (
                        <button
                            aria-selected={filter === segment.id}
                            className={styles.segment}
                            data-active={filter === segment.id}
                            key={segment.id}
                            onClick={() => setFilter(segment.id)}
                            role="tab"
                            type="button"
                        >
                            {t(segment.labelKey)}
                            {segment.count > 0 && (
                                <span className={styles.segmentCount}>{segment.count}</span>
                            )}
                        </button>
                    ))}
                </div>
            )}

            {visibleJobs.length === 0 ? (
                <div className={styles.empty}>
                    <ProductUxEmptyState
                        descriptionKey={
                            stats.total === 0
                                ? 'productUx.import.empty.description'
                                : emptyFilter?.descriptionKey ||
                                  'productUx.import.filterEmptyHint'
                        }
                        icon="download"
                        titleKey={
                            stats.total === 0
                                ? 'productUx.import.empty.title'
                                : emptyFilter?.titleKey || 'productUx.import.filterEmpty'
                        }
                    />
                </div>
            ) : (
                <div className={styles.list}>
                    {visibleJobs.map((job) => (
                        <DownloadJobRow job={job} key={job.id} onDismiss={handleDismiss} />
                    ))}
                </div>
            )}

            {stats.total > 0 && (stats.completed > 0 || stats.failed > 0) && (
                <div className={styles.footerActions}>
                    <button
                        className={styles.footerButton}
                        disabled={stats.completed === 0}
                        onClick={handleClearCompleted}
                        type="button"
                    >
                        {t('productUx.import.clearCompleted')}
                    </button>
                    <button
                        className={styles.footerButton}
                        disabled={stats.failed === 0}
                        onClick={handleClearFailed}
                        type="button"
                    >
                        {t('productUx.import.clearFailed')}
                    </button>
                </div>
            )}
        </div>
    );
};
