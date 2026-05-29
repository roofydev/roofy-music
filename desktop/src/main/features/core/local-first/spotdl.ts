import { ChildProcessWithoutNullStreams, spawn, spawnSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from 'fs';
import path from 'path';

import { store } from '../settings';

import { extractYoutubeVideoId, isYoutubeWatchUrl } from '/@/shared/utils/youtube-video-id';

export type SpotdlSong = {
    album_artist?: string;
    album_name?: string;
    artist?: string;
    artists?: string[];
    cover_url?: null | string;
    date?: string;
    disc_number?: number;
    download_url?: null | string;
    duration?: number;
    explicit?: boolean;
    isrc?: null | string;
    list_name?: null | string;
    list_url?: null | string;
    name: string;
    song_id?: string;
    track_number?: number;
    url?: string;
    year?: number;
};

export type SpotdlRunContext = {
    cookieFilePath?: string;
    ffmpegPath?: null | string;
    getSpotifyClientId: () => string;
    getSpotifyClientSecret: () => string;
    libraryPath: string;
    spotdlPath: null | string;
};

const AUDIO_EXTENSIONS = new Set([
    '.aac',
    '.flac',
    '.m4a',
    '.mka',
    '.mp3',
    '.ogg',
    '.opus',
    '.wav',
    '.webm',
    '.wma',
]);

const bundledExecutableName = (baseName: string) =>
    process.platform === 'win32' ? `${baseName}.exe` : baseName;

export const findSpotdlExecutable = (envName = 'ROOFY_SPOTDL_PATH') => {
    const configured = process.env[envName] || (store.get('roofy.spotdlPath') as string | undefined);
    if (configured && existsSync(configured)) return configured;

    const binaryName = bundledExecutableName('spotdl');
    return binaryName;
};

const commandExists = (command: string, prefixArgs: string[] = []) => {
    const result = spawnSync(command, [...prefixArgs, '--version'], {
        encoding: 'utf8',
        timeout: 8000,
        windowsHide: true,
    });
    return !result.error && result.status === 0;
};

export const getSpotdlInvocation = (): null | { command: string; prefixArgs: string[] } => {
    const configured = process.env.ROOFY_SPOTDL_PATH || (store.get('roofy.spotdlPath') as string);
    if (configured && existsSync(configured)) {
        return { command: configured, prefixArgs: [] };
    }

    if (commandExists('spotdl')) return { command: 'spotdl', prefixArgs: [] };
    if (commandExists('python', ['-m', 'spotdl'])) return { command: 'python', prefixArgs: ['-m', 'spotdl'] };
    if (commandExists('py', ['-m', 'spotdl'])) return { command: 'py', prefixArgs: ['-m', 'spotdl'] };

    return null;
};

export const spotdlAvailable = () => Boolean(getSpotdlInvocation());

const buildSpotdlArgs = (context: SpotdlRunContext, extra: string[] = []) => {
    const args = ['--log-level', 'ERROR', ...extra];

    if (context.ffmpegPath) {
        args.push('--ffmpeg', context.ffmpegPath);
    }

    if (context.cookieFilePath) {
        args.push('--cookie-file', context.cookieFilePath);
    }

    const clientId = context.getSpotifyClientId();
    const clientSecret = context.getSpotifyClientSecret();
    if (clientId) args.push('--client-id', clientId);
    if (clientSecret) args.push('--client-secret', clientSecret);

    return args;
};

const runSpotdlProcess = (
    context: SpotdlRunContext,
    operationArgs: string[],
    onLine?: (line: string) => void,
    onSpawn?: (child: ChildProcessWithoutNullStreams) => void,
) =>
    new Promise<{ output: string; stdout: string }>((resolve, reject) => {
        const invocation = getSpotdlInvocation();
        if (!invocation) {
            reject(new Error('spotDL is not installed. Install it with pip install spotdl.'));
            return;
        }

        const args = [...invocation.prefixArgs, ...buildSpotdlArgs(context), ...operationArgs];
        const recentOutput: string[] = [];
        let stdout = '';

        const child = spawn(invocation.command, args, {
            cwd: context.libraryPath,
            windowsHide: true,
        }) as ChildProcessWithoutNullStreams;
        onSpawn?.(child);

        const handleChunk = (chunk: Buffer, isStdout: boolean) => {
            const text = chunk.toString();
            if (isStdout) stdout += text;

            for (const line of text.split(/\r?\n/)) {
                const clean = line.trim();
                if (!clean) continue;
                recentOutput.push(clean);
                if (recentOutput.length > 48) recentOutput.shift();
                onLine?.(clean);
            }
        };

        child.stdout.on('data', (chunk) => handleChunk(chunk, true));
        child.stderr.on('data', (chunk) => handleChunk(chunk, false));

        child.on('error', (error) => reject(error));
        child.on('close', (code) => {
            const output = recentOutput.join('\n');
            if (code !== 0) {
                reject(new Error(output || `spotDL exited with code ${code}`));
                return;
            }
            resolve({ output, stdout });
        });

        (child as ChildProcessWithoutNullStreams & { roofySpotdl?: boolean }).roofySpotdl = true;
    });

export const parseSpotdlSaveOutput = (stdout: string): SpotdlSong[] => {
    const trimmed = stdout.trim();
    if (!trimmed) return [];

    const jsonStart = trimmed.indexOf('[');
    const jsonPayload = jsonStart >= 0 ? trimmed.slice(jsonStart) : trimmed;
    const parsed = JSON.parse(jsonPayload);
    return Array.isArray(parsed) ? parsed : [parsed];
};

export const runSpotdlSave = async (context: SpotdlRunContext, query: string) => {
    const tempDir = path.join(context.libraryPath, '.roofy-spotdl');
    mkdirSync(tempDir, { recursive: true });
    const saveFile = path.join(tempDir, `preview-${Date.now()}.spotdl`);

    try {
        const { stdout } = await runSpotdlProcess(context, [
            'save',
            query,
            '--save-file',
            saveFile,
        ]);
        if (existsSync(saveFile)) {
            return parseSpotdlSaveOutput(readFileSync(saveFile, 'utf8'));
        }
        return parseSpotdlSaveOutput(stdout);
    } finally {
        if (existsSync(saveFile)) {
            try {
                unlinkSync(saveFile);
            } catch {
                // ignore cleanup failures
            }
        }
    }
};

export const collectAudioFiles = (rootDir: string) => {
    const files: string[] = [];

    const walk = (dir: string) => {
        if (!existsSync(dir)) return;
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath);
                continue;
            }
            if (entry.isFile() && AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
                files.push(fullPath);
            }
        }
    };

    walk(rootDir);
    return files;
};

