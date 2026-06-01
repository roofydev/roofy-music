import type { TFunction } from 'i18next';

import type { ImportJob } from '/@/renderer/store/import-jobs.store';
import { getImportStatusLabelKey } from '/@/shared/product-ux';
import { mapImportError } from '/@/shared/product-ux/user-error-messages';

import { isMultiTrackImportJob } from '../hooks/use-resolve-import-song';

export const getImportJobTitle = (job: ImportJob, t: TFunction) =>
    job.title || job.name || t('productUx.import.downloads.untitled');

export const getImportJobArtist = (job: ImportJob, t: TFunction) =>
    job.artist || job.albumArtist || t('productUx.import.unknownArtist');

export const getImportJobTargetLabel = (job: ImportJob, t: TFunction) => {
    const names = job.targetPlaylistNames?.filter(Boolean);
    if (!names?.length) {
        return t('productUx.import.downloads.targetLibrary');
    }
    if (names.length === 1) {
        return names[0];
    }
    return t('productUx.import.downloads.targetPlaylists', { count: names.length });
};

export const getImportJobStatusLine = (job: ImportJob, t: TFunction) => {
    if (job.status === 'completed') {
        if (isMultiTrackImportJob(job)) {
            return t('productUx.import.downloads.songsSaved', { count: job.downloadedCount });
        }
        return t('productUx.import.downloads.savedTo', { target: getImportJobTargetLabel(job, t) });
    }

    if (job.status === 'failed') {
        return t(mapImportError().messageKey);
    }

    if (job.status === 'running' && job.progress > 0) {
        return t(getImportStatusLabelKey(job.status));
    }

    return t(getImportStatusLabelKey(job.status));
};

export const getImportJobProgressValue = (job: ImportJob) => {
    if (job.status === 'completed') return 100;
    if (job.status === 'failed') return job.progress || 0;
    return job.progress;
};
