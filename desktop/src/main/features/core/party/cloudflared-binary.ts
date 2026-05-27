import { spawnSync } from 'child_process';
import { app } from 'electron';
import { chmodSync, existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import path from 'path';

import { store } from '../settings';

const BINARY_BASE = 'cloudflared';
const DOWNLOAD_TIMEOUT_MS = 120_000;

const bundledExecutableName = () =>
    process.platform === 'win32' ? `${BINARY_BASE}.exe` : BINARY_BASE;

const getUserBinDir = () => path.join(app.getPath('userData'), 'bin');

const getUserBinaryPath = () => path.join(getUserBinDir(), bundledExecutableName());

const findCommandOnPath = (command: string) => {
    const lookup = process.platform === 'win32' ? 'where.exe' : 'command';
    const args = process.platform === 'win32' ? [command] : ['-v', command];
    const result = spawnSync(lookup, args, {
        encoding: 'utf8',
        timeout: 5000,
        windowsHide: true,
    });
    const firstLine = result.stdout
        ?.split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean);
    return result.status === 0 && firstLine ? firstLine : null;
};

const findBundledBinary = () => {
    const binaryName = bundledExecutableName();
    const candidates = [
        path.join(process.resourcesPath || '', 'bin', process.platform, process.arch, binaryName),
        path.join(process.resourcesPath || '', 'bin', binaryName),
        path.join(app.getAppPath(), 'resources/bin', process.platform, process.arch, binaryName),
        path.join(app.getAppPath(), 'resources/bin', binaryName),
        path.join(app.getAppPath(), '../resources/bin', process.platform, process.arch, binaryName),
        path.join(app.getAppPath(), '../resources/bin', binaryName),
        path.join(
            __dirname,
            '../../../../../resources/bin',
            process.platform,
            process.arch,
            binaryName,
        ),
        path.join(__dirname, '../../../../../resources/bin', binaryName),
    ];

    return candidates.find((candidate) => candidate && existsSync(candidate)) || null;
};

export const resolveCloudflaredPath = (configuredPath?: string) => {
    const configured =
        configuredPath ||
        process.env.ROOFY_CLOUDFLARED_PATH ||
        (store.get('roofy.cloudflaredPath') as string | undefined);
    if (configured && existsSync(configured)) {
        return configured;
    }

    const bundled = findBundledBinary();
    if (bundled) return bundled;

    const userBinary = getUserBinaryPath();
    if (existsSync(userBinary)) return userBinary;

    return findCommandOnPath(BINARY_BASE);
};

const getDownloadSpec = (): { needsExtract: boolean; url: string } | null => {
    if (process.platform === 'win32') {
        return {
            needsExtract: false,
            url: 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe',
        };
    }

    if (process.platform === 'darwin') {
        const suffix = process.arch === 'arm64' ? 'arm64' : 'amd64';
        return {
            needsExtract: true,
            url: `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-${suffix}.tgz`,
        };
    }

    if (process.platform === 'linux') {
        const suffix = process.arch === 'arm64' ? 'arm64' : 'amd64';
        return {
            needsExtract: false,
            url: `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${suffix}`,
        };
    }

    return null;
};

const persistDownloadedPath = (binaryPath: string) => {
    store.set('roofy.cloudflaredPath', binaryPath);
};

export type CloudflaredEnsureResult =
    | { error: string; ok: false }
    | { ok: true; path: string };

let downloadPromise: Promise<CloudflaredEnsureResult> | undefined;

const downloadCloudflared = async (): Promise<CloudflaredEnsureResult> => {
    const spec = getDownloadSpec();
    if (!spec) {
        return {
            error: `Cloudflare Tunnel is not supported on ${process.platform}-${process.arch}. Use LAN mode instead.`,
            ok: false,
        };
    }

    const binDir = getUserBinDir();
    const binaryPath = getUserBinaryPath();
    mkdirSync(binDir, { recursive: true });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

    try {
        const response = await fetch(spec.url, { signal: controller.signal });
        if (!response.ok) {
            return {
                error: `Failed to download Cloudflare Tunnel (${response.status}). Check your internet connection or use LAN mode.`,
                ok: false,
            };
        }

        const bytes = Buffer.from(await response.arrayBuffer());

        if (spec.needsExtract) {
            const archivePath = path.join(binDir, 'cloudflared.tgz');
            writeFileSync(archivePath, bytes);
            const extract = spawnSync('tar', ['-xzf', archivePath, '-C', binDir], {
                timeout: 30_000,
                windowsHide: true,
            });
            unlinkSync(archivePath);

            if (extract.status !== 0 || !existsSync(binaryPath)) {
                return {
                    error: 'Downloaded Cloudflare Tunnel archive could not be extracted.',
                    ok: false,
                };
            }
        } else {
            writeFileSync(binaryPath, bytes);
        }

        if (process.platform !== 'win32') {
            chmodSync(binaryPath, 0o755);
        }

        persistDownloadedPath(binaryPath);
        return { ok: true, path: binaryPath };
    } catch (error) {
        const message = (error as Error).message;
        if (message.includes('aborted')) {
            return {
                error: 'Timed out downloading Cloudflare Tunnel. Check your internet connection or use LAN mode.',
                ok: false,
            };
        }
        return {
            error: `Could not download Cloudflare Tunnel: ${message}`,
            ok: false,
        };
    } finally {
        clearTimeout(timeout);
    }
};

export const ensureCloudflared = async (
    configuredPath?: string,
): Promise<CloudflaredEnsureResult> => {
    const existing = resolveCloudflaredPath(configuredPath);
    if (existing) return { ok: true, path: existing };

    if (!downloadPromise) {
        downloadPromise = downloadCloudflared().finally(() => {
            downloadPromise = undefined;
        });
    }

    return downloadPromise;
};
