import { create } from 'zustand';

export type ImportJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export type ImportJob = {
    album?: string;
    artist?: string;
    id: string;
    imageUrl?: string;
    source: 'youtube_music';
    sourceTrackId?: string;
    videoId?: string;
    targetPlaylistIds?: string[];
    targetPlaylistNames?: string[];
    status: ImportJobStatus;
    progress: number;
    localTrackId?: string;
    error?: string;
    message?: string;
    name?: string;
    title?: string;
};

interface ImportJobsState {
    jobs: Record<string, ImportJob>;
    actions: {
        clearCompleted: () => void;
        clearFailed: () => void;
        removeJob: (id: string) => void;
        setJob: (job: ImportJob) => void;
    };
}

export const useImportJobsStore = create<ImportJobsState>((set) => ({
    jobs: {},
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
}));

export const useImportJobActions = () => useImportJobsStore((state) => state.actions);
export const useImportJobs = () => useImportJobsStore((state) => state.jobs);
