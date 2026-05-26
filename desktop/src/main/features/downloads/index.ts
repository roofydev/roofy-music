import { app, ipcMain } from 'electron';
import { spawn } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

import { store } from '../core/settings';

export type DownloadJob = {
    id: string;
    sourceTrackId: string;
    videoId: string;
    title: string;
    artist: string;
    album?: string;
    status: 'queued' | 'downloading' | 'completed' | 'failed' | 'cancelled';
    progress: number;
    outputPath?: string;
    error?: string;
    createdAt: string;
    updatedAt: string;
};

const downloadJobs: DownloadJob[] = [];
let activeDownload: { child: ReturnType<typeof spawn>; id: string } | null = null;

const now = () => new Date().toISOString();

const getYtDlpPath = () => {
    const envPath = process.env.ROOFY_YT_DLP_PATH || (store.get('roofy.yt-dlpPath') as string);
    if (envPath) return envPath;

    const binaryName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
    const candidates = [
        path.join(process.resourcesPath || '', 'bin', process.platform, process.arch, binaryName),
        path.join(process.resourcesPath || '', 'bin', binaryName),
        path.join(app.getAppPath(), 'resources/bin', process.platform, process.arch, binaryName),
        path.join(app.getAppPath(), 'resources/bin', binaryName),
    ];

    for (const candidate of candidates) {
        if (existsSync(candidate)) return candidate;
    }

    return 'yt-dlp';
};

const getLibraryPath = () => {
    const configured = store.get('roofy.libraryPath') as string | undefined;
    return configured || path.join(app.getPath('music'), 'Roofy Music');
};

const getDownloadFolder = () => {
    const configured = store.get('roofy.downloadFolder') as string | undefined;
    return configured || path.join(getLibraryPath(), 'Downloads', 'YouTube Music');
};

const sanitizeFilename = (name: string): string => {
    return name
        .replace(/[<>:"/\\|?*]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 120);
};

const updateJob = (id: string, updates: Partial<DownloadJob>) => {
    const job = downloadJobs.find((j) => j.id === id);
    if (!job) return;
    Object.assign(job, { ...updates, updatedAt: now() });
};

const getCookieArgs = (): string[] => {
    const cookieBrowser = store.get('roofy.cookieBrowser') as string | undefined;
    const cookiesFilePath = store.get('roofy.cookiesFilePath') as string | undefined;

    if (cookiesFilePath && existsSync(cookiesFilePath)) {
        return ['--cookies', cookiesFilePath];
    }
    if (cookieBrowser && cookieBrowser !== 'auto') {
        return ['--cookies-from-browser', cookieBrowser];
    }
    return [];
};

const getFormatArgs = (): string[] => {
    const format = (store.get('roofy.downloadFormat') as string) || 'bestaudio';
    const quality = (store.get('roofy.downloadQuality') as string) || 'best';

    const args: string[] = [];

    if (format === 'mp3') {
        args.push('-f', 'bestaudio', '--extract-audio', '--audio-format', 'mp3');
        if (quality === 'high') args.push('--audio-quality', '0');
        else if (quality === 'medium') args.push('--audio-quality', '4');
        else if (quality === 'low') args.push('--audio-quality', '7');
    } else if (format === 'opus') {
        args.push('-f', 'bestaudio', '--extract-audio', '--audio-format', 'opus');
    } else if (format === 'm4a') {
        args.push('-f', 'bestaudio', '--extract-audio', '--audio-format', 'm4a');
    } else {
        args.push('-f', 'bestaudio', '--extract-audio', '--audio-format', 'best');
    }

    return args;
};

const runDownload = async (job: DownloadJob) => {
    const ytDlpPath = getYtDlpPath();
    const downloadFolder = getDownloadFolder();

    const artistDir = sanitizeFilename(job.artist || 'Unknown Artist');
    const albumDir = sanitizeFilename(job.album || 'Unknown Album');
    const outDir = path.join(downloadFolder, artistDir, albumDir);
    mkdirSync(outDir, { recursive: true });

    const outTemplate = path.join(outDir, '%(playlist_index,track_number)02d - %(title)s.%(ext)s');

    const args = [
        '--no-playlist',
        '--no-warnings',
        '--newline',
        '--embed-thumbnail',
        '--embed-metadata',
        '--parse-metadata',
        ' %(artist)s:%(meta_artist)s',
        '--parse-metadata',
        ' %(album)s:%(meta_album)s',
        '-o',
        outTemplate,
        ...getFormatArgs(),
        ...getCookieArgs(),
        `https://music.youtube.com/watch?v=${job.videoId}`,
    ];

    updateJob(job.id, { status: 'downloading', progress: 0, message: 'Starting download' } as any);

    return new Promise<void>((resolve, reject) => {
        const child = spawn(ytDlpPath, args, { windowsHide: true });
        activeDownload = { child, id: job.id };

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data: Buffer) => {
            const text = data.toString();
            stdout += text;

            const progressMatch = text.match(/\[download\]\s+(\d+\.?\d*)%/);
            if (progressMatch) {
                const progress = parseFloat(progressMatch[1]);
                updateJob(job.id, { progress });
            }
        });

        child.stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
        });

        child.on('close', (code) => {
            activeDownload = null;

            if (job.status === 'cancelled') {
                resolve();
                return;
            }

            if (code !== 0) {
                updateJob(job.id, {
                    error: stderr || `yt-dlp exited with code ${code}`,
                    status: 'failed',
                });
                reject(new Error(stderr || `yt-dlp exited with code ${code}`));
                return;
            }

            // Try to find the output file
            const possibleExts = ['opus', 'mp3', 'm4a', 'webm', 'ogg'];
            let outputPath: string | undefined;
            const baseName = sanitizeFilename(job.title);

            for (const ext of possibleExts) {
                const candidate = path.join(outDir, `01 - ${baseName}.${ext}`);
                if (existsSync(candidate)) {
                    outputPath = candidate;
                    break;
                }
            }

            // Fallback: search directory for any file with the videoId or title
            if (!outputPath) {
                const fs = require('fs');
                const files = fs.readdirSync(outDir);
                for (const file of files) {
                    if (file.includes(job.videoId) || file.includes(baseName.substring(0, 20))) {
                        outputPath = path.join(outDir, file);
                        break;
                    }
                }
            }

            updateJob(job.id, {
                outputPath,
                progress: 100,
                status: 'completed',
            });

            // Trigger Navidrome scan if local-first is running
            try {
                const { startLocalFirst } = require('../core/local-first');
                startLocalFirst()
                    .then(() => {
                        // Navidrome will pick up the new file on its next scan
                        console.log(`[Download] Completed ${job.videoId} -> ${outputPath}`);
                    })
                    .catch(() => {
                        console.log(`[Download] Completed ${job.videoId}, Navidrome not running`);
                    });
            } catch {
                // Ignore
            }

            resolve();
        });

        child.on('error', (error) => {
            activeDownload = null;
            updateJob(job.id, { error: error.message, status: 'failed' });
            reject(error);
        });
    });
};

