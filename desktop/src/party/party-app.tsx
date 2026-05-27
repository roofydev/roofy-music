import {
    FormEvent,
    ReactNode,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type WheelEvent,
} from 'react';
import {
    RiArrowRightSLine,
    RiBarChartBoxLine,
    RiChat3Line,
    RiCloseLine,
    RiDragMove2Line,
    RiEmotionLine,
    RiInformationLine,
    RiListUnordered,
    RiLockFill,
    RiMicLine,
    RiMore2Line,
    RiMusic2Line,
    RiPauseFill,
    RiPlayFill,
    RiQuestionLine,
    RiRefreshLine,
    RiRepeatLine,
    RiSearchLine,
    RiSendPlaneFill,
    RiSettings3Line,
    RiShuffleLine,
    RiSkipBackFill,
    RiSkipForwardFill,
    RiThumbUpLine,
    RiUserLine,
    RiVolumeDownLine,
    RiVolumeMuteLine,
    RiVolumeUpLine,
} from 'react-icons/ri';

import { PartyArtworkVisualizer } from '/@/party/components/party-artwork-visualizer';
import { usePartyAudioOutput } from '/@/party/hooks/use-party-audio-output';
import { usePartyVoiceReceiver } from '/@/party/hooks/use-party-voice-receiver';
import { configurePartyAudioElement, isSafariBrowser } from '/@/party/utils/party-audio';
import { COMMON_PARTY_EMOJIS } from '/@/shared/party-utils';

import {
    PartyChatMessage,
    PartyClientMessage,
    PartyRoomState,
    PartyServerMessage,
    PartyTrack,
} from '/@/shared/types/party-types';
import { PlayerStatus } from '/@/shared/types/types';

const SYNC_DELAY_TUNNEL_MS = 3500;
const SYNC_DELAY_LAN_MS = 1500;
const DRIFT_SMALL_SECONDS = 0.5;
const DRIFT_MEDIUM_SECONDS = 2;
const DRIFT_CORRECTION_INTERVAL_MS = 1500;
const SEEK_DEBOUNCE_MS = 1000;
const MIN_SEEK_INTERVAL_MS = 3000;
const PROGRESS_TICK_MS = 500;
const BUFFER_WAIT_FALLBACK_MS = 8000;
const AUDIO_LOAD_TIMEOUT_MS = 15000;

type PartyTab = 'chat' | 'side' | 'upNext';
type SideTab = 'guests' | 'requests';

interface StoredPartySession {
    displayName: string;
    sessionToken: string;
}

interface StoredDjMicPrefs {
    duckMusic: boolean;
    receiveVolume: number;
}

const DJ_MIC_PREFS_KEY = 'roofy-party-dj-mic-prefs';

const loadDjMicPrefs = (): StoredDjMicPrefs => {
    try {
        const raw = localStorage.getItem(DJ_MIC_PREFS_KEY);
        if (!raw) {
            return { duckMusic: true, receiveVolume: 100 };
        }
        const parsed = JSON.parse(raw) as Partial<StoredDjMicPrefs>;
        return {
            duckMusic: parsed.duckMusic ?? true,
            receiveVolume:
                typeof parsed.receiveVolume === 'number'
                    ? Math.min(150, Math.max(0, parsed.receiveVolume))
                    : 100,
        };
    } catch {
        return { duckMusic: true, receiveVolume: 100 };
    }
};

const saveDjMicPrefs = (prefs: StoredDjMicPrefs) => {
    localStorage.setItem(DJ_MIC_PREFS_KEY, JSON.stringify(prefs));
};

const sessionStorageKey = (roomCode: string) => `roofy-party-session:${roomCode.toUpperCase()}`;

const loadStoredSession = (roomCode: string): StoredPartySession | null => {
    try {
        const raw = localStorage.getItem(sessionStorageKey(roomCode));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as StoredPartySession;
        if (!parsed.sessionToken || !parsed.displayName) return null;
        return parsed;
    } catch {
        return null;
    }
};

const saveStoredSession = (roomCode: string, session: StoredPartySession) => {
    localStorage.setItem(sessionStorageKey(roomCode), JSON.stringify(session));
};

const clearStoredSession = (roomCode: string) => {
    localStorage.removeItem(sessionStorageKey(roomCode));
};

const roomCodeFromPath = () => {
    const match = window.location.pathname.match(/\/party\/([^/]+)/);
    return match?.[1] || '';
};

