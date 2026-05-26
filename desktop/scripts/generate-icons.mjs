import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pngToIco from 'png-to-ico';
import { writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const iconsDir = join(root, 'assets', 'icons');

// Generate PNGs via Python
console.log('Generating icon PNGs...');
const pythonScript = join(__dirname, 'generate-icons-from-png.py');
try {
    execSync(`python "${pythonScript}"`, { stdio: 'inherit' });
} catch (err) {
    console.error(err);
    process.exit(1);
}

// Generate ICOs from PNGs using png-to-ico
console.log('Generating ICO files...');

const sizes = [16, 24, 32, 48, 64, 72, 96, 128, 256, 512, 1024];
const pngBuffers = {};
for (const size of sizes) {
    pngBuffers[size] = readFileSync(join(iconsDir, `${size}x${size}.png`));
}

// Windows ICO
const icoBuf = await pngToIco([
    pngBuffers[16],
    pngBuffers[32],
    pngBuffers[48],
    pngBuffers[128],
    pngBuffers[256],
]);
writeFileSync(join(iconsDir, 'icon.ico'), icoBuf);
console.log('  icon.ico');

// Favicon ICO
const faviconBuf = await pngToIco([pngBuffers[16], pngBuffers[32]]);
writeFileSync(join(iconsDir, 'favicon.ico'), faviconBuf);
console.log('  favicon.ico');

console.log('All icons generated!');
