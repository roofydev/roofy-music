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

const getVideoCopy = (job: {
    saveVideo?: boolean;
    videoDownloadedCount?: number;
    warning?: string;
}) => {
    if (!job.saveVideo) return '';
    if (job.videoDownloadedCount && job.videoDownloadedCount > 0) return ' MP4 video saved.';
    return ' Audio imported; MP4 video was not saved.';
};

export const ImportNotifications = () => {
    const jobs = useImportJobs();
    const notifiedRef = useRef<Set<string>>(loadNotifiedKeys());
    const activeToastRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        const keysToKeep = new Set<string>();

        Object.values(jobs).forEach((job) => {
            const toastId = `import-${job.id}`;
            const title = clampText(job.name || job.title || 'Track', 48);
            const target = getTargetCopy(job.targetPlaylistNames);

            if (job.status === 'queued') {
                if (activeToastRef.current.has(job.id)) return;
                activeToastRef.current.add(job.id);
                toast.show({
                    id: toastId,
                    loading: true,
                    message: `${title} queued for ${target}.`,
                    title: 'Import queued',
                    withCloseButton: false,
                });
            } else if (job.status === 'running') {
                const message = `${title} downloading (${job.progress}%).`;
                if (activeToastRef.current.has(job.id)) {
                    toast.update({
                        id: toastId,
                        loading: true,
                        message,
                        title: 'Import in progress',
                        withCloseButton: false,
                    });
                } else {
                    activeToastRef.current.add(job.id);
                    toast.show({
                        id: toastId,
                        loading: true,
                        message,
                        title: 'Import in progress',
                        withCloseButton: false,
                    });
                }
            } else if (job.status === 'completed') {
                const key = `${job.id}:completed`;
                if (notifiedRef.current.has(key)) {
                    keysToKeep.add(key);
                    return;
                }
                notifiedRef.current.add(key);
                keysToKeep.add(key);
                const hadActiveToast = activeToastRef.current.has(job.id);
                activeToastRef.current.delete(job.id);

                const skippedCopy =
                    job.skippedCount && job.skippedCount > 0
                        ? `${job.skippedCount} skipped.`
                        : clampText(job.warning || '', 70);
                const videoCopy = getVideoCopy(job);
                const message = skippedCopy
                    ? `${getDownloadedCopy(job.downloadedCount)} imported to ${target}.${videoCopy} ${skippedCopy}`
                    : `${getDownloadedCopy(job.downloadedCount)} imported to ${target}.${videoCopy}`;

                if (skippedCopy) {
                    if (hadActiveToast) toast.hide(toastId);
                    toast.warn({
                        id: toastId,
                        loading: false,
                        message,
                        title: 'Import finished with skips',
                        withCloseButton: true,
                    });
                } else {
                    if (hadActiveToast) toast.hide(toastId);
                    toast.success({
                        id: toastId,
                        loading: false,
                        message,
                        title: 'Import complete',
                        withCloseButton: true,
                    });
                }
            } else if (job.status === 'failed') {
                const key = `${job.id}:failed`;
                if (notifiedRef.current.has(key)) {
                    keysToKeep.add(key);
                    return;
                }
                notifiedRef.current.add(key);
                keysToKeep.add(key);
                const hadActiveToast = activeToastRef.current.has(job.id);
                activeToastRef.current.delete(job.id);

                if (hadActiveToast) toast.hide(toastId);
                toast.error({
                    id: toastId,
                    loading: false,
                    message: `${title} import failed. ${clampText(job.error || 'Unknown error', 90)}`,
                    title: 'Import failed',
                    withCloseButton: true,
                });
            }
        });

        notifiedRef.current = keysToKeep;
        saveNotifiedKeys(keysToKeep);
    }, [jobs]);

    return null;
};
