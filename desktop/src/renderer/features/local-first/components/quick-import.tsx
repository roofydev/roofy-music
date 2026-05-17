import { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Group, Progress, Stack, Text, TextInput } from '@mantine/core';

type ImportJob = {
    error: string;
    id: string;
    input: string;
    message: string;
    progress: number;
    status: string;
};

type LocalStatus = {
    imports: ImportJob[];
};

const isPlaylistUrl = (value: string): boolean => {
    const trimmed = value.trim();
    if (!/^https?:\/\//i.test(trimmed)) return false;
    try {
        const url = new URL(trimmed);
        const host = url.hostname.replace(/^www\./, '');
        const list = url.searchParams.get('list');
        if (!list) return false;
        if (list.toUpperCase().startsWith('RD')) return false;
        return host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com' || host === 'youtu.be';
    } catch {
        return false;
    }
};

export const QuickImport = () => {
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [status, setStatus] = useState<LocalStatus | null>(null);
    const [createPlaylist, setCreatePlaylist] = useState(false);
    const [playlistName, setPlaylistName] = useState('');

    const refresh = async () => {
        const next = await window.api.localFirst.status();
        setStatus(next);
    };

    useEffect(() => {
        refresh();
        const timer = window.setInterval(refresh, 1500);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        const detected = isPlaylistUrl(input);
        setCreatePlaylist(detected);
        if (detected && !playlistName) {
            setPlaylistName('Imported Playlist');
        }
    }, [input]);

    const handleImport = async () => {
        if (!input.trim()) return;
        setBusy(true);
        setError('');
        try {
            await window.api.localFirst.createImport({
                input,
                createPlaylist: isPlaylistUrl(input) ? createPlaylist : false,
                playlistName: createPlaylist ? playlistName : undefined,
            });
            setInput('');
            setPlaylistName('');
            setCreatePlaylist(false);
            await refresh();
        } catch (err: any) {
            setError(err?.message || 'Import failed');
        } finally {
            setBusy(false);
        }
    };

    const showPlaylistOptions = isPlaylistUrl(input);

    return (
        <Stack gap="sm">
            <Group gap="sm">
                <TextInput
                    onChange={(event) => setInput(event.currentTarget.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !busy && input.trim()) {
                            handleImport();
                        }
                    }}
                    placeholder="Paste a YouTube video or playlist link"
                    style={{ flex: 1 }}
                    value={input}
                />
                <Button disabled={busy || !input.trim()} loading={busy} onClick={handleImport}>
                    Import
                </Button>
            </Group>
            {showPlaylistOptions && (
                <Stack gap="xs">
                    <Checkbox
                        checked={createPlaylist}
                        label="Create a playlist with these songs"
                        onChange={(event) => setCreatePlaylist(event.currentTarget.checked)}
                    />
                    {createPlaylist && (
                        <TextInput
                            label="Playlist name"
                            onChange={(event) => setPlaylistName(event.currentTarget.value)}
                            placeholder="Imported Playlist"
                            value={playlistName}
                        />
                    )}
                </Stack>
            )}
            {error && (
                <Alert color="red">
                    {error}
                </Alert>
            )}
            {status && status.imports.length > 0 && (
                <Stack gap="xs">
                    {status.imports.map((job) => (
                        <Stack key={job.id} gap={2}>
                            <Group justify="space-between">
                                <Text size="xs" truncate>
                                    {job.input}
                                </Text>
                                <Text c="dimmed" size="xs">
                                    {job.status}
                                </Text>
                            </Group>
                            <Progress size="sm" value={job.progress} />
                            <Text c={job.error ? 'red' : 'dimmed'} size="xs">
                                {job.error || job.message}
                            </Text>
                        </Stack>
                    ))}
                </Stack>
            )}
        </Stack>
    );
};
