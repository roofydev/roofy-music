import { useEffect, useRef } from 'react';

import { useImportJobs } from '/@/renderer/store';
import { toast } from '/@/shared/components/toast/toast';

export const ImportNotifications = () => {
    const jobs = useImportJobs();
    const notifiedRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        Object.values(jobs).forEach((job) => {
            const key = `${job.id}-${job.status}`;
            if (notifiedRef.current.has(key)) return;
            notifiedRef.current.add(key);

            const title = job.name || job.title || 'Track';
            const target = job.targetPlaylistNames?.join(', ') || 'Library';

            if (job.status === 'queued') {
                toast.info({
                    message: `"${title}" is waiting to download into ${target}.`,
                    title: 'Import queued',
                });
            } else if (job.status === 'running') {
                toast.info({
                    message: `"${title}" is downloading to Roofy Music (${job.progress}%).`,
                    title: 'Import in progress',
                });
            } else if (job.status === 'completed') {
                toast.success({
                    message: `"${title}" is now available in ${target}.`,
                    title: 'Import complete',
                });
            } else if (job.status === 'failed') {
                toast.error({
                    message: `"${title}" could not be imported: ${job.error || 'Unknown error'}`,
                    title: 'Import failed',
                });
            }
        });
    }, [jobs]);

    return null;
};
