import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { useImportJobs } from '/@/renderer/store';
import { showImportError } from '/@/shared/product-ux';
import { toast } from '/@/shared/components/toast/toast';

const STORAGE_KEY = 'roofy.importNotifications';
const SESSION_STARTED_AT = Date.now();

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
    if (!count || count <= 1) return '1 track';
    return `${count} tracks`;
};

const getVideoCopy = (job: {
    saveVideo?: boolean;
    source?: string;
    videoDownloadedCount?: number;
    warning?: string;
}) => {
    if (job.source === 'spotify') return '';
    if (!job.saveVideo) return '';
    if (job.videoDownloadedCount && job.videoDownloadedCount > 0) return ' Video included.';
    return ' Video was not saved.';
};

const jobStartedBeforeSession = (job: { createdAt?: string }) => {
    if (!job.createdAt) return false;
    const createdAt = Date.parse(job.createdAt);
    return Number.isFinite(createdAt) && createdAt < SESSION_STARTED_AT;
};

export const ImportNotifications = () => {
    const { t } = useTranslation();
    const jobs = useImportJobs();
    const notifiedRef = useRef<Set<string>>(loadNotifiedKeys());
    const activeToastRef = useRef<Set<string>>(new Set());
    const initializedRef = useRef(false);

    useEffect(() => {
        const keysToKeep = new Set<string>();

        if (!initializedRef.current) {
            Object.values(jobs).forEach((job) => {
                if (job.status === 'completed' || job.status === 'failed') {
                    const key = `${job.id}:${job.status}`;
                    notifiedRef.current.add(key);
                    keysToKeep.add(key);
                }
            });
            notifiedRef.current = new Set([...keysToKeep, ...notifiedRef.current]);
            saveNotifiedKeys(notifiedRef.current);
            initializedRef.current = true;
            return;
        }

        Object.values(jobs).forEach((job) => {
            if (jobStartedBeforeSession(job)) {
                if (job.status === 'completed' || job.status === 'failed') {
                    const key = `${job.id}:${job.status}`;
                    notifiedRef.current.add(key);
                    keysToKeep.add(key);
                }
                return;
            }

            const toastId = `import-${job.id}`;
            const title = clampText(job.name || job.title || 'Track', 48);
            const target = getTargetCopy(job.targetPlaylistNames);

            if (job.status === 'queued') {
                if (activeToastRef.current.has(job.id)) return;
                activeToastRef.current.add(job.id);
                toast.show({
                    id: toastId,
                    loading: true,
                    message: t('productUx.import.toast.queuedMessage', { target, title }),
                    title: t('productUx.import.toast.queuedTitle'),
                    withCloseButton: false,
                });
            } else if (job.status === 'running') {
                const message = t('productUx.import.toast.savingMessage', {
                    progress: job.progress,
                    title,
                });
                if (activeToastRef.current.has(job.id)) {
                    toast.update({
                        id: toastId,
                        loading: true,
                        message,
                        title: t('productUx.import.toast.savingTitle'),
                        withCloseButton: false,
                    });
                } else {
                    activeToastRef.current.add(job.id);
                    toast.show({
                        id: toastId,
                        loading: true,
                        message,
                        title: t('productUx.import.toast.savingTitle'),
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
                const summary = getDownloadedCopy(job.downloadedCount);
                const message = t('productUx.import.toast.savedMessage', {
                    summary: `${summary}${videoCopy}${skippedCopy ? ` ${skippedCopy}` : ''}`,
                    target,
                });

                if (skippedCopy) {
                    if (hadActiveToast) toast.hide(toastId);
                    toast.warn({
                        id: toastId,
                        loading: false,
                        message,
                        title: t('productUx.import.toast.savedWithSkipsTitle'),
                        withCloseButton: true,
                    });
                } else {
                    if (hadActiveToast) toast.hide(toastId);
                    toast.success({
                        id: toastId,
                        loading: false,
                        message,
                        title: t('productUx.import.toast.savedTitle'),
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
                showImportError(t, job.error ?? new Error('import_failed'));
            }
        });

        notifiedRef.current = keysToKeep;
        saveNotifiedKeys(keysToKeep);
    }, [jobs, t]);

    return null;
};
