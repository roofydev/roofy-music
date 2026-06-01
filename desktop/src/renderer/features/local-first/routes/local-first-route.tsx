import { useEffect } from 'react';
import { useNavigate } from 'react-router';

import { AppRoute } from '/@/renderer/router/routes';
import { useSettingsStoreActions } from '/@/renderer/store/settings.store';
import { Spinner } from '/@/shared/components/spinner/spinner';

const LocalFirstRoute = () => {
    const navigate = useNavigate();
    const { setSettings } = useSettingsStoreActions();

    useEffect(() => {
        setSettings({ tab: 'advanced' });
        navigate(AppRoute.SETTINGS, { replace: true });
    }, [navigate, setSettings]);

    return <Spinner container />;
};

export default LocalFirstRoute;
