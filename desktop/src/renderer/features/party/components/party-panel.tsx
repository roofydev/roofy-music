import { useNavigate } from 'react-router';

import { usePartyRoomState } from '/@/renderer/features/party/party-store';
import { AppRoute } from '/@/renderer/router/routes';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';

export const PartyPanel = () => {
    const state = usePartyRoomState();
    const navigate = useNavigate();
    const listeners = state?.guests.filter((guest) => guest.status === 'approved').length ?? 0;

    return (
        <ActionIcon
            icon="radio"
            iconProps={{
                color: state ? 'primary' : 'default',
                size: 'lg',
            }}
            onClick={(event) => {
                event.stopPropagation();
                navigate(AppRoute.PARTY);
            }}
            size="sm"
            tooltip={{
                label: state ? `Party room · ${listeners} listening` : 'Party room',
                openDelay: 0,
            }}
            variant="subtle"
        />
    );
};
