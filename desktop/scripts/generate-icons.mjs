import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { renderAsync } from '@resvg/resvg-js';
import pngToIco from 'png-to-ico';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const iconsDir = join(root, 'assets', 'icons');
const mediaDir = join(root, 'media');

mkdirSync(iconsDir, { recursive: true });
mkdirSync(mediaDir, { recursive: true });

const svgPath = join(root, 'logo.svg');
const svgContent = readFileSync(svgPath, 'utf8');

// For template icons, remove the white background rect
const svgTemplate = svgContent.replace(/<rect[^>]*>.*?<\/rect>/s, '');

const sizes = [16, 24, 32, 48, 64, 72, 96, 128, 256, 512, 1024];

async function renderPng(svg, size) {
    const result = await renderAsync(svg, {
        fitTo: { mode: 'width', value: size },
        background: 'white',
    });
    return result.asPng();
}

async function renderPngTransparent(svg, size) {
    const result = await renderAsync(svg, {
        fitTo: { mode: 'width', value: size },
    });
    return result.asPng();
}

async function main() {
    console.log('Generating icon PNGs...');
    const pngBuffers = {};

    for (const size of sizes) {
        const buf = await renderPng(svgContent, size);
        pngBuffers[size] = buf;
        writeFileSync(join(iconsDir, `${size}x${size}.png`), buf);
        console.log(`  ${size}x${size}.png`);
    }

    // Main icon files
    writeFileSync(join(iconsDir, 'icon.png'), pngBuffers[256]);
    console.log('  icon.png (256x256)');

    // ICO for Windows
    const icoBuf = await pngToIco([
        pngBuffers[16],
        pngBuffers[32],
        pngBuffers[48],
        pngBuffers[128],
        pngBuffers[256],
    ]);
    writeFileSync(join(iconsDir, 'icon.ico'), icoBuf);
    console.log('  icon.ico');

    // Favicon
    const faviconBuf = await pngToIco([pngBuffers[16], pngBuffers[32]]);
    writeFileSync(join(iconsDir, 'favicon.ico'), faviconBuf);
    console.log('  favicon.ico');

    // macOS template icons (transparent, smaller)
    const template16 = await renderPngTransparent(svgTemplate, 16);
    const template32 = await renderPngTransparent(svgTemplate, 32);
    writeFileSync(join(iconsDir, 'IconTemplate.png'), template16);
    writeFileSync(join(iconsDir, 'IconTemplate@2x.png'), template32);
    console.log('  IconTemplate.png / IconTemplate@2x.png');

    console.log('Done!');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
