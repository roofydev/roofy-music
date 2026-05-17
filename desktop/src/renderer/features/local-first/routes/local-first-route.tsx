import isElectron from 'is-electron';
import { useEffect, useState } from 'react';
import {
    Alert,
    Badge,
    Button,
    Checkbox,
    Group,
    PasswordInput,
    Progress,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';

import { AnimatedPage } from '/@/renderer/features/shared/components/animated-page';
import { NativeScrollArea } from '/@/renderer/components/native-scroll-area/native-scroll-area';
import { Select } from '/@/shared/components/select/select';

type LocalStatus = {
    dataPath: string;
    imports: Array<{
        error: string;
        id: string;
        input: string;
        message: string;
        progress: number;
        status: string;
    }>;
    libraryPath: string;
    navidrome: {
        available: boolean;
        configPath: string;
        message: string;
        password: string;
        running: boolean;
        url: string;
        username: string;
    };
    tools: {
        deno: boolean;
        ffmpeg: boolean;
        navidrome: boolean;
        ytDlp: boolean;
    };
};

type ImportPreview = {
    count: number;
    duration: null | number;
    isPlaylist: boolean;
    thumbnail: string;
    title: string;
    uploader: string;
    webpageUrl: string;
};

const toolBadge = (available: boolean, label: string) => (
    <Badge color={available ? 'green' : 'red'} variant="light">
        {label}: {available ? 'ready' : 'missing'}
    </Badge>
);

const LocalFirstRoute = () => {
    const [status, setStatus] = useState<LocalStatus | null>(null);
    const [input, setInput] = useState('');
    const [preview, setPreview] = useState<ImportPreview | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserIsAdmin, setNewUserIsAdmin] = useState(false);
    const [newUserName, setNewUserName] = useState('');
    const [newUserPassword, setNewUserPassword] = useState('');
    const [newUsername, setNewUsername] = useState('');
    const [cookieBrowser, setCookieBrowser] = useState('auto');
    const [cookiesFilePath, setCookiesFilePath] = useState('');

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
        if (!isElectron()) return;
        window.api.localSettings.get('roofy.cookieBrowser').then((value) => {
            if (typeof value === 'string') setCookieBrowser(value);
        });
        window.api.localSettings.get('roofy.cookiesFilePath').then((value) => {
            if (typeof value === 'string') setCookiesFilePath(value);
        });
    }, []);

    const run = async (action: () => Promise<any>) => {
        setBusy(true);
        setError('');
        setMessage('');
        try {
            const result = await action();
            if (result?.libraryPath || result?.navidrome) {
                setStatus(result);
            }
            return result;
        } catch (err: any) {
            setError(err?.message || 'Action failed');
        } finally {
            setBusy(false);
        }
    };

    const previewImport = async () => {
        const result = await run(() =>
            window.api.localFirst.previewImport({ cookieBrowser: cookieBrowser || undefined, input }),
        );
        if (result) setPreview(result);
    };

    const createImport = async () => {
        await run(() =>
            window.api.localFirst.createImport({ cookieBrowser: cookieBrowser || undefined, input }),
        );
        setPreview(null);
        await refresh();
    };

    const createUser = async () => {
        const result = await run(() =>
            window.api.localFirst.createUser({
                email: newUserEmail,
                isAdmin: newUserIsAdmin,
                name: newUserName || newUsername,
                password: newUserPassword,
                username: newUsername,
            }),
        );

        if (!result) return;

        setMessage(`Created local user "${result.username}".`);
        setNewUserEmail('');
        setNewUserIsAdmin(false);
        setNewUserName('');
        setNewUserPassword('');
        setNewUsername('');
    };

    return (
        <AnimatedPage>
            <NativeScrollArea>
                <Stack gap="xl" p="xl">
                    <Stack gap="xs">
                        <Title order={1}>Roofy Local</Title>
                        <Text c="dimmed">
                            Manage the bundled local library engine and import permitted audio into
                            your own music folder.
                        </Text>
                    </Stack>

                    {error && (
                        <Alert color="red" title="Local action failed">
                            {error}
                        </Alert>
                    )}

                    {message && (
                        <Alert color="green" title="Done">
                            {message}
                        </Alert>
                    )}

                    <Stack gap="md">
                        <Group gap="xs">
                            {toolBadge(Boolean(status?.tools.navidrome), 'Navidrome')}
                            {toolBadge(Boolean(status?.tools.ytDlp), 'yt-dlp')}
                            {toolBadge(Boolean(status?.tools.ffmpeg), 'ffmpeg')}
                            {toolBadge(Boolean(status?.tools.deno), 'Deno')}
                        </Group>
                        <Group align="end" gap="md">
                            <Stack gap={4}>
                                <Text fw={600}>Local engine</Text>
                                <Text c="dimmed" size="sm">
                                    {status?.navidrome.url || 'http://127.0.0.1:4533'} -{' '}
                                    {status?.navidrome.message || 'Checking'}
                                </Text>
                                <Text c="dimmed" size="sm">
                                    Login: {status?.navidrome.username || 'admin'}
                                </Text>
                            </Stack>
                            <Button
                                disabled={busy}
                                onClick={() => run(() => window.api.localFirst.start())}
                                variant="filled"
                            >
                                Start
                            </Button>
                            <Button
                                disabled={busy}
                                onClick={() => run(() => window.api.localFirst.stop())}
                                variant="light"
                            >
                                Stop
                            </Button>
                        </Group>
                    </Stack>

                    <Stack gap="sm">
                        <Text fw={600}>Default local login</Text>
                        <Text c="dimmed" size="sm">
                            These credentials are generated for this local install and are used for
                            the bundled Navidrome engine.
                        </Text>
                        <Group align="flex-start" gap="xl">
                            <Stack gap={4}>
                                <Text size="sm">Server URL</Text>
                                <Text ff="monospace" size="sm">
                                    {status?.navidrome.url || 'http://127.0.0.1:4533'}
                                </Text>
                            </Stack>
                            <Stack gap={4}>
                                <Text size="sm">Username</Text>
                                <Text ff="monospace" size="sm">
                                    {status?.navidrome.username || 'admin'}
                                </Text>
                            </Stack>
                            <Stack gap={4}>
                                <Text size="sm">Password</Text>
                                <Text ff="monospace" size="sm">
                                    {status?.navidrome.password || 'Loading'}
                                </Text>
                            </Stack>
                        </Group>
                        <Text c="dimmed" size="xs">
                            Stored in {status?.navidrome.configPath || 'the app config file'} as
                            roofy.navidromePassword.
                        </Text>
                    </Stack>

                    <Stack gap="md">
                        <Stack gap={4}>
                            <Text fw={600}>Create local user</Text>
                            <Text c="dimmed" size="sm">
                                This creates a Navidrome account on the bundled local engine.
                            </Text>
                        </Stack>
                        <Group align="end">
                            <TextInput
                                label="Username"
                                onChange={(event) => setNewUsername(event.currentTarget.value)}
                                value={newUsername}
                            />
                            <TextInput
                                label="Display name"
                                onChange={(event) => setNewUserName(event.currentTarget.value)}
                                value={newUserName}
                            />
                            <TextInput
                                label="Email"
                                onChange={(event) => setNewUserEmail(event.currentTarget.value)}
                                value={newUserEmail}
                            />
                            <PasswordInput
                                label="Password"
                                onChange={(event) => setNewUserPassword(event.currentTarget.value)}
                                value={newUserPassword}
                            />
                            <Checkbox
                                checked={newUserIsAdmin}
                                label="Admin"
                                onChange={(event) => setNewUserIsAdmin(event.currentTarget.checked)}
                            />
                            <Button
                                disabled={busy || !newUsername || !newUserPassword}
                                onClick={createUser}
                            >
                                Create user
                            </Button>
                        </Group>
                    </Stack>

                    <Stack gap="sm">
                        <Text fw={600}>Library folder</Text>
                        <Text c="dimmed" size="sm">
                            {status?.libraryPath || 'Loading'}
                        </Text>
                        <Group>
                            <Button
                                disabled={busy}
                                onClick={() => run(() => window.api.localFirst.selectLibrary())}
                                variant="light"
                            >
                                Choose folder
                            </Button>
                            <Button
                                disabled={busy}
                                onClick={() =>
                                    run(() => window.api.localFirst.openLibraryFolder())
                                }
                                variant="subtle"
                            >
                                Open folder
                            </Button>
                        </Group>
                    </Stack>

                    <Stack gap="md">
                        <Stack gap={4}>
                            <Text fw={600}>Import from YouTube</Text>
                            <Text c="dimmed" size="sm">
                                Paste a video or playlist link. Roofy handles the downloader,
                                format conversion, signed-in browser access, and library import.
                            </Text>
                        </Stack>
                        <TextInput
                            onChange={(event) => setInput(event.currentTarget.value)}
                            placeholder="Paste a YouTube video or playlist link"
                            value={input}
                        />
                        <Group align="end" gap="md">
                            <Select
                                clearable
                                data={[
                                    { label: 'Auto', value: 'auto' },
                                    { label: 'Edge', value: 'edge' },
                                    { label: 'Chrome', value: 'chrome' },
                                    { label: 'Brave', value: 'brave' },
                                    { label: 'Firefox', value: 'firefox' },
                                    { label: 'Vivaldi', value: 'vivaldi' },
                                    { label: 'Chromium', value: 'chromium' },
                                    { label: 'Opera', value: 'opera' },
                                ]}
                                label="Cookie browser"
                                onChange={(value) => {
                                    const next = value || '';
                                    setCookieBrowser(next);
                                    if (isElectron()) {
                                        window.api.localSettings.set('roofy.cookieBrowser', next || undefined);
                                    }
                                }}
                                value={cookieBrowser || null}
                            />
                            <TextInput
                                label="Cookies file"
                                onChange={(event) => {
                                    const next = event.currentTarget.value;
                                    setCookiesFilePath(next);
                                    if (isElectron()) {
                                        window.api.localSettings.set(
                                            'roofy.cookiesFilePath',
                                            next || undefined,
                                        );
                                    }
                                }}
                                placeholder="Path to cookies.txt (optional)"
                                value={cookiesFilePath}
                            />
                            <Button
                                disabled={busy}
                                onClick={async () => {
                                    if (!isElectron()) return;
                                    const path = await window.api.localSettings.openFileSelector({
                                        filters: [
                                            { extensions: ['txt'], name: 'Text files' },
                                            { extensions: ['*'], name: 'All files' },
                                        ],
                                        title: 'Select cookies file',
                                    });
                                    if (path) {
                                        setCookiesFilePath(path);
                                        window.api.localSettings.set(
                                            'roofy.cookiesFilePath',
                                            path,
                                        );
                                    }
                                }}
                                variant="light"
                            >
                                Browse
                            </Button>
                        </Group>
                        <Group align="end">
                            <Button disabled={busy || !input} onClick={previewImport} variant="light">
                                Check link
                            </Button>
                            <Button disabled={busy || !input} onClick={createImport}>
                                Import
                            </Button>
                        </Group>

                        {preview && (
                            <Alert color="blue" title={preview.title}>
                                <Text size="sm">
                                    {preview.uploader} - {preview.count} item
                                    {preview.count === 1 ? '' : 's'}
                                </Text>
                            </Alert>
                        )}
                    </Stack>

                    <Stack gap="sm">
                        <Text fw={600}>Import queue</Text>
                        {status?.imports.length ? (
                            status.imports.map((job) => (
                                <Stack key={job.id} gap={4}>
                                    <Group justify="space-between">
                                        <Text size="sm">{job.input}</Text>
                                        <Badge variant="light">{job.status}</Badge>
                                    </Group>
                                    <Progress value={job.progress} />
                                    <Text c={job.error ? 'red' : 'dimmed'} size="xs">
                                        {job.error || job.message}
                                    </Text>
                                </Stack>
                            ))
                        ) : (
                            <Text c="dimmed" size="sm">
                                No imports queued.
                            </Text>
                        )}
                    </Stack>
                </Stack>
            </NativeScrollArea>
        </AnimatedPage>
    );
};

export default LocalFirstRoute;
