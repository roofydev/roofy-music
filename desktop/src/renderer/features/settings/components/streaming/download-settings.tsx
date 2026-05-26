import isElectron from 'is-electron';
import { useCallback, useEffect, useState } from 'react';

import {
    SettingOption,
    SettingsSection,
} from '/@/renderer/features/settings/components/settings-section';
import { Button } from '/@/shared/components/button/button';
import { Group } from '/@/shared/components/group/group';
import { Select } from '/@/shared/components/select/select';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';

export const DownloadSettings = () => {
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
        toast.success({ message: 'Download settings saved' });
    }, [format, quality]);

    const selectLibrary = async () => {
        if (!isElectron() || !window.api?.localFirst?.selectLibrary) return;
        setBusy(true);
        try {
            await window.api.localFirst.selectLibrary();
            toast.success({ message: 'Library folder updated' });
        } catch (error) {
            toast.error({ message: (error as Error).message });
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
                        Choose Folder
                    </Button>
                </Group>
            ),
            description: (
                <Text isMuted size="sm">
                    Downloads are saved into a subfolder inside your Roofy Music library.
                </Text>
            ),
            title: 'Download folder',
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
                    Audio format for downloaded YouTube Music tracks.
                </Text>
            ),
            title: 'Format',
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
                    Audio quality for lossy formats.
                </Text>
            ),
            title: 'Quality',
        },
        {
            control: (
                <Button onClick={save} variant="state-info">
                    Save
                </Button>
            ),
            description: (
                <Text isMuted size="sm">
                    Apply download preferences.
                </Text>
            ),
            title: 'Apply',
        },
    ];

    return <SettingsSection options={options} title="Downloads" />;
};
