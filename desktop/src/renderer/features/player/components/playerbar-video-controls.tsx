import {
    useDownloadVideoForCurrentSong,
    useSongVideoAvailability,
    VideoPlayerToolbar,
} from '/@/renderer/features/player/components/local-video-player';
import { useIsRadioActive } from '/@/renderer/features/radio/hooks/use-radio-player';
import {
    useFullScreenPlayerStore,
    usePlayerSong,
    useSetFullScreenPlayerStore,
} from '/@/renderer/store';

export const PlayerbarVideoControls = () => {
    const isRadioActive = useIsRadioActive();
    const currentSong = usePlayerSong();
    const visualMode = useFullScreenPlayerStore((state) => state.visualMode);
    const videoFullscreen = useFullScreenPlayerStore((state) => state.videoFullscreen);
    const setFullScreenPlayerStore = useSetFullScreenPlayerStore();
    const { metadata } = useSongVideoAvailability();
    const { downloadVideo, isDownloading } = useDownloadVideoForCurrentSong();

    if (isRadioActive || !currentSong) {
        return null;
    }

    const isVideoMode = visualMode === 'video';

    if (isVideoMode && !metadata) {
        return null;
    }

    return (
        <VideoPlayerToolbar
            isDownloading={isDownloading}
            metadata={metadata ?? undefined}
            onDownload={isVideoMode ? downloadVideo : undefined}
            onEnterFullscreen={
                videoFullscreen ? undefined : () => setFullScreenPlayerStore({ videoFullscreen: true })
            }
            onExitFullscreen={
                videoFullscreen ? () => setFullScreenPlayerStore({ videoFullscreen: false }) : undefined
            }
            showVideoActions={isVideoMode}
            variant="playerbar"
        />
    );
};
