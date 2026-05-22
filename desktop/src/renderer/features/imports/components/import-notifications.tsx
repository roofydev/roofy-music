import { useEffect, useRef } from 'react';

import { useImportJobs } from '/@/renderer/store';
import { toast } from '/@/shared/components/toast/toast';

const STORAGE_KEY = 'roofy.importNotifications';

function loadNotifiedKeys(): Set<string> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            return new Set(JSON.parse(raw));
        }
    } catch {
        // ignore parse errors
    }
    return new Set();
}

function saveNotifiedKeys(keys: Set<string>) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(keys)));
}

const clampText = (value: string, maxLength: number) => {
    if (value.length <= maxLength) return value;
    return `${value.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
};

const getTargetCopy = (names?: string[]) => {
    if (!names?.length) return 'Library';
    if (names.length === 1) return clampText(names[0], 42);
    return `${clampText(names[0], 32)} +${names.length - 1} more`;
};

const getDownloadedCopy = (count?: number) => {
    if (!count || count <= 1) return 'Track';
    return `${count} tracks`;
};

export const ImportNotifications = () => {
    const jobs = useImportJobs();
    const notifiedRef = useRef<Set<string>>(loadNotifiedKeys());

    useEffect(() => {
        const currentJobIds = new Set(Object.keys(jobs));
        const keysToKeep = new Set<string>();

        Object.values(jobs).forEach((job) => {
            const key = `${job.id}-${job.status}`;

            // Retain key for jobs that still exist so we don't re-notify
            if (notifiedRef.current.has(key)) {
                keysToKeep.add(key);
                return;
            }

            notifiedRef.current.add(key);
            keysToKeep.add(key);

            const title = clampText(job.name || job.title || 'Track', 48);
            const target = getTargetCopy(job.targetPlaylistNames);

            if (job.status === 'queued') {
                toast.info({
                    message: `${title} queued for ${target}.`,
                    title: 'Import queued',
                });
            } else if (job.status === 'running') {
                toast.info({
                    message: `${title} downloading (${job.progress}%).`,
                    title: 'Import in progress',
                });
            } else if (job.status === 'completed') {
                const skippedCopy =
                    job.skippedCount && job.skippedCount > 0
                        ? `${job.skippedCount} skipped.`
                        : clampText(job.warning || '', 70);
                const message = skippedCopy
                    ? `${getDownloadedCopy(job.downloadedCount)} imported to ${target}. ${skippedCopy}`
                    : `${getDownloadedCopy(job.downloadedCount)} imported to ${target}.`;

                if (skippedCopy) {
                    toast.warn({
                        message,
                        title: 'Import finished with skips',
                    });
                } else {
                    toast.success({
                        message,
                        title: 'Import complete',
                    });
                }
            } else if (job.status === 'failed') {
                toast.error({
                    message: `${title} import failed. ${clampText(job.error || 'Unknown error', 90)}`,
                    title: 'Import failed',
                });
            }
        });

        // Clean up keys for jobs that have been removed (e.g. cleared by user)
        notifiedRef.current.forEach((key) => {
            const jobId = key.split('-')[0];
            if (currentJobIds.has(jobId)) {
                keysToKeep.add(key);
            }
        });

        notifiedRef.current = keysToKeep;
        saveNotifiedKeys(keysToKeep);
    }, [jobs]);

    return null;
};
