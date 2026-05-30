import fs from 'node:fs';
import path from 'node:path';

const localesDir = path.join(process.cwd(), 'src/i18n/locales');
const en = JSON.parse(fs.readFileSync(path.join(localesDir, 'en.json'), 'utf8'));

const patches = {
    import: {
        ...en.productUx.import,
    },
    downloads: en.productUx.downloads,
    video: en.productUx.video,
    library: {
        ...en.productUx.library,
        albumsEmpty: en.productUx.library.albumsEmpty,
        artistsEmpty: en.productUx.library.artistsEmpty,
        playlistsEmpty: en.productUx.library.playlistsEmpty,
    },
    queue: en.productUx.queue,
    search: {
        empty: en.productUx.search.empty,
        youtubeMusic: {
            ...en.productUx.search.youtubeMusic,
        },
    },
};

const targets = ['de', 'fr', 'es', 'ja', 'pt-BR', 'zh-Hans', 'zh-Hant', 'it', 'nl', 'pl', 'ru', 'ko'];

for (const locale of targets) {
    const filePath = path.join(localesDir, `${locale}.json`);
    if (!fs.existsSync(filePath)) continue;

    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    data.productUx = data.productUx ?? {};
    data.productUx.import = { ...patches.import, ...data.productUx.import };
    data.productUx.downloads = { ...patches.downloads, ...data.productUx.downloads };
    data.productUx.video = {
        ...patches.video,
        ...data.productUx.video,
        toast: { ...patches.video.toast, ...data.productUx.video?.toast },
    };
    data.productUx.library = { ...patches.library, ...data.productUx.library };
    data.productUx.queue = { ...patches.queue, ...data.productUx.queue };
    data.productUx.search = data.productUx.search ?? {};
    data.productUx.search.empty = { ...patches.search.empty, ...data.productUx.search.empty };
    data.productUx.search.youtubeMusic = {
        ...patches.search.youtubeMusic,
        ...data.productUx.search.youtubeMusic,
    };

    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 4)}\n`, 'utf8');
    console.log(`patched ${locale}.json`);
}

console.log('done');
