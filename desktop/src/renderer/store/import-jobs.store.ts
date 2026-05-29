import { create } from 'zustand';

export type ImportJob = {
    album?: string;
    albumArtist?: string;
    artist?: string;
    artists?: string[];
    createdAt?: string;
    downloadedCount?: number;
    error?: string;
    id: string;
    imageUrl?: string;
    localTrackId?: string;
    message?: string;
    name?: string;
    progress: number;
    saveVideo?: boolean;
    skippedCount?: number;
    source: 'soundcloud' | 'spotify' | 'youtube_music';
    sourcePlaylistId?: string;
    sourceTrackId?: string;
    sourceUrl?: string;
    status: ImportJobStatus;
    targetPlaylistIds?: string[];
    targetPlaylistNames?: string[];
    title?: string;
    updatedAt?: string;
    videoDownloadedCount?: number;
    videoId?: string;
    warning?: string;
};

export type ImportJobStatus = 'completed' | 'failed' | 'queued' | 'running';

interface ImportJobsState {
    actions: {
        clearCompleted: () => void;
        clearFailed: () => void;
        removeJob: (id: string) => void;
        setJob: (job: ImportJob) => void;
    };
    jobs: Record<string, ImportJob>;
}

export const useImportJobsStore = create<ImportJobsState>((set) => ({
    actions: {
        clearCompleted: () =>
            set((state) => ({
                jobs: Object.fromEntries(
                    Object.entries(state.jobs).filter(([, job]) => job.status !== 'completed'),
                ),
            })),
        clearFailed: () =>
            set((state) => ({
                jobs: Object.fromEntries(
                    Object.entries(state.jobs).filter(([, job]) => job.status !== 'failed'),
                ),
            })),
        removeJob: (id) =>
            set((state) => {
                const next = { ...state.jobs };
                delete next[id];
                return { jobs: next };
            }),
        setJob: (job) =>
            set((state) => ({
                jobs: { ...state.jobs, [job.id]: job },
            })),
    },
    jobs: {},
}));

export const useImportJobActions = () => useImportJobsStore((state) => state.actions);
export const useImportJobs = () => useImportJobsStore((state) => state.jobs);
