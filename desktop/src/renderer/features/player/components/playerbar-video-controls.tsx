import {
    useDownloadVideoForCurrentSong,
    useSongVideoAvailability,
    VideoPlayerToolbar,
} from '/@/renderer/features/player/components/local-video-player';
import { useIsRadioActive } from '/@/renderer/features/radio/hooks/use-radio-player';
import {
    useFullScreenPlayerStore,
    useSetFullScreenPlayerStore,
} from '/@/renderer/store';

export const PlayerbarVideoControls = () => {
    const isRadioActive = useIsRadioActive();
    const visualMode = useFullScreenPlayerStore((state) => state.visualMode);
    const videoFullscreen = useFullScreenPlayerStore((state) => state.videoFullscreen);
    const setFullScreenPlayerStore = useSetFullScreenPlayerStore();
    const { metadata } = useSongVideoAvailability();
    const { downloadVideo, isDownloading } = useDownloadVideoForCurrentSong();

    if (isRadioActive || visualMode !== 'video' || !metadata) {
        return null;
    }

    return (
        <VideoPlayerToolbar
            isDownloading={isDownloading}
            metadata={metadata}
            onDownload={downloadVideo}
            onEnterFullscreen={
                videoFullscreen ? undefined : () => setFullScreenPlayerStore({ videoFullscreen: true })
            }
            onExitFullscreen={
                videoFullscreen ? () => setFullScreenPlayerStore({ videoFullscreen: false }) : undefined
            }
            variant="playerbar"
        />
    );
};