export const runSpotdlDownload = async (
    context: SpotdlRunContext,
    query: string,
    outputTemplate: string,
    onLine?: (line: string) => void,
    onSpawn?: (child: ChildProcessWithoutNullStreams) => void,
) => {
    mkdirSync(path.dirname(outputTemplate), { recursive: true });
    return runSpotdlProcess(
        context,
        ['download', query, '--output', outputTemplate, '--format', 'mp3'],
        onLine,
        onSpawn,
    );
};

export const summarizeSpotdlPreview = (input: string, songs: SpotdlSong[]) => {
    if (songs.length === 0) {
        throw new Error('spotDL did not return any tracks for this link.');
    }

    const first = songs[0];
    const listName = first.list_name?.trim();
    const isMulti =
        songs.length > 1 ||
        /\/playlist\//.test(input) ||
        /\/album\//.test(input) ||
        /\/artist\//.test(input) ||
        Boolean(listName);

    const title =
        listName ||
        (isMulti ? 'Spotify collection' : first.name || 'Spotify track');
    const artworkUrl = songs.find((song) => song.cover_url)?.cover_url || '';
    const playlistMatch = /\/playlist\/([^/?]+)/.exec(input);
    const trackMatch = /\/track\/([^/?]+)/.exec(input);

    return {
        artworkUrl: artworkUrl || undefined,
        isPlaylist: isMulti,
        sourcePlaylistId: playlistMatch?.[1],
        sourceTrackId: !isMulti ? trackMatch?.[1] || first.song_id : undefined,
        sourceUrl: first.list_url || first.url || input,
        thumbnail: artworkUrl || '',
        title,
        uploader: first.artist || first.artists?.join(', ') || 'Spotify',
    };
};

export const spotdlSongToNormalizedTrack = (song: SpotdlSong) => {
    const artists = (song.artists || []).filter(Boolean);
    const artist = song.artist || artists.join(', ') || undefined;
    const resolvedSourceUrl =
        song.download_url && isYoutubeWatchUrl(song.download_url) ? song.download_url : undefined;
    const hasMatch = Boolean(resolvedSourceUrl);

    return {
        album: song.album_name || undefined,
        albumArtist: song.album_artist || artist,
        artist,
        artists: artists.length > 0 ? artists : artist ? [artist] : undefined,
        artworkUrl: song.cover_url || undefined,
        discNumber: song.disc_number || undefined,
        durationMs: song.duration ? Math.round(song.duration * 1000) : undefined,
        explicit: Boolean(song.explicit),
        isrc: song.isrc || undefined,
        matchConfidence: hasMatch ? 100 : 0,
        matchState: hasMatch ? ('matched' as const) : ('unavailable' as const),
        releaseDate: song.date || (song.year ? String(song.year) : undefined),
        resolvedSource: 'youtube_music' as const,
        resolvedSourceUrl,
        resolvedSourceTrackId: resolvedSourceUrl
            ? extractYoutubeVideoId(resolvedSourceUrl)
            : undefined,
        source: 'spotify' as const,
        sourceTrackId: song.song_id,
        sourceUrl: song.url,
        title: song.name || 'Untitled',
        trackNumber: song.track_number || undefined,
    };
};
