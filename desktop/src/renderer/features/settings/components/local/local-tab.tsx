import {
    Alert,
    Badge,
    Button,
    Checkbox,
    Code,
    Divider,
    Group,
    PasswordInput,
    Progress,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { useCallback, useEffect, useRef, useState } from 'react';

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
    importSources?: {
        soundcloud: {
            configured: boolean;
            message: string;
        };
        spotify: {
            clientId: string;
            configured: boolean;
            connected: boolean;
            displayName?: string;
            message: string;
            redirectUri?: string;
        };
    };
    libraryPath: string;
    mobileImport: {
        error?: string;
        mode: 'lan' | 'tunnel';
        pairingUrl?: string;
        state: 'connected' | 'disabled' | 'starting' | 'unavailable';
        token: string;
        url?: string;
    };
    navidrome: {
        available: boolean;
        configPath: string;
        message: string;
        password: string;
        running: boolean;
        url: string;
        username: string;
    };
    pairing: {
        error?: string;
        lanHosts?: string[];
        mode: 'lan' | 'tunnel';
        pairingUrl?: string;
        state: 'connected' | 'disabled' | 'starting' | 'unavailable';
        url?: string;
    };
    metadata: {
        autoEnrich: boolean;
    };
    tools: {
        deno: boolean;
        ffmpeg: boolean;
        navidrome: boolean;
        spotdl: boolean;
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
    const [mobileImportQrDataUrl, setMobileImportQrDataUrl] = useState<null | string>(null);
    const [mobileImportQrError, setMobileImportQrError] = useState(false);
    const [pairingQrDataUrl, setPairingQrDataUrl] = useState<null | string>(null);
    const [pairingQrError, setPairingQrError] = useState(false);
    const [tagEditorPath, setTagEditorPath] = useState('');
    const [tagTitle, setTagTitle] = useState('');
    const [tagArtist, setTagArtist] = useState('');
    const [tagAlbum, setTagAlbum] = useState('');
    const [tagAlbumArtist, setTagAlbumArtist] = useState('');
    const [tagArtworkUrl, setTagArtworkUrl] = useState('');

    const statusRef = useRef<LocalStatus | null>(null);

    const refresh = useCallback(async () => {
        const next = await window.api.localFirst.status();
        statusRef.current = next;
        setStatus(next);
    }, []);

    useEffect(() => {
        let cancelled = false;
        let timer: number | undefined;

        const scheduleNext = () => {
            const current = statusRef.current;
            const pairingStarting = current?.pairing.state === 'starting';
            const importStarting = current?.mobileImport.state === 'starting';
            const hasActiveImports = Boolean(
                current?.imports.some(
                    (job) => job.status === 'running' || job.status === 'pending',
                ),
            );
            const delayMs =
                pairingStarting || importStarting ? 2000 : hasActiveImports ? 4000 : 8000;
            timer = window.setTimeout(tick, delayMs);
        };

        const tick = async () => {
            if (cancelled || document.hidden) {
                scheduleNext();
                return;
            }
            await refresh();
            if (!cancelled) {
                scheduleNext();
            }
        };

        void refresh().finally(() => {
            if (!cancelled) {
                scheduleNext();
            }
        });

        const onVisibility = () => {
            if (!document.hidden && !cancelled) {
                window.clearTimeout(timer);
                void refresh().finally(scheduleNext);
            }
        };
        document.addEventListener('visibilitychange', onVisibility);

        return () => {
            cancelled = true;
            document.removeEventListener('visibilitychange', onVisibility);
            if (timer !== undefined) {
                window.clearTimeout(timer);
            }
        };
    }, [refresh]);

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

    useEffect(() => {
        const pairingUrl = status?.pairing.pairingUrl;
        if (!pairingUrl) {
            setPairingQrDataUrl(null);
            setPairingQrError(false);
            return;
        }

        let cancelled = false;
        import('qrcode')
            .then(({ default: QRCode }) =>
                QRCode.toDataURL(pairingUrl, {
                    color: { dark: '#111111', light: '#ffffff' },
                    margin: 2,
                    width: 220,
                }),
            )
            .then((dataUrl) => {
                if (!cancelled) {
                    setPairingQrDataUrl(dataUrl);
                    setPairingQrError(false);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setPairingQrDataUrl(null);
                    setPairingQrError(true);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [status?.pairing.pairingUrl]);

    useEffect(() => {
        const pairingUrl = status?.mobileImport.pairingUrl;
        if (!pairingUrl) {
            setMobileImportQrDataUrl(null);
            setMobileImportQrError(false);
            return;
        }

        let cancelled = false;
        import('qrcode')
            .then(({ default: QRCode }) =>
                QRCode.toDataURL(pairingUrl, {
                    color: { dark: '#111111', light: '#ffffff' },
                    margin: 2,
                    width: 220,
                }),
            )
            .then((dataUrl) => {
                if (!cancelled) {
                    setMobileImportQrDataUrl(dataUrl);
                    setMobileImportQrError(false);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setMobileImportQrDataUrl(null);
                    setMobileImportQrError(true);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [status?.mobileImport.pairingUrl]);

    const copyPairingLink = async () => {
        const pairingUrl = status?.pairing.pairingUrl;
        if (!pairingUrl) return;
        await navigator.clipboard.writeText(pairingUrl);
        setMessage('Copied mobile pairing link.');
    };

    const copyMobileImportLink = async () => {
        const pairingUrl = status?.mobileImport.pairingUrl;
        if (!pairingUrl) return;
        await navigator.clipboard.writeText(pairingUrl);
        setMessage('Copied desktop import pairing link.');
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
                    {toolBadge(Boolean(status?.tools.spotdl), 'spotDL')}
                    {toolBadge(Boolean(status?.tools.ytDlp), 'yt-dlp')}
                    {toolBadge(Boolean(status?.tools.ffmpeg), 'ffmpeg')}
                    {toolBadge(Boolean(status?.tools.deno), 'Deno')}
                </Group>

                <Checkbox
                    checked={Boolean(status?.metadata?.autoEnrich)}
                    disabled={busy}
                    label="Enrich imported tags with MusicBrainz (title, artist, album, cover art)"
                    onChange={(event) =>
                        run(() =>
                            window.api.localFirst.setAutoEnrichMetadata(event.currentTarget.checked),
                        )
                    }
                />
                <Text c="dimmed" size="sm">
                    Uses ffprobe for existing tags, then MusicBrainz (rate-limited, optional). No
                    AcoustID fingerprinting yet.
                </Text>
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

            <Divider />

            <Stack gap="md">
                <Stack gap={4}>
                    <Text fw={600}>Add from phone to desktop</Text>
                    <Text c="dimmed" size="sm">
                        Let your phone send YouTube Music tracks into this desktop import queue and
                        use Continue on phone for playback handoff. Start a private endpoint, pair the
                        phone, then use Add to my library in
                        mobile song menu.
                    </Text>
                </Stack>

                <Group align="flex-start" gap="xl">
                    <Stack gap="xs" style={{ minWidth: 260 }}>
                        <Group gap="xs">
                            <Badge
                                color={
                                    status?.mobileImport.state === 'connected'
                                        ? 'green'
                                        : status?.mobileImport.state === 'starting'
                                          ? 'yellow'
                                          : status?.mobileImport.state === 'unavailable'
                                            ? 'red'
                                            : 'gray'
                                }
                                variant="light"
                            >
                                {status?.mobileImport.mode || 'tunnel'}:{' '}
                                {status?.mobileImport.state || 'disabled'}
                            </Badge>
                        </Group>

                        <Text c="dimmed" size="sm">
                            Tunnel mode can receive imports outside your network. LAN mode keeps the
                            import endpoint on the current Wi-Fi network.
                        </Text>

                        {status?.mobileImport.url && (
                            <Stack gap={4}>
                                <Text size="sm">Import endpoint</Text>
                                <Code block>{status.mobileImport.url}</Code>
                            </Stack>
                        )}

                        {status?.mobileImport.error && (
                            <Alert color="red" title="Import endpoint unavailable">
                                {status.mobileImport.error}
                            </Alert>
                        )}

                        <Group>
                            <Button
                                disabled={busy || status?.mobileImport.state === 'starting'}
                                onClick={() =>
                                    run(() => window.api.localFirst.startMobileImport('tunnel'))
                                }
                                variant="filled"
                            >
                                Start tunnel
                            </Button>
                            <Button
                                disabled={busy || status?.mobileImport.state === 'starting'}
                                onClick={() =>
                                    run(() => window.api.localFirst.startMobileImport('lan'))
                                }
                                variant="light"
                            >
                                Use LAN
                            </Button>
                            <Button
                                disabled={busy || status?.mobileImport.state === 'disabled'}
                                onClick={() => run(() => window.api.localFirst.stopMobileImport())}
                                variant="subtle"
                            >
                                Stop
                            </Button>
                        </Group>
                    </Stack>

                    <Stack align="center" gap="xs">
                        {mobileImportQrDataUrl ? (
                            <img
                                alt="Desktop import pairing QR code"
                                height={220}
                                src={mobileImportQrDataUrl}
                                width={220}
                            />
                        ) : (
                            <div
                                style={{
                                    alignItems: 'center',
                                    border: '1px solid var(--mantine-color-gray-4)',
                                    display: 'flex',
                                    height: 220,
                                    justifyContent: 'center',
                                    width: 220,
                                }}
                            >
                                <Text c="dimmed" size="sm" ta="center">
                                    {mobileImportQrError
                                        ? 'Could not generate QR code'
                                        : 'Start tunnel or LAN import'}
                                </Text>
                            </div>
                        )}

                        <Button
                            disabled={!status?.mobileImport.pairingUrl}
                            onClick={copyMobileImportLink}
                            size="compact-sm"
                            variant="default"
                        >
                            Copy import pairing link
                        </Button>
                    </Stack>
                </Group>
            </Stack>

            <Divider />

            <Stack gap="md">
                <Stack gap={4}>
                    <Text fw={600}>Pair phone with Personal Library</Text>
                    <Text c="dimmed" size="sm">
                        Start a private connection to the bundled Navidrome engine, then scan the QR
                        code from the mobile Personal Library setup.
                    </Text>
                </Stack>

                <Group align="flex-start" gap="xl">
                    <Stack gap="xs" style={{ minWidth: 260 }}>
                        <Group gap="xs">
                            <Badge
                                color={
                                    status?.pairing.state === 'connected'
                                        ? 'green'
                                        : status?.pairing.state === 'starting'
                                          ? 'yellow'
                                          : status?.pairing.state === 'unavailable'
                                            ? 'red'
                                            : 'gray'
                                }
                                variant="light"
                            >
                                {status?.pairing.mode || 'tunnel'}:{' '}
                                {status?.pairing.state || 'disabled'}
                            </Badge>
                        </Group>

                        <Text c="dimmed" size="sm">
                            Tunnel mode works away from home through the bundled cloudflared binary.
                            LAN mode keeps traffic on the current Wi-Fi network (phone and PC must be on
                            the same network; guest Wi-Fi with client isolation will fail).
                        </Text>

                        {status?.pairing.mode === 'lan' && status.pairing.state === 'connected' && (
                            <Alert color="blue" title="LAN pairing tips">
                                Allow Roofy through Windows Firewall when prompted. If the phone reports
                                &quot;No route to host&quot;, try Start tunnel instead, or set server URL
                                manually to an address your phone can reach (same subnet as Wi‑Fi).
                                {status.pairing.lanHosts?.length ? (
                                    <>
                                        {' '}
                                        Other IPs on this PC:{' '}
                                        {status.pairing.lanHosts.join(', ')}
                                    </>
                                ) : null}
                            </Alert>
                        )}

                        {status?.pairing.url && (
                            <Stack gap={4}>
                                <Text size="sm">Server URL</Text>
                                <Code block>{status.pairing.url}</Code>
                            </Stack>
                        )}

                        {status?.pairing.error && (
                            <Alert color="red" title="Pairing unavailable">
                                {status.pairing.error}
                            </Alert>
                        )}

                        <Group>
                            <Button
                                disabled={busy || status?.pairing.state === 'starting'}
                                onClick={() =>
                                    run(() => window.api.localFirst.startPairing('tunnel'))
                                }
                                variant="filled"
                            >
                                Start tunnel
                            </Button>
                            <Button
                                disabled={busy || status?.pairing.state === 'starting'}
                                onClick={() => run(() => window.api.localFirst.startPairing('lan'))}
                                variant="light"
                            >
                                Use LAN
                            </Button>
                            <Button
                                disabled={busy || status?.pairing.state === 'disabled'}
                                onClick={() => run(() => window.api.localFirst.stopPairing())}
                                variant="subtle"
                            >
                                Stop
                            </Button>
                        </Group>
                    </Stack>

                    <Stack align="center" gap="xs">
                        {pairingQrDataUrl ? (
                            <img
                                alt="Mobile Personal Library pairing QR code"
                                height={220}
                                src={pairingQrDataUrl}
                                width={220}
                            />
                        ) : (
                            <div
                                style={{
                                    alignItems: 'center',
                                    border: '1px solid var(--mantine-color-gray-4)',
                                    display: 'flex',
                                    height: 220,
                                    justifyContent: 'center',
                                    width: 220,
                                }}
                            >
                                <Text c="dimmed" size="sm" ta="center">
                                    {pairingQrError
                                        ? 'Could not generate QR code'
                                        : 'Start tunnel or LAN pairing'}
                                </Text>
                            </div>
                        )}

                        <Button
                            disabled={!status?.pairing.pairingUrl}
                            onClick={copyPairingLink}
                            size="compact-sm"
                            variant="default"
                        >
                            Copy pairing link
                        </Button>
                    </Stack>
                </Group>
            </Stack>

            <Divider />

            <Stack gap="md">
                <Stack gap={4}>
                    <Text fw={600}>Import sources</Text>
                    <Text c="dimmed" size="sm">
                        Spotify track, playlist, album, and artist links import through spotDL when
                        it is installed. Public SoundCloud links import through yt-dlp.
                    </Text>
                </Stack>

                <Group gap="xs">
                    <Badge color={status?.tools.spotdl ? 'green' : 'yellow'} variant="light">
                        Spotify: {status?.tools.spotdl ? 'spotDL ready' : 'spotDL missing'}
                    </Badge>
                    <Badge color="green" variant="light">
                        SoundCloud: public links supported
                    </Badge>
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
                        onClick={() => run(() => window.api.localFirst.openLibraryFolder())}
                        variant="subtle"
                    >
                        Open folder
                    </Button>
                </Group>
            </Stack>

            <Stack gap="sm">
                <Text fw={600}>Edit file tags</Text>
                <Text c="dimmed" size="sm">
                    Probe or rewrite embedded tags on a file in your library folder (uses ffmpeg).
                </Text>
                <TextInput
                    label="Audio file path"
                    onChange={(event) => setTagEditorPath(event.currentTarget.value)}
                    placeholder="C:\Music\library\Downloads\Artist\Song.mp3"
                    value={tagEditorPath}
                />
                <Group grow>
                    <TextInput
                        label="Title"
                        onChange={(event) => setTagTitle(event.currentTarget.value)}
                        value={tagTitle}
                    />
                    <TextInput
                        label="Artist"
                        onChange={(event) => setTagArtist(event.currentTarget.value)}
                        value={tagArtist}
                    />
                </Group>
                <Group grow>
                    <TextInput
                        label="Album"
                        onChange={(event) => setTagAlbum(event.currentTarget.value)}
                        value={tagAlbum}
                    />
                    <TextInput
                        label="Album artist"
                        onChange={(event) => setTagAlbumArtist(event.currentTarget.value)}
                        value={tagAlbumArtist}
                    />
                </Group>
                <TextInput
                    label="Artwork URL (optional)"
                    onChange={(event) => setTagArtworkUrl(event.currentTarget.value)}
                    value={tagArtworkUrl}
                />
                <Group>
                    <Button
                        disabled={busy || !tagEditorPath}
                        onClick={() =>
                            run(async () => {
                                const tags = await window.api.localFirst.probeAudioTags(tagEditorPath);
                                setTagTitle(tags.title || '');
                                setTagArtist(tags.artist || '');
                                setTagAlbum(tags.album || '');
                                setTagAlbumArtist(tags.albumArtist || '');
                                setMessage('Tags loaded from file.');
                            })
                        }
                        variant="light"
                    >
                        Probe tags
                    </Button>
                    <Button
                        disabled={busy || !tagEditorPath || !tagTitle}
                        onClick={() =>
                            run(async () => {
                                await window.api.localFirst.writeAudioTags({
                                    album: tagAlbum || undefined,
                                    albumArtist: tagAlbumArtist || undefined,
                                    artist: tagArtist || undefined,
                                    artworkUrl: tagArtworkUrl || undefined,
                                    filePath: tagEditorPath,
                                    title: tagTitle,
                                });
                                setMessage('Tags written to file. Run a Navidrome scan to refresh the library.');
                            })
                        }
                    >
                        Save tags
                    </Button>
                    <Button
                        disabled={busy || !tagEditorPath}
                        onClick={() =>
                            run(async () => {
                                await window.api.localFirst.enrichAudioFile(tagEditorPath);
                                const tags = await window.api.localFirst.probeAudioTags(tagEditorPath);
                                setTagTitle(tags.title || tagTitle);
                                setTagArtist(tags.artist || tagArtist);
                                setTagAlbum(tags.album || tagAlbum);
                                setTagAlbumArtist(tags.albumArtist || tagAlbumArtist);
                                setMessage('MusicBrainz enrichment applied.');
                            })
                        }
                        variant="subtle"
                    >
                        Enrich (MusicBrainz)
                    </Button>
                </Group>
            </Stack>

            <Stack gap="sm">
                <Text fw={600}>Import queue</Text>
                {status?.imports.length ? (
                    status.imports.map((job) => (
                        <Stack gap={4} key={job.id}>
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
