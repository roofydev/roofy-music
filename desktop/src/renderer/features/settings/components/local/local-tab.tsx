import {
    Alert,
    Badge,
    Button,
    Checkbox,
    Code,
    Collapse,
    Divider,
    Group,
    PasswordInput,
    Progress,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { openLinkPhoneWizard } from '/@/renderer/features/devices/utils/open-link-phone-wizard';
import {
    getImportStatusBadgeKey,
    getImportStatusLabelKey,
    showImportError,
} from '/@/shared/product-ux';

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
    phoneLink: {
        error?: string;
        pairingUrl?: string;
        state: 'connected' | 'disabled' | 'starting' | 'unavailable';
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

const ServerLoginSection = ({ status }: { status: LocalStatus | null }) => {
    const { t } = useTranslation();

    return (
        <Stack gap="sm">
            <Text fw={600}>{t('productUx.personalLibrary.serverLoginTitle')}</Text>
            <Text c="dimmed" size="sm">
                {t('productUx.personalLibrary.serverLoginDescription')}
            </Text>
            {!status?.navidrome.running && (
                <Text c="dimmed" size="sm">
                    {t('productUx.personalLibrary.serverLoginStartHint')}
                </Text>
            )}
            <Group align="flex-start" gap="xl">
                <Stack gap={4}>
                    <Text size="sm">{t('productUx.personalLibrary.serverLoginUrl')}</Text>
                    <Text ff="monospace" size="sm">
                        {status?.navidrome.url || 'http://127.0.0.1:4533'}
                    </Text>
                </Stack>
                <Stack gap={4}>
                    <Text size="sm">{t('productUx.personalLibrary.serverLoginUsername')}</Text>
                    <Text ff="monospace" size="sm">
                        {status?.navidrome.username || 'admin'}
                    </Text>
                </Stack>
                <Stack gap={4}>
                    <Text size="sm">{t('productUx.personalLibrary.serverLoginPassword')}</Text>
                    <Text ff="monospace" size="sm">
                        {status?.navidrome.password || '…'}
                    </Text>
                </Stack>
            </Group>
            <Text c="dimmed" size="xs">
                {t('productUx.personalLibrary.serverLoginStorageHint')}
            </Text>
        </Stack>
    );
};

const friendlyEngineStatusMessage = (
    rawMessage: string | undefined,
    t: (key: string) => string,
): string => {
    const raw = rawMessage?.trim();
    if (!raw) {
        return t('productUx.personalLibrary.engineStatusChecking');
    }
    if (/navidrome|subsonic|spotdl|yt-dlp|ffprobe/i.test(raw)) {
        if (/not running|stopped|offline|failed/i.test(raw)) {
            return t('productUx.personalLibrary.engineStatusStopped');
        }
        return t('productUx.personalLibrary.engineStatusChecking');
    }
    return raw;
};

export const LocalTab = () => {
    const { t } = useTranslation();
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [advancedSetupOpen, setAdvancedSetupOpen] = useState(false);
    const [manualConnectionOpen, setManualConnectionOpen] = useState(false);
    const [status, setStatus] = useState<LocalStatus | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserIsAdmin, setNewUserIsAdmin] = useState(false);
    const [newUserName, setNewUserName] = useState('');
    const [newUserPassword, setNewUserPassword] = useState('');
    const [newUsername, setNewUsername] = useState('');
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
            showImportError(t, err);
            setError('');
        } finally {
            setBusy(false);
        }
    };

    const copyPhoneLink = async () => {
        const pairingUrl = status?.phoneLink?.pairingUrl;
        if (!pairingUrl) return;
        await navigator.clipboard.writeText(pairingUrl);
        setMessage(t('productUx.personalLibrary.copiedSetupLink'));
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

        setMessage(
            t('productUx.personalLibrary.createdLocalUser', { username: result.username }),
        );
        setNewUserEmail('');
        setNewUserIsAdmin(false);
        setNewUserName('');
        setNewUserPassword('');
        setNewUsername('');
    };

    const engineStatusMessage = useMemo(
        () => friendlyEngineStatusMessage(status?.navidrome.message, t),
        [status?.navidrome.message, t],
    );

    return (
        <Stack gap="xl" p="md">
            <Title order={3}>{t('productUx.personalLibrary.settingsTitle')}</Title>

            {error && (
                <Alert color="red" title={t('productUx.error.import.failed')}>
                    {error}
                </Alert>
            )}

            {message && (
                <Alert color="green" title={t('productUx.personalLibrary.alertDone')}>
                    {message}
                </Alert>
            )}

            <Stack gap="md">
                <Button
                    onClick={() => setAdvancedOpen((open) => !open)}
                    size="compact-sm"
                    variant="subtle"
                >
                    {t('productUx.personalLibrary.advancedTools')}
                </Button>
                <Collapse in={advancedOpen}>
                    <Group gap="xs">
                        {toolBadge(
                            Boolean(status?.tools.navidrome),
                            t('productUx.personalLibrary.engineTitle'),
                        )}
                        {toolBadge(
                            Boolean(status?.tools.spotdl),
                            t('productUx.personalLibrary.toolSpotifyImport'),
                        )}
                        {toolBadge(
                            Boolean(status?.tools.ffmpeg),
                            t('productUx.personalLibrary.audioTools'),
                        )}
                    </Group>
                </Collapse>

                <Checkbox
                    checked={Boolean(status?.metadata?.autoEnrich)}
                    disabled={busy}
                    label={t('productUx.action.updateSongInfo')}
                    onChange={(event) =>
                        run(() =>
                            window.api.localFirst.setAutoEnrichMetadata(event.currentTarget.checked),
                        )
                    }
                />
                <Text c="dimmed" size="sm">
                    Finds better title, artist, album, and cover art when you add music. Runs in the
                    background after import.
                </Text>
                <Group align="end" gap="md">
                    <Stack gap={4}>
                        <Text fw={600}>{t('productUx.personalLibrary.engineTitle')}</Text>
                        <Text c="dimmed" size="sm">
                            {engineStatusMessage}
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

            <Stack gap="sm">
                <Text fw={600}>{t('productUx.devices.linkPhone')}</Text>
                <Text c="dimmed" size="sm">
                    {t('productUx.personalLibrary.connectPhoneDescription')}
                </Text>
                <Button onClick={() => openLinkPhoneWizard()} variant="filled">
                    {t('productUx.devices.linkPhone')}
                </Button>
                <Button
                    onClick={() => setManualConnectionOpen((open) => !open)}
                    size="compact-sm"
                    variant="subtle"
                >
                    {t('productUx.devices.linkWizard.manualConnection')}
                </Button>
                <Collapse in={manualConnectionOpen}>
                    <Stack gap="sm" mt="sm">
                        <Badge variant="light">
                            {t(
                                `productUx.devices.phoneLinkState.${status?.phoneLink?.state || 'disabled'}`,
                                status?.phoneLink?.state || 'disabled',
                            )}
                        </Badge>
                        {status?.phoneLink?.error && (
                            <Text c="dimmed" size="sm">
                                {t('productUx.devices.phoneLinkFailed')}
                            </Text>
                        )}
                        <Group>
                            <Button
                                disabled={busy || status?.phoneLink?.state === 'starting'}
                                onClick={() => run(() => window.api.localFirst.startPhoneLink('auto'))}
                                variant="light"
                            >
                                {t('productUx.error.recovery.tryAgain')}
                            </Button>
                            <Button
                                disabled={busy || status?.phoneLink?.state === 'starting'}
                                onClick={() => run(() => window.api.localFirst.startPhoneLink('lan'))}
                                variant="subtle"
                            >
                                {t('productUx.devices.linkWizard.sameWifiOnly')}
                            </Button>
                            <Button
                                disabled={busy || status?.phoneLink?.state === 'disabled'}
                                onClick={() => run(() => window.api.localFirst.stopPhoneLink())}
                                variant="subtle"
                            >
                                Stop
                            </Button>
                        </Group>
                        <Button
                            disabled={!status?.phoneLink?.pairingUrl}
                            onClick={copyPhoneLink}
                            size="compact-sm"
                            variant="default"
                        >
                            {t('productUx.personalLibrary.copySetupLink')}
                        </Button>
                    </Stack>
                </Collapse>
            </Stack>

            <Divider />

            <Stack gap="md">
                <Stack gap={4}>
                    <Text fw={600}>{t('productUx.personalLibrary.importSourcesTitle')}</Text>
                    <Text c="dimmed" size="sm">
                        {t('productUx.personalLibrary.importSourcesDescription')}
                    </Text>
                </Stack>

                <Group gap="xs">
                    <Badge color={status?.tools.spotdl ? 'green' : 'yellow'} variant="light">
                        {status?.tools.spotdl
                            ? t('productUx.import.spotifyReady')
                            : t('productUx.import.spotifySetupRequired')}
                    </Badge>
                    <Badge color="green" variant="light">
                        {t('productUx.import.soundcloudReady')}
                    </Badge>
                </Group>
            </Stack>

            <Stack gap="sm">
                <Text fw={600}>{t('productUx.personalLibrary.libraryFolderTitle')}</Text>
                <Text c="dimmed" size="sm">
                    {status?.libraryPath || 'Loading'}
                </Text>
                <Group>
                    <Button
                        disabled={busy}
                        onClick={() => run(() => window.api.localFirst.selectLibrary())}
                        variant="light"
                    >
                        {t('productUx.personalLibrary.chooseFolder')}
                    </Button>
                    <Button
                        disabled={busy}
                        onClick={() => run(() => window.api.localFirst.openLibraryFolder())}
                        variant="subtle"
                    >
                        {t('productUx.personalLibrary.openFolder')}
                    </Button>
                </Group>
            </Stack>

            <Button
                onClick={() => setAdvancedSetupOpen((open) => !open)}
                size="compact-sm"
                variant="subtle"
            >
                {t('productUx.personalLibrary.advancedSetup')}
            </Button>
            <Collapse in={advancedSetupOpen}>
            <Stack gap="md">
                <ServerLoginSection status={status} />

                <Stack gap={4}>
                    <Text fw={600}>{t('productUx.personalLibrary.createUserTitle')}</Text>
                    <Text c="dimmed" size="sm">
                        {t('productUx.personalLibrary.createUserDescription')}
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
                <Text fw={600}>{t('productUx.action.updateSongInfo')}</Text>
                <Text c="dimmed" size="sm">
                    Edit song info on a file in your music folder.
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
                                setMessage(t('productUx.personalLibrary.tagsSaved'));
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
            </Collapse>

            <Stack gap="sm">
                <Text fw={600}>{t('productUx.import.pageTitle')}</Text>
                {status?.imports.length ? (
                    status.imports.map((job) => (
                        <Stack gap={4} key={job.id}>
                            <Group justify="space-between">
                                <Text size="sm">{job.input}</Text>
                                <Badge variant="light">
                                    {t(getImportStatusBadgeKey(job.status))}
                                </Badge>
                            </Group>
                            <Progress value={job.progress} />
                            <Text c={job.status === 'failed' ? 'red' : 'dimmed'} size="xs">
                                {job.status === 'failed'
                                    ? t(getImportStatusLabelKey(job.status))
                                    : job.message || t(getImportStatusLabelKey(job.status))}
                            </Text>
                        </Stack>
                    ))
                ) : (
                    <Text c="dimmed" size="sm">
                        {t('productUx.import.empty.title')}
                    </Text>
                )}
            </Stack>
        </Stack>
    );
};
