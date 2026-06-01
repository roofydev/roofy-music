import clsx from 'clsx';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import styles from './downloads-screen.module.css';

import { ContextMenuController } from '/@/renderer/features/context-menu/context-menu-controller';
import {
    isMultiTrackImportJob,
    useResolveImportSong,
} from '/@/renderer/features/imports/hooks/use-resolve-import-song';
import {
    getImportJobArtist,
    getImportJobProgressValue,
    getImportJobStatusLine,
    getImportJobTitle,
} from '/@/renderer/features/imports/utils/import-job-display';
import { AppRoute } from '/@/renderer/router/routes';
import { addToQueueByData } from '/@/renderer/store';
import type { ImportJob } from '/@/renderer/store/import-jobs.store';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Button } from '/@/shared/components/button/button';
import { Icon } from '/@/shared/components/icon/icon';
import { PRODUCT_UX_ACTION_KEYS } from '/@/shared/product-ux';
import { showPlaybackErrorFromUnknown } from '/@/shared/product-ux';
import { toast } from '/@/shared/components/toast/toast';
import { LibraryItem } from '/@/shared/types/domain-types';
import { Play } from '/@/shared/types/types';

interface DownloadJobRowProps {
    job: ImportJob;
    onDismiss: (id: string) => void;
}

const ProgressRing = ({ value }: { value: number }) => {
    const radius = 17;
    const circumference = 2 * Math.PI * radius;
    const clamped = Math.max(0, Math.min(100, value));
    const offset = circumference - (clamped / 100) * circumference;

    return (
        <div aria-label={`${clamped}%`} className={styles.progressRing}>
            <svg aria-hidden height="44" viewBox="0 0 44 44" width="44">
                <circle
                    cx="22"
                    cy="22"
                    fill="none"
                    r={radius}
                    stroke="var(--theme-colors-border)"
                    strokeWidth="3"
                />
                <circle
                    cx="22"
                    cy="22"
                    fill="none"
                    r={radius}
                    stroke="var(--theme-colors-foreground)"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="square"
                    strokeWidth="3"
                />
            </svg>
            <span className={styles.progressRingLabel}>{clamped > 0 ? `${clamped}` : '…'}</span>
        </div>
    );
};

export const DownloadJobRow = ({ job, onDismiss }: DownloadJobRowProps) => {
    const { t } = useTranslation();
    const resolveSong = useResolveImportSong();
    const [showDetails, setShowDetails] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);

    const title = getImportJobTitle(job, t);
    const artist = getImportJobArtist(job, t);
    const statusLine = getImportJobStatusLine(job, t);
    const progressValue = getImportJobProgressValue(job);
    const isActive = job.status === 'queued' || job.status === 'running';
    const isCompleted = job.status === 'completed';
    const isFailed = job.status === 'failed';
    const isBatch = isMultiTrackImportJob(job);
    const canDismiss = isCompleted || isFailed;
    const technicalDetail = job.error || job.warning;

    const playResolvedSong = async (playType: Play) => {
        setIsPlaying(true);
        try {
            const song = await resolveSong(job);
            if (!song) {
                toast.info({
                    message: t('productUx.import.downloads.playFromLibraryHint'),
                    title: t('productUx.import.downloads.viewSavedSongs'),
                });
                return;
            }
            await addToQueueByData(playType, [song]);
        } catch (error) {
            showPlaybackErrorFromUnknown(t, error);
        } finally {
            setIsPlaying(false);
        }
    };

    const handleContextMenu = (event: React.MouseEvent) => {
        event.preventDefault();
        void (async () => {
            const song = await resolveSong(job);
            if (!song) return;
            ContextMenuController.call({
                cmd: { items: [song], type: LibraryItem.SONG },
                event: event as React.MouseEvent<HTMLDivElement>,
            });
        })();
    };

    return (
        <article
            className={clsx(styles.row, isFailed && styles.rowFailed)}
            onContextMenu={isCompleted && !isBatch ? handleContextMenu : undefined}
        >
            {job.imageUrl ? (
                <img alt="" className={styles.art} src={job.imageUrl} />
            ) : (
                <div className={styles.artPlaceholder}>
                    <Icon icon="download" size="sm" />
                </div>
            )}

            <div className={styles.body}>
                <div className={styles.title}>{title}</div>
                <div className={styles.subtitle}>{artist}</div>
                <div
                    className={clsx(
                        styles.statusLine,
                        isActive && styles.statusLineActive,
                        isFailed && styles.statusLineFailed,
                    )}
                >
                    {statusLine}
                    {isActive && job.progress > 0 ? ` · ${job.progress}%` : null}
                </div>
                {isFailed && technicalDetail && (
                    <>
                        <button
                            className={styles.detailsToggle}
                            onClick={() => setShowDetails((value) => !value)}
                            type="button"
                        >
                            {showDetails
                                ? t('productUx.error.recovery.hideTechnicalDetails')
                                : t('productUx.error.recovery.viewTechnicalDetails')}
                        </button>
                        {showDetails && <div className={styles.detailsPanel}>{technicalDetail}</div>}
                    </>
                )}
            </div>

            <div className={styles.actions}>
                {isActive && <ProgressRing value={progressValue} />}

                {isCompleted && isBatch && (
                    <Button
                        component={Link}
                        size="compact-sm"
                        to={`${AppRoute.LIBRARY_SONGS}?offline=1`}
                        variant="subtle"
                    >
                        {t('productUx.import.downloads.viewSavedSongs')}
                    </Button>
                )}

                {isCompleted && !isBatch && (
                    <>
                        <ActionIcon
                            className={styles.playButton}
                            disabled={isPlaying}
                            icon="mediaPlay"
                            onClick={() => void playResolvedSong(Play.NOW)}
                            size="lg"
                            tooltip={{ label: t(PRODUCT_UX_ACTION_KEYS.play) }}
                            variant="filled"
                        />
                        <ActionIcon
                            icon="playlistAdd"
                            onClick={() => void playResolvedSong(Play.NEXT)}
                            size="md"
                            tooltip={{ label: t(PRODUCT_UX_ACTION_KEYS.playNext) }}
                            variant="subtle"
                        />
                        <ActionIcon
                            icon="ellipsisHorizontal"
                            onClick={handleContextMenu}
                            size="md"
                            tooltip={{ label: t('productUx.import.downloads.moreActions') }}
                            variant="subtle"
                        />
                    </>
                )}

                {canDismiss && (
                    <ActionIcon
                        icon="x"
                        onClick={() => onDismiss(job.id)}
                        size="md"
                        tooltip={{ label: t('productUx.import.downloads.dismiss') }}
                        variant="subtle"
                    />
                )}
            </div>
        </article>
    );
};
