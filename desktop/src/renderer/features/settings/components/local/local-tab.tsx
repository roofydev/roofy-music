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

const toolBadge = (available: boolean, label: string) => (
    <Badge color={available ? 'green' : 'red'} variant="light">
        {label}: {available ? 'ready' : 'missing'}
    </Badge>
);

export const LocalTab = () => {
    const [status, setStatus] = useState<LocalStatus | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserIsAdmin, setNewUserIsAdmin] = useState(false);
    const [newUserName, setNewUserName] = useState('');
    const [newUserPassword, setNewUserPassword] = useState('');
    const [newUsername, setNewUsername] = useState('');

    const refresh = async () => {
        const next = await window.api.localFirst.status();
        setStatus(next);
    };

    useEffect(() => {
        refresh();
        const timer = window.setInterval(refresh, 1500);
        return () => window.clearInterval(timer);
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
        <Stack gap="xl" p="md">
            <Title order={3}>Roofy Local</Title>

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
                    These credentials are generated for this local install and are used for the
                    bundled Navidrome engine.
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
                    <Button disabled={busy || !newUsername || !newUserPassword} onClick={createUser}>
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
                        onClick={() => run(() => window.api.localFirst.openLibraryFolder())}
                        variant="subtle"
                    >
                        Open folder
                    </Button>
                </Group>
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
    );
};
