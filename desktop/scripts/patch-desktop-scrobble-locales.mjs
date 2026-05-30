import fs from 'node:fs';
import path from 'node:path';

const localesDir = path.join(process.cwd(), 'src/i18n/locales');
const en = JSON.parse(fs.readFileSync(path.join(localesDir, 'en.json'), 'utf8'));

const scrobblePatches = {
    scrobble: en.setting.scrobble,
    scrobble_description: en.setting.scrobble_description,
    minimumScrobblePercentage: en.setting.minimumScrobblePercentage,
    minimumScrobblePercentage_description: en.setting.minimumScrobblePercentage_description,
    minimumScrobbleSeconds: en.setting.minimumScrobbleSeconds,
    minimumScrobbleSeconds_description: en.setting.minimumScrobbleSeconds_description,
    scrobbleForceSubmit: en.player.scrobbleForceSubmit,
};

const pageSettingScrobble = en.page.setting.scrobble;

const targets = ['de', 'fr', 'es', 'ja', 'pt-BR', 'zh-Hans', 'zh-Hant', 'it', 'nl', 'pl', 'ru', 'ko'];

for (const locale of targets) {
    const filePath = path.join(localesDir, `${locale}.json`);
    if (!fs.existsSync(filePath)) continue;

    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    data.setting = { ...data.setting, ...scrobblePatches };
    data.page = data.page ?? {};
    data.page.setting = { ...data.page.setting, scrobble: pageSettingScrobble };
    data.player = { ...data.player, scrobbleForceSubmit: scrobblePatches.scrobbleForceSubmit };

    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 4)}\n`, 'utf8');
    console.log(`patched scrobble strings in ${locale}.json`);
}

console.log('done');
