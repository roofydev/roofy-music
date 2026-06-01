import isElectron from 'is-electron';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
    SettingOption,
    SettingsSection,
} from '/@/renderer/features/settings/components/settings-section';
import { Button } from '/@/shared/components/button/button';
import { Group } from '/@/shared/components/group/group';
import { Select } from '/@/shared/components/select/select';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';
import { showImportError } from '/@/shared/product-ux';

export const DownloadSettings = () => {
    const { t } = useTranslation();
    const [format, setFormat] = useState('bestaudio');
    const [quality, setQuality] = useState('best');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!isElectron()) return;
        window.api?.localSettings?.get('roofy.downloadFormat').then((value) => {
            if (value) setFormat(value as string);
        });
        window.api?.localSettings?.get('roofy.downloadQuality').then((value) => {
            if (value) setQuality(value as string);
        });
    }, []);

    const save = useCallback(() => {
        if (!isElectron()) return;
        window.api?.localSettings?.set('roofy.downloadFormat', format);
        window.api?.localSettings?.set('roofy.downloadQuality', quality);
        toast.success({ message: t('productUx.downloads.saved') });
    }, [format, quality, t]);

    const selectLibrary = async () => {
        if (!isElectron() || !window.api?.localFirst?.selectLibrary) return;
        setBusy(true);
        try {
            await window.api.localFirst.selectLibrary();
            toast.success({ message: t('productUx.downloads.folderUpdated') });
        } catch (error) {
            showImportError(t, error);
        } finally {
            setBusy(false);
        }
    };

    const options: SettingOption[] = [
        {
            control: (
                <Group>
                    <Button
                        disabled={busy}
                        loading={busy}
                        onClick={selectLibrary}
                        variant="default"
                    >
                        {t('productUx.downloads.chooseFolder')}
                    </Button>
                </Group>
            ),
            description: (
                <Text isMuted size="sm">
                    {t('productUx.downloads.folderDescription')}
                </Text>
            ),
            title: t('productUx.downloads.folderTitle'),
        },
        {
            control: (
                <Select
                    data={[
                        { label: 'Best available', value: 'bestaudio' },
                        { label: 'MP3', value: 'mp3' },
                        { label: 'Opus', value: 'opus' },
                        { label: 'M4A', value: 'm4a' },
                    ]}
                    onChange={(value) => value && setFormat(value)}
                    value={format}
                />
            ),
            description: (
                <Text isMuted size="sm">
                    {t('productUx.downloads.formatDescription')}
                </Text>
            ),
            title: t('productUx.downloads.formatTitle'),
        },
        {
            control: (
                <Select
                    data={[
                        { label: 'Best', value: 'best' },
                        { label: 'High', value: 'high' },
                        { label: 'Medium', value: 'medium' },
                        { label: 'Low', value: 'low' },
                    ]}
                    onChange={(value) => value && setQuality(value)}
                    value={quality}
                />
            ),
            description: (
                <Text isMuted size="sm">
                    {t('productUx.downloads.qualityDescription')}
                </Text>
            ),
            title: t('productUx.downloads.qualityTitle'),
        },
        {
            control: (
                <Button onClick={save} variant="state-info">
                    {t('common.save')}
                </Button>
            ),
            description: (
                <Text isMuted size="sm">
                    {t('productUx.downloads.applyDescription')}
                </Text>
            ),
            title: t('productUx.downloads.applyTitle'),
        },
    ];

    return <SettingsSection options={options} title={t('page.setting.downloadsOffline')} />;
};
