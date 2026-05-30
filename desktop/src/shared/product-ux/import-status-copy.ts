export type ImportPipelineStatus =
    | 'completed'
    | 'failed'
    | 'matching'
    | 'queued'
    | 'running'
    | 'saved';

/** Maps backend import job statuses to product UX pipeline labels (i18n keys). */
export function getImportStatusLabelKey(status: string): string {
    switch (status) {
        case 'queued':
            return 'productUx.import.status.matching';
        case 'running':
            return 'productUx.import.status.saving';
        case 'completed':
            return 'productUx.import.status.saved';
        case 'failed':
            return 'productUx.import.status.failed';
        default:
            return 'productUx.import.status.saving';
    }
}

export function getImportStatusBadgeKey(status: string): string {
    switch (status) {
        case 'queued':
            return 'productUx.import.badge.queued';
        case 'running':
            return 'productUx.import.badge.saving';
        case 'completed':
            return 'productUx.import.badge.saved';
        case 'failed':
            return 'productUx.import.badge.needsReview';
        default:
            return 'productUx.import.badge.saving';
    }
}