const processQueue = async () => {
    if (activeDownload) return;

    const nextJob = downloadJobs.find((j) => j.status === 'queued');
    if (!nextJob) return;

    try {
        await runDownload(nextJob);
    } catch {
        // Error already recorded in job
    } finally {
        processQueue();
    }
};

const startDownload = (args: {
    album?: string;
    artist: string;
    sourceTrackId: string;
    title: string;
    videoId: string;
}): DownloadJob => {
    const job: DownloadJob = {
        artist: args.artist,
        createdAt: now(),
        error: '',
        id: randomUUID(),
        progress: 0,
        sourceTrackId: args.sourceTrackId,
        status: 'queued',
        title: args.title,
        updatedAt: now(),
        videoId: args.videoId,
    };

    if (args.album) {
        job.album = args.album;
    }

    downloadJobs.unshift(job);
    processQueue();
    return job;
};

const cancelDownload = (id: string) => {
    const job = downloadJobs.find((j) => j.id === id);
    if (!job) return false;

    job.status = 'cancelled';
    if (activeDownload?.id === id) {
        activeDownload.child.kill();
        activeDownload = null;
    }
    return true;
};

const getDownloadStatus = (id?: string): DownloadJob | DownloadJob[] => {
    if (id) {
        return (
            downloadJobs.find((j) => j.id === id) ||
            ({ id: '', status: 'failed', error: 'Not found' } as DownloadJob)
        );
    }
    return downloadJobs;
};

const getDownloadsForTrack = (sourceTrackId: string): DownloadJob | undefined => {
    return downloadJobs.find(
        (j) =>
            j.sourceTrackId === sourceTrackId &&
            ['queued', 'downloading', 'completed'].includes(j.status),
    );
};

// IPC handlers
ipcMain.handle('download:start', (_event, args: Parameters<typeof startDownload>[0]) => {
    return startDownload(args);
});

ipcMain.handle('download:cancel', (_event, id: string) => {
    return cancelDownload(id);
});

ipcMain.handle('download:status', (_event, id?: string) => {
    return getDownloadStatus(id);
});

ipcMain.handle('download:track-status', (_event, sourceTrackId: string) => {
    return getDownloadsForTrack(sourceTrackId) || null;
});

export const downloads = {
    cancelDownload,
    getDownloadStatus,
    getDownloadsForTrack,
    startDownload,
};