const connectUrl = () => {
    const url = new URL(window.location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return url.href;
};

const isLanConnection = () => {
    const hostname = window.location.hostname;
    return (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        /^192\.168\./.test(hostname) ||
        /^10\./.test(hostname) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    );
};

const formatTime = (milliseconds?: number) => {
    if (!milliseconds || milliseconds < 0 || !Number.isFinite(milliseconds)) return '0:00';
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const formatChatTime = (sentAt: number) =>
    new Date(sentAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const avatarColorFromId = (id: string) => {
    let hash = 0;
    for (let index = 0; index < id.length; index += 1) {
        hash = id.charCodeAt(index) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue} 30% 35%)`;
};

const getAdjustedPositionMs = (roomState: PartyRoomState | null, now: number, syncDelayMs: number) => {
    if (!roomState) return 0;

    if (roomState.playbackStatus !== PlayerStatus.PLAYING) {
        return roomState.positionMs;
    }

    return Math.max(0, roomState.positionMs + Math.max(0, now - roomState.serverTimeMs) - syncDelayMs);
};

const sourceBadge = (track: PartyTrack | null | undefined) => {
    if (!track) return '—';
    return track.source === 'host' ? 'LOCAL' : 'YTM';
};

const QueueThumb = ({ artworkUrl }: { artworkUrl?: null | string }) => {
    const [failed, setFailed] = useState(false);

    if (!artworkUrl || failed) {
        return <span className="queue-thumb queue-thumb-empty" />;
    }

    return (
        <img
            alt=""
            className="queue-thumb"
            loading="lazy"
            onError={() => setFailed(true)}
            src={artworkUrl}
        />
    );
};

const PartyVolumeControl = ({
    className,
    muted,
    onMutedChange,
    onVolumeChange,
    showLevel = false,
    volume,
}: {
    className?: string;
    muted: boolean;
    onMutedChange: (muted: boolean) => void;
    onVolumeChange: (volume: number) => void;
    showLevel?: boolean;
    volume: number;
}) => {
    const volumeBeforeMuteRef = useRef(80);

    const VolumeIcon =
        muted || volume === 0
            ? RiVolumeMuteLine
            : volume < 50
              ? RiVolumeDownLine
              : RiVolumeUpLine;

    const handleMuteClick = () => {
        if (muted) {
            onMutedChange(false);
            onVolumeChange(volumeBeforeMuteRef.current > 0 ? volumeBeforeMuteRef.current : 80);
            return;
        }

        volumeBeforeMuteRef.current = volume > 0 ? volume : 80;
        onMutedChange(true);
    };

    const handleVolumeChange = (next: number) => {
        if (muted && next > 0) onMutedChange(false);
        onVolumeChange(next);
    };

    const handleWheel = (event: WheelEvent) => {
        event.preventDefault();
        if (muted) onMutedChange(false);

        const step = event.deltaY < 0 || event.deltaX < 0 ? 5 : -5;
        handleVolumeChange(Math.min(100, Math.max(0, volume + step)));
    };

    return (
        <div
            className={`volume-control${className ? ` ${className}` : ''}`}
            onWheel={handleWheel}
        >
            <button
                aria-label={muted ? 'Unmute' : 'Mute'}
                aria-pressed={muted}
                className="icon-btn volume-control-btn"
                onClick={handleMuteClick}
                type="button"
            >
                <VolumeIcon />
            </button>
            <div className="volume-track">
                <span
                    aria-hidden
                    className={`volume-fill${muted ? ' volume-fill-muted' : ''}`}
                    style={{ width: `${volume}%` }}
                >
                    <span className="volume-thumb" />
                </span>
                <input
                    aria-label="Volume"
                    aria-valuemax={100}
                    aria-valuemin={0}
                    aria-valuenow={volume}
                    className="volume-slider-input"
                    max={100}
                    min={0}
                    onChange={(event) => handleVolumeChange(Number(event.currentTarget.value))}
                    onInput={(event) =>
                        handleVolumeChange(Number(event.currentTarget.value))
                    }
                    type="range"
                    value={volume}
                />
            </div>
            {showLevel && (
                <span aria-hidden className="volume-level">
                    {volume}%
                </span>
            )}
        </div>
    );
};

const ArtworkImage = ({ artworkUrl }: { artworkUrl?: null | string }) => {
    const [failed, setFailed] = useState(false);

    if (!artworkUrl || failed) {
        return <div aria-hidden className="artwork-img artwork-empty" />;
    }

    return (
        <img
            alt=""
            className="artwork-img"
            onError={() => setFailed(true)}
            src={artworkUrl}
        />
    );
};

const PartyChatEmojiPicker = ({ onSelect }: { onSelect: (emoji: string) => void }) => {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;

        const handlePointerDown = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        };

        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [open]);

    const handleSelect = (emoji: string) => {
        onSelect(emoji);
        setOpen(false);
    };

    return (
        <div className="chat-emoji-picker" ref={rootRef}>
            <button
                aria-expanded={open}
                aria-haspopup="listbox"
                aria-label="Emoji"
                className={`icon-btn chat-emoji-btn${open ? ' chat-emoji-btn-active' : ''}`}
                onClick={() => setOpen((value) => !value)}
                type="button"
            >
                <RiEmotionLine />
            </button>
            {open && (
                <div aria-label="Emoji picker" className="chat-emoji-menu" role="listbox">
                    {COMMON_PARTY_EMOJIS.map((emoji) => (
                        <button
                            key={emoji}
                            aria-label={emoji}
                            className="chat-emoji-option"
                            onClick={() => handleSelect(emoji)}
                            type="button"
                        >
                            {emoji}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export const PartyApp = () => {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const socketRef = useRef<WebSocket | null>(null);
    const audioUnlockedRef = useRef(false);
    const lastAppliedStatusRef = useRef<PlayerStatus | null>(null);
    const loadedTrackIdRef = useRef<string | null>(null);
    const trackReadyRef = useRef(false);
    const lastSeekAtRef = useRef(0);
    const seekDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const rateResetRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const chatEndRef = useRef<HTMLDivElement | null>(null);

    const [displayName, setDisplayName] = useState('');
    const [joined, setJoined] = useState(false);
    const [waiting, setWaiting] = useState(false);
    const [restoring, setRestoring] = useState(() => Boolean(loadStoredSession(roomCodeFromPath())));
    const [state, setState] = useState<PartyRoomState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [requestSearch, setRequestSearch] = useState('');
    const [searchResults, setSearchResults] = useState<PartyTrack[]>([]);
    const [volume, setVolume] = useState(80);
    const [muted, setMuted] = useState(false);
    const [djMicPrefs, setDjMicPrefs] = useState(loadDjMicPrefs);
    const [activeTab, setActiveTab] = useState<PartyTab>('upNext');
    const [sideTab, setSideTab] = useState<SideTab>('requests');
    const [helpOpen, setHelpOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
    const [bufferPercent, setBufferPercent] = useState(0);
    const [isLocalPlaying, setIsLocalPlaying] = useState(false);
    const [now, setNow] = useState(Date.now());
    const [chatMessages, setChatMessages] = useState<PartyChatMessage[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [waitingForBuffer, setWaitingForBuffer] = useState(false);
    const [audioReloadKey, setAudioReloadKey] = useState(0);
    const [audioNeedsUnlock, setAudioNeedsUnlock] = useState(false);
    const [audioLoadIssue, setAudioLoadIssue] = useState<string | null>(null);
    const [dragTrackId, setDragTrackId] = useState<string | null>(null);
    const [djSpeaking, setDjSpeaking] = useState(false);
    const [seekPreviewPercent, setSeekPreviewPercent] = useState<null | number>(null);

    const code = useMemo(roomCodeFromPath, []);

    useEffect(() => {
        const stored = loadStoredSession(code);
        if (stored?.displayName) setDisplayName(stored.displayName);
    }, [code]);
    const syncDelayMs = useMemo(
        () => (isLanConnection() ? SYNC_DELAY_LAN_MS : SYNC_DELAY_TUNNEL_MS),
        [],
    );

    const sendRaw = useCallback((message: Record<string, unknown>) => {
        const socket = socketRef.current;
        if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    }, []);

    const send = useCallback((message: PartyClientMessage) => {
        sendRaw(message);
    }, [sendRaw]);

    const outputVolume = useMemo(() => {
        const baseVolume = muted ? 0 : volume / 100;
        return djMicPrefs.duckMusic && djSpeaking ? baseVolume * 0.7 : baseVolume;
    }, [volume, muted, djSpeaking, djMicPrefs.duckMusic]);

    const { analyserRef, audioGraphReady, contextRef } = usePartyAudioOutput(
        audioRef,
        outputVolume,
    );

    usePartyVoiceReceiver({
        duckMusic: djMicPrefs.duckMusic,
        hostMicActive: Boolean(state?.hostMicActive),
        onSpeakingChange: setDjSpeaking,
        receiveVolume: djMicPrefs.receiveVolume,
        send: sendRaw,
        socketRef,
    });

    useEffect(() => {
        const theme = state?.settings.roomTheme || 'dark';
        document.documentElement.dataset.partyTheme = theme;
    }, [state?.settings.roomTheme]);

    const applyRoomState = useCallback((roomState: PartyRoomState) => {
        setState(roomState);
        if (roomState.chat?.length) {
            setChatMessages(roomState.chat);
        }
    }, []);

    useEffect(() => {
        const socket = new WebSocket(connectUrl());
        socketRef.current = socket;

        const attemptStoredJoin = () => {
            const stored = loadStoredSession(code);
            if (!stored) {
                setRestoring(false);
                return;
            }

            setWaiting(true);
            setRestoring(true);
            socket.send(
                JSON.stringify({
                    displayName: stored.displayName,
                    sessionToken: stored.sessionToken,
                    type: 'join',
                } satisfies PartyClientMessage),
            );
        };

        socket.addEventListener('open', attemptStoredJoin);

        socket.addEventListener('message', (event) => {
            const message = JSON.parse(event.data) as PartyServerMessage;
            switch (message.type) {
                case 'join_pending':
                    setRestoring(false);
                    setWaiting(true);
                    setError(null);
                    saveStoredSession(code, {
                        displayName:
                            loadStoredSession(code)?.displayName || displayName.trim() || 'Guest',
                        sessionToken: message.sessionToken,
                    });
                    break;
                case 'join_approved':
                    setRestoring(false);
                    setWaiting(false);
                    setJoined(true);
                    applyRoomState(message.state);
                    saveStoredSession(code, {
                        displayName:
                            message.state.guests.find(
                                (guest) => guest.id === message.state.currentGuestId,
                            )?.displayName ||
                            loadStoredSession(code)?.displayName ||
                            displayName.trim() ||
                            'Guest',
                        sessionToken: message.sessionToken,
                    });
                    send({ type: 'sync_request' });
                    break;
                case 'join_rejected':
                    setRestoring(false);
                    setWaiting(false);
                    setJoined(false);
                    clearStoredSession(code);
                    setError(message.reason);
                    break;
                case 'room_state':
                case 'sync':
                    applyRoomState(message.state);
                    break;
                case 'guest_kicked':
                    setRestoring(false);
                    setJoined(false);
                    setState(null);
                    clearStoredSession(code);
                    if (message.reason !== 'Guest left the room') {
                        setError(message.reason);
                    } else {
                        setError(null);
                    }
                    break;
                case 'room_ended':
                    setRestoring(false);
                    setJoined(false);
                    setState(null);
                    clearStoredSession(code);
                    setError('Party ended');
                    break;
                case 'error':
                    setError(message.message);
                    break;
                case 'ping':
                    send({ type: 'pong' });
                    break;
                case 'search_results':
                    setSearchResults(message.results);
                    break;
                case 'chat_message':
                    setChatMessages((current) => [...current, message.message].slice(-100));
                    break;
                case 'chat_history':
                    setChatMessages(message.messages);
                    break;
                case 'buffer_complete':
                    setWaitingForBuffer(false);
                    setAudioLoadIssue(null);
                    lastAppliedStatusRef.current = null;
                    send({ type: 'sync_request' });
                    break;
                case 'voice_offer':
                case 'voice_answer':
                case 'voice_ice':
                    break;
                default:
                    break;
            }
        });

        socket.addEventListener('close', (event) => {
            if (event.code === 4001) return;
            setRestoring(false);
            setError('Connection closed');
        });

        return () => {
            socket.close(4001);
        };
    }, [applyRoomState, code, send]);

    useEffect(() => {
        const interval = window.setInterval(() => setNow(Date.now()), PROGRESS_TICK_MS);
        return () => window.clearInterval(interval);
    }, []);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages.length, activeTab]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!joined || !audio) return;

        const updateAudioState = () => {
            setIsLocalPlaying(!audio.paused);
            const duration = audio.duration;
            if (!duration || !Number.isFinite(duration) || audio.buffered.length === 0) {
                setBufferPercent(0);
                return;
            }

            const bufferedEnd = audio.buffered.end(audio.buffered.length - 1);
            setBufferPercent(Math.min(100, Math.max(0, (bufferedEnd / duration) * 100)));
        };

        audio.addEventListener('pause', updateAudioState);
        audio.addEventListener('play', updateAudioState);
        audio.addEventListener('progress', updateAudioState);
        audio.addEventListener('timeupdate', updateAudioState);

        return () => {
            audio.removeEventListener('pause', updateAudioState);
            audio.removeEventListener('play', updateAudioState);
            audio.removeEventListener('progress', updateAudioState);
            audio.removeEventListener('timeupdate', updateAudioState);
        };
    }, [joined]);

    const primeAudio = useCallback(async () => {
        const audio = audioRef.current;
        if (!audio) {
            audioUnlockedRef.current = true;
            return;
        }

        try {
            await audio.play();
            audio.pause();
            audioUnlockedRef.current = true;
            setAudioNeedsUnlock(false);
        } catch {
            audioUnlockedRef.current = true;
        }
    }, []);

    const tryPlay = useCallback(async () => {
        const audio = audioRef.current;
        if (!audio) return;

        try {
            await audio.play();
            audioUnlockedRef.current = true;
            setAudioNeedsUnlock(false);
        } catch {
            setAudioNeedsUnlock(true);

            const unlockOnInteraction = async () => {
                audioUnlockedRef.current = true;
                try {
                    await audio.play();
                    setAudioNeedsUnlock(false);
                } catch {
                    // Browser blocked autoplay; will retry on next interaction.
                }
            };

            document.addEventListener('click', unlockOnInteraction, { once: true });
            document.addEventListener('keydown', unlockOnInteraction, { once: true });
        }
    }, []);

    const clearBufferWait = useCallback(() => {
        setWaitingForBuffer(false);
        setAudioLoadIssue(null);
        lastAppliedStatusRef.current = null;
    }, []);

    const resyncAudio = useCallback(() => {
        const audio = audioRef.current;
        loadedTrackIdRef.current = null;
        trackReadyRef.current = false;
        clearBufferWait();
        setAudioNeedsUnlock(false);
        if (audio) {
            audio.pause();
            audio.removeAttribute('src');
            audio.load();
        }
        setAudioReloadKey((key) => key + 1);
        send({ type: 'sync_request' });
        void primeAudio();
    }, [clearBufferWait, primeAudio, send]);

    // Source loading — only when track changes
    useEffect(() => {
        const audio = audioRef.current;
        const track = state?.nowPlaying;
        if (!audio || !joined) return;

        if (!track?.streamUrl) {
            trackReadyRef.current = false;
            clearBufferWait();
            if (track) {
                setAudioLoadIssue('Waiting for the DJ stream…');
            } else {
                setAudioLoadIssue(null);
            }
            return;
        }

        setAudioLoadIssue(null);

        if (loadedTrackIdRef.current === track.id) return;

        const previousTrackId = loadedTrackIdRef.current;
        const isTrackChange = previousTrackId !== null && previousTrackId !== track.id;

        loadedTrackIdRef.current = track.id;
        trackReadyRef.current = false;
        setWaitingForBuffer(isTrackChange);
        lastAppliedStatusRef.current = null;

        const absoluteUrl = new URL(track.streamUrl, window.location.origin).href;
        configurePartyAudioElement(audio);
        if (audio.src !== absoluteUrl) {
            audio.src = absoluteUrl;
            audio.load();
        }

        const onCanPlay = () => {
            trackReadyRef.current = true;
            setAudioLoadIssue(null);
            send({ trackId: track.id, type: 'ready' });

            const expectedSeconds =
                getAdjustedPositionMs(state, Date.now(), syncDelayMs) / 1000;
            if (Number.isFinite(expectedSeconds)) {
                audio.currentTime = Math.max(0, expectedSeconds);
            }

            if (!isTrackChange) {
                clearBufferWait();
                send({ type: 'sync_request' });
                if (state?.playbackStatus === PlayerStatus.PLAYING) {
                    void tryPlay();
                }
            }
        };

        const onError = () => {
            trackReadyRef.current = false;
            clearBufferWait();
            setAudioLoadIssue('Could not load audio. Tap Sync audio to retry.');
        };

        const loadTimeout = window.setTimeout(() => {
            if (trackReadyRef.current) return;
            clearBufferWait();
            setAudioLoadIssue('Audio is taking too long. Tap Sync audio to retry.');
        }, AUDIO_LOAD_TIMEOUT_MS);

        const bufferWaitFallback = isTrackChange
            ? window.setTimeout(() => {
                  if (!trackReadyRef.current) return;
                  clearBufferWait();
                  send({ type: 'sync_request' });
                  if (state?.playbackStatus === PlayerStatus.PLAYING) {
                      void tryPlay();
                  }
              }, BUFFER_WAIT_FALLBACK_MS)
            : undefined;

        audio.addEventListener('canplay', onCanPlay, { once: true });
        audio.addEventListener('error', onError);

        return () => {
            window.clearTimeout(loadTimeout);
            if (bufferWaitFallback) window.clearTimeout(bufferWaitFallback);
            audio.removeEventListener('canplay', onCanPlay);
            audio.removeEventListener('error', onError);
        };
    }, [
        audioReloadKey,
        clearBufferWait,
        joined,
        send,
        state?.nowPlaying?.id,
        state?.nowPlaying?.streamUrl,
        state?.playbackStatus,
        syncDelayMs,
        tryPlay,
    ]);

    // Transport sync — only when playback status changes
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || !joined || !state || !trackReadyRef.current) return;
        if (waitingForBuffer) return;

        const status = state.playbackStatus;
        if (lastAppliedStatusRef.current === status) return;
        lastAppliedStatusRef.current = status;

        if (status === PlayerStatus.PLAYING) {
            void tryPlay();
        } else {
            audio.pause();
            audio.playbackRate = 1;
            setAudioNeedsUnlock(false);
        }
    }, [joined, state?.playbackStatus, tryPlay, waitingForBuffer]);

    useEffect(() => {
        if (!joined || !state || waitingForBuffer || !trackReadyRef.current) return;
        if (state.playbackStatus !== PlayerStatus.PLAYING) return;

        const interval = window.setInterval(() => {
            const audio = audioRef.current;
            if (!audio) return;
            if (!audio.paused) {
                setAudioNeedsUnlock(false);
                return;
            }
            setAudioNeedsUnlock(true);
        }, 3000);

        return () => window.clearInterval(interval);
    }, [joined, state?.playbackStatus, waitingForBuffer]);

    // Drift correction interval
    useEffect(() => {
        if (!joined || !state || state.playbackStatus !== PlayerStatus.PLAYING) return;

        const interval = window.setInterval(() => {
            const audio = audioRef.current;
            if (!audio || !trackReadyRef.current || waitingForBuffer) return;

            const expectedSeconds =
                getAdjustedPositionMs(state, Date.now(), syncDelayMs) / 1000;
            if (!Number.isFinite(expectedSeconds)) return;

            const drift = expectedSeconds - audio.currentTime;
            const absDrift = Math.abs(drift);

            if (absDrift <= DRIFT_SMALL_SECONDS) {
                if (audio.playbackRate !== 1) audio.playbackRate = 1;
                return;
            }

            if (absDrift > DRIFT_MEDIUM_SECONDS) {
                const nowMs = Date.now();
                if (nowMs - lastSeekAtRef.current < MIN_SEEK_INTERVAL_MS) return;

                if (seekDebounceRef.current) clearTimeout(seekDebounceRef.current);
                seekDebounceRef.current = setTimeout(() => {
                    if (!audioRef.current) return;
                    audioRef.current.currentTime = Math.max(0, expectedSeconds);
                    audioRef.current.playbackRate = 1;
                    lastSeekAtRef.current = Date.now();
                }, SEEK_DEBOUNCE_MS);

                send({ type: 'sync_request' });
                return;
            }

            // Safari routes audio through Web Audio; playbackRate nudges change pitch audibly.
            if (isSafariBrowser()) {
                const nowMs = Date.now();
                if (nowMs - lastSeekAtRef.current < MIN_SEEK_INTERVAL_MS) return;

                audio.currentTime = Math.max(0, expectedSeconds);
                audio.playbackRate = 1;
                lastSeekAtRef.current = nowMs;
                return;
            }

            audio.playbackRate = drift > 0 ? 1.02 : 0.98;
            if (rateResetRef.current) clearTimeout(rateResetRef.current);
            rateResetRef.current = setTimeout(() => {
                if (audioRef.current) audioRef.current.playbackRate = 1;
            }, 3000);
        }, DRIFT_CORRECTION_INTERVAL_MS);

        return () => {
            window.clearInterval(interval);
            if (seekDebounceRef.current) clearTimeout(seekDebounceRef.current);
            if (rateResetRef.current) clearTimeout(rateResetRef.current);
        };
    }, [joined, send, state, syncDelayMs, waitingForBuffer]);

    const handleJoin = (event: FormEvent) => {
        event.preventDefault();
        const name = displayName.trim();
        if (!name) return;
        clearStoredSession(code);
        setWaiting(true);
        void primeAudio();
        send({ displayName: name, type: 'join' });
    };

    const handleSuggest = (event: FormEvent) => {
        event.preventDefault();
        if (state?.settings.queueLocked) {
            setError('Queue is locked by the DJ');
            return;
        }
        if (!requestSearch.trim()) return;
        send({ query: requestSearch.trim(), type: 'suggest' });
        setRequestSearch('');
        setSearchResults([]);
        setActiveTab('side');
        setSideTab('requests');
    };

    const handleVoteTrack = (trackId: string) => {
        if (state?.settings.queueLocked) {
            setError('Queue is locked by the DJ');
            return;
        }
        send({ trackId, type: 'vote_track' });
    };

    const handleLeaveRoom = () => {
        send({ type: 'leave' });
        clearStoredSession(code);
        setSettingsOpen(false);
        setHelpOpen(false);
        setJoined(false);
        setState(null);
        setSearchResults([]);
        setError(null);
    };

    const copyRoomLink = async () => {
        const url = state?.publicUrl || state?.joinUrl || window.location.href;

        try {
            await navigator.clipboard.writeText(url);
            setCopyFeedback('Link copied');
        } catch {
            setCopyFeedback('Could not copy link');
        }

        window.setTimeout(() => setCopyFeedback(null), 2000);
    };

    const currentGuestName =
        state?.guests.find((guest) => guest.id === state.currentGuestId)?.displayName ||
        displayName.trim() ||
        'Guest';

    useEffect(() => {
        if (!helpOpen && !settingsOpen) return;

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setHelpOpen(false);
                setSettingsOpen(false);
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [helpOpen, settingsOpen]);

    const handleChatSend = (event: FormEvent) => {
        event.preventDefault();
        if (!chatInput.trim()) return;
        send({ body: chatInput.trim(), type: 'chat_send' });
        setChatInput('');
    };

    useEffect(() => {
        const query = requestSearch.trim();
        if (!joined || query.length < 3) {
            setSearchResults([]);
            return;
        }

        const timeout = window.setTimeout(() => {
            send({ query, type: 'search' });
        }, 450);

        return () => window.clearTimeout(timeout);
    }, [joined, requestSearch, send]);

    const track = state?.nowPlaying;
    const approvedGuests = state?.guests.filter((guest) => guest.status === 'approved') || [];
    const pendingGuests = state?.guests.filter((guest) => guest.status === 'pending') || [];
    const requestQueue = state?.requestQueue.slice(0, 20) || [];
    const queuedTracks = state?.queue.slice(0, 20) || [];
    const positionMs = getAdjustedPositionMs(state, now, syncDelayMs);
    const durationMs = track?.durationMs || 0;
    const progressPercent = durationMs ? Math.min(100, Math.max(0, (positionMs / durationMs) * 100)) : 0;
    const pendingRequests = requestQueue.filter((item) => item.status === 'pending').length;
    const canControlPlayer = Boolean(state?.currentGuestCanControlPlayer);
    const canReorderQueue = Boolean(state?.currentGuestCanReorderQueue && !state.settings.queueLocked);
    const queueLocked = Boolean(state?.settings.queueLocked);
    const roomCode = (code || state?.code || 'JOIN').toUpperCase();
    const showingSearch = requestSearch.trim().length >= 3;

    const handleTransportClick = () => {
        if (!canControlPlayer) return;
        send({ action: 'toggle_play', type: 'control' });
    };

    const handleSeekCommit = (percent: number) => {
        if (!canControlPlayer || !durationMs) return;
        const nextMs = Math.round((percent / 100) * durationMs);
        send({ action: 'seek', positionMs: nextMs, type: 'control' });
        if (audioRef.current) {
            audioRef.current.currentTime = nextMs / 1000;
        }
        setSeekPreviewPercent(null);
    };

    const displayProgressPercent = seekPreviewPercent ?? progressPercent;

    const renderQueueRow = (item: PartyTrack, index: number) => (
        <li
            className={`queue-row${canReorderQueue ? ' queue-row-draggable' : ''}`}
            draggable={canReorderQueue}
            key={item.id}
            onDragEnd={() => setDragTrackId(null)}
            onDragOver={(event) => {
                if (canReorderQueue) event.preventDefault();
            }}
            onDragStart={() => setDragTrackId(item.id)}
            onDrop={() => handleQueueDrop(item.id)}
        >
            <div className="queue-row-left">
                {canReorderQueue && (
                    <span aria-hidden className="queue-drag">
                        <RiDragMove2Line />
                    </span>
                )}
                <span className={`queue-index${index === 0 ? ' queue-index-playing' : ''}`}>
                    {index === 0 ? '▶' : index + 1}
                </span>
                <QueueThumb artworkUrl={item.artworkUrl} />
            </div>
            <div className="queue-row-content">
                <span className={index === 0 ? 'queue-title queue-title-next' : 'queue-title'}>
                    {item.title}
                </span>
                <span className="queue-artist">{item.artist}</span>
            </div>
            <div className="queue-row-right">
                <time className="queue-duration">{formatTime(item.durationMs)}</time>
                <button
                    aria-label="Vote for track"
                    className="icon-btn queue-vote"
                    disabled={queueLocked}
                    onClick={() => handleVoteTrack(item.id)}
                    type="button"
                >
                    <RiThumbUpLine />
                    {(item.votes || 0) > 0 && <span className="vote-count">{item.votes}</span>}
                </button>
                <button aria-label="More options" className="icon-btn" disabled type="button">
                    <RiMore2Line />
                </button>
            </div>
        </li>
    );

    const renderRequestRow = (item: (typeof requestQueue)[number], index: number) => (
        <li className="queue-row" key={item.id}>
            <div className="queue-row-left">
                <span className="queue-index">{index + 1}</span>
                <QueueThumb artworkUrl={item.track?.artworkUrl} />
            </div>
            <div className="queue-row-content">
                <span className="queue-title">{item.track?.title || item.query}</span>
                <span className="queue-artist">
                    {item.error || `By ${item.guestDisplayName}`}
                </span>
            </div>
            <div className="queue-row-right">
                <span className="queue-duration queue-status">{item.status}</span>
            </div>
        </li>
    );

    const renderGuestRow = (guest: (typeof approvedGuests)[number]) => (
        <li className="guest-row" key={guest.id}>
            <span className="guest-avatar" style={{ background: guest.avatarColor }}>
                {guest.displayName.slice(0, 1).toUpperCase()}
            </span>
            <div className="guest-meta">
                <span className="guest-name">{guest.displayName}</span>
                <span className="guest-status">
                    {guest.role === 'codj' ? 'Co-DJ' : guest.status}
                </span>
            </div>
        </li>
    );

    const suggestTrack = (result: PartyTrack) => {
        send({ query: result.videoId || result.title, type: 'suggest' });
        setRequestSearch('');
        setSearchResults([]);
        setActiveTab('side');
        setSideTab('requests');
    };

    const handleQueueDrop = (targetTrackId: string) => {
        if (!dragTrackId || dragTrackId === targetTrackId || !canReorderQueue) return;
        const toIndex = queuedTracks.findIndex((item) => item.id === targetTrackId);
        if (toIndex < 0) return;
        send({ toIndex, trackId: dragTrackId, type: 'reorder_queue' });
        setDragTrackId(null);
    };

    const renderSearchResultRow = (result: PartyTrack, compact = false) => (
        <li className="search-result-row" key={result.id}>
            <QueueThumb artworkUrl={result.artworkUrl} />
            <div className="queue-row-content">
                <span className="queue-title">{result.title}</span>
                <span className="queue-artist">{result.artist}</span>
            </div>
            <div className="queue-row-right">
                {!compact && (
                    <time className="queue-duration">{formatTime(result.durationMs)}</time>
                )}
                <button
                    className="request-btn"
                    disabled={queueLocked}
                    onClick={() => suggestTrack(result)}
                    type="button"
                >
                    + Request
                </button>
            </div>
        </li>
    );

    const renderChatMessages = () =>
        chatMessages.length ? (
            chatMessages.map((message) => (
                <li
                    className={`chat-row${message.role === 'host' ? ' chat-row-host' : ''}`}
                    key={message.id}
                >
                    <span
                        className="chat-avatar"
                        style={{ background: avatarColorFromId(message.senderId) }}
                    >
                        {message.senderName.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="chat-content">
                        <span className="chat-sender">
                            {message.senderName}
                            {message.role === 'host' && <span className="chat-host-badge">HOST</span>}
                        </span>
                        <p className="chat-body">{message.body}</p>
                    </div>
                    <time className="chat-time">{formatChatTime(message.sentAt)}</time>
                </li>
            ))
        ) : (
            <li className="empty-row">Say hello to the room.</li>
        );

    const renderChatCompose = () => (
        <form className="chat-compose" onSubmit={handleChatSend}>
            <input
                className="chat-compose-input"
                maxLength={400}
                onChange={(event) => setChatInput(event.currentTarget.value)}
                placeholder="Say something..."
                value={chatInput}
            />
            <PartyChatEmojiPicker
                onSelect={(emoji) => setChatInput((current) => `${current}${emoji}`)}
            />
            <button
                aria-label="Send message"
                className="chat-compose-btn"
                disabled={!chatInput.trim()}
                type="submit"
            >
                <RiSendPlaneFill />
            </button>
        </form>
    );

    const renderUpNextPanel = (className = '') => (
        <div className={`party-column party-column-up-next${className}`}>
            <div className="party-column-header">
                <span className="party-column-title">
                    <RiListUnordered aria-hidden /> Up next
                </span>
                <span className="party-column-header-meta">
                    {queuedTracks.length} tracks
                    <RiListUnordered aria-hidden />
                </span>
            </div>
            <div className="party-column-body party-scroll">
                <ul className="queue-list">
                    {queuedTracks.length ? (
                        queuedTracks.map(renderQueueRow)
                    ) : (
                        <li className="empty-row">No upcoming tracks from the DJ yet.</li>
                    )}
                </ul>
            </div>
            <div className="party-column-footer">
                <span>{canReorderQueue ? 'Drag to reorder' : 'Queue controlled by DJ'}</span>
                <label className="toggle-switch">
                    <input checked disabled readOnly type="checkbox" />
                    <span className="toggle-slider" />
                    <span className="toggle-label">Auto-advance</span>
                </label>
            </div>
        </div>
    );

    const renderChatPanel = (className = '') => (
        <div className={`party-column party-column-chat${className}`}>
            <div className="party-column-header">
                <span>
                    <RiChat3Line aria-hidden /> Live chat
                </span>
                <span className="party-column-header-meta">{approvedGuests.length} online</span>
            </div>
            <div className="chat-panel">
                <ul className="chat-list">
                    {renderChatMessages()}
                    <div ref={chatEndRef} />
                </ul>
                {renderChatCompose()}
            </div>
        </div>
    );

    const renderRequestSearch = () => (
        <div className="requests-search-stack">
            <form className="requests-search" onSubmit={handleSuggest}>
                <span aria-hidden className="requests-search-yt">
                    <RiMusic2Line />
                </span>
                <RiSearchLine aria-hidden className="requests-search-icon" />
                <input
                    className="requests-search-input"
                    disabled={queueLocked}
                    onChange={(event) => setRequestSearch(event.currentTarget.value)}
                    placeholder={
                        queueLocked
                            ? 'Queue locked by DJ'
                            : 'Search or paste a link...'
                    }
                    value={requestSearch}
                />
                {requestSearch && (
                    <button
                        aria-label="Clear search"
                        className="icon-btn requests-search-clear"
                        onClick={() => {
                            setRequestSearch('');
                            setSearchResults([]);
                        }}
                        type="button"
                    >
                        <RiCloseLine />
                    </button>
                )}
                <button
                    className="requests-search-submit"
                    disabled={queueLocked || !requestSearch.trim()}
                    type="submit"
                >
                    Request
                    <RiArrowRightSLine aria-hidden />
                </button>
            </form>
        </div>
    );

    const renderSidePanel = (className = '') => (
        <div className={`party-column party-column-side${className}`}>
            <div className="side-tabs">
                <button
                    className={sideTab === 'requests' ? 'active' : ''}
                    onClick={() => setSideTab('requests')}
                    type="button"
                >
                    Requests
                </button>
                <button
                    className={sideTab === 'guests' ? 'active' : ''}
                    onClick={() => setSideTab('guests')}
                    type="button"
                >
                    Guests ({approvedGuests.length})
                </button>
            </div>
            <div className={`side-panel${sideTab === 'requests' ? ' active' : ''}`}>
                <div className="side-panel-body party-scroll">
                    <ul className="queue-list">
                        {showingSearch && searchResults.length ? (
                            searchResults.map((result) => renderSearchResultRow(result))
                        ) : showingSearch ? (
                            <li className="empty-row">No matches found.</li>
                        ) : requestQueue.length ? (
                            requestQueue.map(renderRequestRow)
                        ) : (
                            <li className="empty-row">Search below to request a song.</li>
                        )}
                    </ul>
                </div>
                <p className="requests-note">
                    <RiInformationLine aria-hidden />
                    Requests need votes to be added to the queue.
                </p>
                {renderRequestSearch()}
            </div>
            <div className={`side-panel${sideTab === 'guests' ? ' active' : ''}`}>
                <div className="side-panel-body party-scroll">
                    <ul className="guest-list">
                        {[...approvedGuests, ...pendingGuests].map(renderGuestRow)}
                    </ul>
                </div>
            </div>
        </div>
    );

    const renderNowPlaying = () => (
        <section className="party-column party-column-now-playing">
            <div className="party-column-header">
                <span className="party-column-title">
                    <RiBarChartBoxLine aria-hidden /> Now playing
                </span>
            </div>
            <div className="player-section">
                <div className="artwork-frame">
                    <ArtworkImage artworkUrl={track?.artworkUrl} />
                    <PartyArtworkVisualizer
                        active={isLocalPlaying}
                        analyserRef={analyserRef}
                        audioGraphReady={audioGraphReady}
                        contextRef={contextRef}
                    />
                </div>

                <div className="track-info">
                    <h1 className="track-title">{track?.title || 'Nothing playing'}</h1>
                    <p className="track-artist">{track?.artist || state?.hostDisplayName}</p>
                    <p className="track-album">{track?.album || 'Roofy Party'}</p>
                    <div className="track-pills">
                        <span className="track-pill track-pill-active">{sourceBadge(track)}</span>
                        <span className="track-pill">
                            <RiUserLine aria-hidden />
                            Sync
                        </span>
                    </div>
                </div>

                <div className="progress-block">
                    <div className="time-row">
                        <span>
                            {formatTime(
                                seekPreviewPercent != null && durationMs
                                    ? (seekPreviewPercent / 100) * durationMs
                                    : positionMs,
                            )}
                        </span>
                        <span>{formatTime(durationMs)}</span>
                    </div>
                    <div
                        className={`progress-track${canControlPlayer ? ' progress-track-seekable' : ''}`}
                    >
                        <span className="buffer-bar" style={{ width: `${bufferPercent}%` }} />
                        <span className="play-bar" style={{ width: `${displayProgressPercent}%` }}>
                            <span className="play-thumb" />
                        </span>
                        {canControlPlayer && durationMs > 0 && (
                            <input
                                aria-label="Seek"
                                className="progress-seek"
                                max={100}
                                min={0}
                                onChange={(event) =>
                                    setSeekPreviewPercent(Number(event.currentTarget.value))
                                }
                                onMouseUp={(event) =>
                                    handleSeekCommit(Number(event.currentTarget.value))
                                }
                                onTouchEnd={(event) =>
                                    handleSeekCommit(Number(event.currentTarget.value))
                                }
                                step={0.1}
                                type="range"
                                value={displayProgressPercent}
                            />
                        )}
                    </div>
                </div>

                <div aria-label="Playback controls" className="control-row" role="group">
                    <button aria-label="Shuffle" className="icon-btn" disabled type="button">
                        <RiShuffleLine />
                    </button>
                    <button aria-label="Previous track" className="icon-btn" disabled type="button">
                        <RiSkipBackFill />
                    </button>
                    <button
                        aria-disabled={!canControlPlayer}
                        aria-label={
                            canControlPlayer
                                ? isLocalPlaying
                                    ? 'Pause'
                                    : 'Play'
                                : 'Playback controlled by DJ'
                        }
                        className={`icon-btn play-btn play-btn-round${canControlPlayer ? '' : ' play-btn-locked'}`}
                        disabled={!track?.streamUrl || !canControlPlayer}
                        onClick={handleTransportClick}
                        type="button"
                    >
                        {canControlPlayer ? (
                            isLocalPlaying ? (
                                <RiPauseFill />
                            ) : (
                                <RiPlayFill />
                            )
                        ) : (
                            <RiLockFill />
                        )}
                    </button>
                    <button
                        aria-label="Skip track"
                        className="icon-btn"
                        disabled={!canControlPlayer}
                        onClick={() => send({ action: 'skip', type: 'control' })}
                        type="button"
                    >
                        <RiSkipForwardFill />
                    </button>
                    <button aria-label="Repeat" className="icon-btn" disabled type="button">
                        <RiRepeatLine />
                    </button>
                    <PartyVolumeControl
                        muted={muted}
                        onMutedChange={setMuted}
                        onVolumeChange={setVolume}
                        volume={volume}
                    />
                </div>

                <div className="player-actions">
                    <button className="player-action-btn" disabled type="button">
                        <RiMusic2Line aria-hidden /> Lyrics
                    </button>
                    <button className="player-action-btn" disabled type="button">
                        <RiMore2Line aria-hidden /> More
                    </button>
                </div>

                <audio playsInline preload="auto" ref={audioRef} />
            </div>
        </section>
    );

    const renderPartyModal = (
        title: string,
        open: boolean,
        onClose: () => void,
        children: ReactNode,
    ) => {
        if (!open) return null;

        return (
            <div className="party-modal-backdrop" onClick={onClose} role="presentation">
                <div
                    aria-labelledby={`party-modal-${title.replace(/\s+/g, '-').toLowerCase()}`}
                    aria-modal="true"
                    className="party-modal"
                    onClick={(event) => event.stopPropagation()}
                    role="dialog"
                >
                    <div className="party-modal-header">
                        <h2 className="party-modal-title" id={`party-modal-${title.replace(/\s+/g, '-').toLowerCase()}`}>
                            {title}
                        </h2>
                        <button aria-label="Close" className="icon-btn" onClick={onClose} type="button">
                            <RiCloseLine />
                        </button>
                    </div>
                    <div className="party-modal-body">{children}</div>
                </div>
            </div>
        );
    };

    return (
        <main
            className={`party-shell${joined ? ' party-shell-joined' : ''}${joined && activeTab === 'chat' ? ' party-shell-mobile-chat-footer' : ''}`}
        >
            <header className="party-topbar">
                <div className="topbar-left">
                    <p className="topbar-brand">
                        <span className="brand-rm">RM</span> ROOFY PARTY
                    </p>
                </div>
                {joined && (
                    <div className="topbar-center topbar-center-live">
                        <span className="topbar-live-label">
                            <span aria-hidden className={`status-dot${joined ? ' status-dot-live' : ''}`} />
                            Live
                        </span>
                        <span className="topbar-live-copy">People are listening together</span>
                        <span aria-hidden className="header-viz">
                            <span />
                            <span />
                            <span />
                            <span />
                            <span />
                        </span>
                    </div>
                )}
                <div className="topbar-meta">
                    {joined && (
                        <>
                            <span className="room-code-block">
                                <span className="room-code-label">Room code</span>
                                <span className="room-code-value">{roomCode}</span>
                            </span>
                            <span className="guest-count">
                                <RiUserLine />
                                {approvedGuests.length}
                            </span>
                            <button
                                aria-label="Sync audio with DJ"
                                className="icon-btn"
                                onClick={resyncAudio}
                                title="Sync audio"
                                type="button"
                            >
                                <RiRefreshLine />
                            </button>
                            <button
                                aria-label="Help"
                                className="icon-btn"
                                onClick={() => {
                                    setSettingsOpen(false);
                                    setHelpOpen(true);
                                }}
                                type="button"
                            >
                                <RiQuestionLine />
                            </button>
                            <button
                                aria-label="Settings"
                                className="icon-btn"
                                onClick={() => {
                                    setHelpOpen(false);
                                    setSettingsOpen(true);
                                }}
                                type="button"
                            >
                                <RiSettings3Line />
                            </button>
                            {state?.hostMicActive && (
                                <span className={`badge badge-accent${djSpeaking ? ' badge-speaking' : ''}`}>
                                    <RiMicLine aria-hidden />
                                    DJ {djSpeaking ? 'speaking' : 'mic'}
                                </span>
                            )}
                            {queueLocked && <span className="badge">Locked</span>}
                        </>
                    )}
                    {!joined && (
                        <span className="room-code-block">
                            <span className="room-code-label">Room code</span>
                            <span className="room-code-value">{roomCode}</span>
                        </span>
                    )}
                </div>
            </header>

            {joined && (audioNeedsUnlock || audioLoadIssue) && (
                <div className="party-audio-banner" role="status">
                    <p className="party-audio-banner-text">
                        {audioLoadIssue ??
                            'Playback is paused by your browser. Enable audio to hear the DJ.'}
                    </p>
                    <div className="party-audio-banner-actions">
                        {audioNeedsUnlock && (
                            <button
                                className="party-btn party-btn-primary"
                                onClick={() => void tryPlay()}
                                type="button"
                            >
                                Enable audio
                            </button>
                        )}
                        <button
                            className="party-btn party-btn-ghost"
                            onClick={resyncAudio}
                            type="button"
                        >
                            <RiRefreshLine aria-hidden />
                            Sync audio
                        </button>
                    </div>
                </div>
            )}

            {!joined ? (
                <form className="join-panel" onSubmit={handleJoin}>
                    <div className="join-copy">
                        <p className="join-eyebrow">Listen together</p>
                        <h1>{roomCode}</h1>
                        <p>
                            {restoring || waiting
                                ? 'Reconnecting to your session…'
                                : 'Enter the name the DJ will see, then wait for approval.'}
                        </p>
                    </div>
                    {!restoring && (
                        <>
                            <label className="field-label">
                                Display name
                                <input
                                    autoComplete="name"
                                    className="party-field"
                                    disabled={waiting}
                                    maxLength={40}
                                    onChange={(event) => setDisplayName(event.currentTarget.value)}
                                    placeholder="Your name"
                                    value={displayName}
                                />
                            </label>
                            <button className="party-btn party-btn-primary" disabled={waiting} type="submit">
                                {waiting ? 'Waiting for host' : 'Join party'}
                            </button>
                        </>
                    )}
                    {error && <p className="party-error">{error}</p>}
                </form>
            ) : (
                <div className="party-joined-layout">
                    {renderPartyModal(
                        'Help',
                        helpOpen,
                        () => setHelpOpen(false),
                        <div className="party-modal-sections">
                            <section className="party-modal-section">
                                <h3>Listening together</h3>
                                <p>
                                    Playback is synced with the DJ. Your player follows the host — pause,
                                    skip, and seek are only available if the DJ grants control.
                                </p>
                            </section>
                            <section className="party-modal-section">
                                <h3>Request a song</h3>
                                <p>
                                    Open the Requests tab, search for a track or paste a YouTube link, then
                                    tap Request.
                                </p>
                            </section>
                            <section className="party-modal-section">
                                <h3>Vote on the queue</h3>
                                <p>
                                    Thumbs-up tracks in Up next. Requests usually need votes before the DJ
                                    adds them to the queue.
                                </p>
                            </section>
                            <section className="party-modal-section">
                                <h3>Chat & guests</h3>
                                <p>
                                    Talk in Live chat, check pending requests, and see who is in the room
                                    from the tabs on the right.
                                </p>
                            </section>
                        </div>,
                    )}

                    {renderPartyModal(
                        'Settings',
                        settingsOpen,
                        () => setSettingsOpen(false),
                        <div className="party-modal-sections">
                            <label className="party-modal-field">
                                <span className="party-modal-label">Your name</span>
                                <span className="party-modal-value">{currentGuestName}</span>
                            </label>

                            <label className="party-modal-field">
                                <span className="party-modal-label">Room code</span>
                                <span className="party-modal-value party-modal-code">{roomCode}</span>
                            </label>

                            <label className="party-modal-field">
                                <span className="party-modal-label">Volume</span>
                                <PartyVolumeControl
                                    className="volume-control-modal"
                                    muted={muted}
                                    onMutedChange={setMuted}
                                    onVolumeChange={setVolume}
                                    showLevel
                                    volume={volume}
                                />
                            </label>

                            <label className="party-modal-field">
                                <span className="party-modal-label">
                                    DJ mic volume ({djMicPrefs.receiveVolume}%)
                                </span>
                                <input
                                    className="party-modal-range"
                                    max={150}
                                    min={0}
                                    onChange={(event) => {
                                        const receiveVolume = Number(event.currentTarget.value);
                                        const nextPrefs = { ...djMicPrefs, receiveVolume };
                                        setDjMicPrefs(nextPrefs);
                                        saveDjMicPrefs(nextPrefs);
                                    }}
                                    type="range"
                                    value={djMicPrefs.receiveVolume}
                                />
                            </label>

                            <label className="party-modal-field party-modal-switch">
                                <span className="party-modal-label">Duck music when DJ speaks</span>
                                <input
                                    checked={djMicPrefs.duckMusic}
                                    onChange={(event) => {
                                        const nextPrefs = {
                                            ...djMicPrefs,
                                            duckMusic: event.currentTarget.checked,
                                        };
                                        setDjMicPrefs(nextPrefs);
                                        saveDjMicPrefs(nextPrefs);
                                    }}
                                    type="checkbox"
                                />
                            </label>

                            <div className="party-modal-actions">
                                <button className="party-btn party-btn-ghost" onClick={copyRoomLink} type="button">
                                    Copy invite link
                                </button>
                                <button
                                    className="party-btn party-btn-ghost party-btn-danger"
                                    onClick={handleLeaveRoom}
                                    type="button"
                                >
                                    Leave room
                                </button>
                            </div>

                            {copyFeedback && <p className="party-modal-feedback">{copyFeedback}</p>}
                        </div>,
                    )}

                    <div className="party-main-grid">
                        {renderUpNextPanel(' party-panels-desktop')}
                        {renderNowPlaying()}
                        <div className="party-column-right party-panels-desktop">
                            {renderChatPanel()}
                            {renderSidePanel()}
                        </div>

                        <section className="party-panels">
                            <nav aria-label="Party sections" className="tab-bar">
                                <button
                                    className={activeTab === 'upNext' ? 'active' : ''}
                                    onClick={() => setActiveTab('upNext')}
                                    type="button"
                                >
                                    Up next
                                </button>
                                <button
                                    className={activeTab === 'chat' ? 'active' : ''}
                                    onClick={() => setActiveTab('chat')}
                                    type="button"
                                >
                                    Chat
                                </button>
                                <button
                                    className={activeTab === 'side' ? 'active' : ''}
                                    onClick={() => setActiveTab('side')}
                                    type="button"
                                >
                                    Requests
                                    {pendingRequests > 0 && (
                                        <span className="tab-count">{pendingRequests}</span>
                                    )}
                                </button>
                            </nav>

                            <div className="party-panels-mobile">
                                <div
                                    className={`party-panel-mobile${activeTab === 'upNext' ? ' active' : ''}`}
                                >
                                    {renderUpNextPanel(' party-column-flat')}
                                </div>
                                <div
                                    className={`party-panel-mobile${activeTab === 'chat' ? ' active' : ''}`}
                                >
                                    {renderChatPanel(' party-column-flat')}
                                </div>
                                <div
                                    className={`party-panel-mobile${activeTab === 'side' ? ' active' : ''}`}
                                >
                                    {renderSidePanel(' party-column-flat')}
                                </div>
                            </div>
                        </section>
                    </div>

                    {activeTab === 'chat' && (
                        <footer className="party-footer">
                            <form className="footer-chat-mobile" onSubmit={handleChatSend}>
                                <input
                                    autoComplete="off"
                                    className="party-field footer-input"
                                    maxLength={400}
                                    onChange={(event) => setChatInput(event.currentTarget.value)}
                                    placeholder="Say something..."
                                    value={chatInput}
                                />
                                <PartyChatEmojiPicker
                                    onSelect={(emoji) =>
                                        setChatInput((current) => `${current}${emoji}`)
                                    }
                                />
                                <button
                                    aria-label="Send message"
                                    className="party-btn party-btn-primary"
                                    disabled={!chatInput.trim()}
                                    type="submit"
                                >
                                    <RiSendPlaneFill />
                                </button>
                            </form>
                        </footer>
                    )}

                    {error && error !== 'Connection closed' && (
                        <p className="party-error party-error-toast">{error}</p>
                    )}
                </div>
            )}
        </main>
    );
};
