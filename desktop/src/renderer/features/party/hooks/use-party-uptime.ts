import { useEffect, useState } from 'react';

import { formatPartyUptime } from '/@/renderer/features/party/utils/party-utils';

export const usePartyUptime = (sessionStartedAt?: number) => {
    const [uptime, setUptime] = useState('00:00:00');

    useEffect(() => {
        if (!sessionStartedAt) {
            setUptime('00:00:00');
            return undefined;
        }

        const tick = () => setUptime(formatPartyUptime(sessionStartedAt));
        tick();
        const interval = window.setInterval(tick, 1000);
        return () => window.clearInterval(interval);
    }, [sessionStartedAt]);

    return uptime;
};
