import { useEffect, useState } from 'react';
import { Alert, Button, Group, Progress, Stack, Text, TextInput } from '@mantine/core';

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

export const QuickImport = () => {
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [status, setStatus] = useState<LocalStatus | null>(null);

    const refresh = async () => {
        const next = await window.api.localFirst.status();
        setStatus(next);
    };

    useEffect(() => {
        refresh();
        const timer = window.setInterval(refresh, 1500);
        return () => window.clearInterval(timer);
    }, []);

    const handleImport = async () => {
        if (!input.trim()) return;
        setBusy(true);
        setError('');
        try {
            await window.api.localFirst.createImport({ input });
            setInput('');
            await refresh();
        } catch (err: any) {
            setError(err?.message || 'Import failed');
        } finally {
            setBusy(false);
        }
    };

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
