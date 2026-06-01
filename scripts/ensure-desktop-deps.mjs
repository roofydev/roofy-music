/**
 * Ensures desktop/node_modules exists (vite, electron-vite, etc.).
 * Root `npm install` only audits the wrapper package; desktop uses pnpm separately.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const desktopDir = join(root, 'desktop');
const viteBin =
  process.platform === 'win32'
    ? join(desktopDir, 'node_modules', '.bin', 'vite.cmd')
    : join(desktopDir, 'node_modules', '.bin', 'vite');

const force = process.argv.includes('--force');

if (!force && existsSync(viteBin)) {
  process.exit(0);
}

console.log('[roofy-music] Installing desktop dependencies (pnpm)...');

const result = spawnSync('corepack', ['pnpm', 'install', '--dir', 'desktop'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status === 0 ? 0 : result.status ?? 1);
