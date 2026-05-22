import RoofyLogo from '../../../../../assets/RoofyMusicIcon.png';
import JellyfinLogo from '../assets/jellyfin.png';
import NavidromeLogo from '../assets/navidrome.png';
import OpenSubsonicLogo from '../assets/opensubsonic.png';

import { ServerType } from '/@/shared/types/domain-types';

export const ROOFY_LOCAL_SERVER_ID = 'roofy-local-navidrome';

export const getServerLogo = (server?: { id?: string; type?: ServerType }) => {
    if (server?.id === ROOFY_LOCAL_SERVER_ID) return RoofyLogo;

    if (server?.type === ServerType.NAVIDROME) return NavidromeLogo;
    if (server?.type === ServerType.JELLYFIN) return JellyfinLogo;

    return OpenSubsonicLogo;
};
