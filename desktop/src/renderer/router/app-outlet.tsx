import { useEffect, useMemo } from 'react';
import { Navigate, Outlet } from 'react-router';
import { shallow } from 'zustand/shallow';

import {
    getServerUrl,
    isServerLock,
} from '/@/renderer/features/action-required/utils/window-properties';
import { AppRoute } from '/@/renderer/router/routes';
import { useAuthStore, useAuthStoreActions } from '/@/renderer/store';

const normalizeUrl = (url: string) => url.replace(/\/$/, '');

export const AppOutlet = () => {
    const currentServer = useAuthStore(
        (state) =>
            state.currentServer
                ? {
                      id: state.currentServer.id,
                      url: state.currentServer.url,
                  }
                : null,
        shallow,
    );
    const { deleteServer, setCurrentServer } = useAuthStoreActions();

    const hasServerLockMismatch = useMemo(() => {
        const configuredServerUrl = getServerUrl();
        if (!isServerLock() || !currentServer || !configuredServerUrl) {
            return false;
        }

        const configuredUrl = normalizeUrl(configuredServerUrl);
        const persistedUrl = normalizeUrl(currentServer.url);

        return configuredUrl !== persistedUrl;
    }, [currentServer]);

    useEffect(() => {
        if (hasServerLockMismatch && currentServer) {
            deleteServer(currentServer.id);
            setCurrentServer(null);
        }
    }, [currentServer, deleteServer, hasServerLockMismatch, setCurrentServer]);

    const isActionsRequired = !currentServer || hasServerLockMismatch;

    if (isActionsRequired) {
        return <Navigate replace to={AppRoute.ACTION_REQUIRED} />;
    }

    return <Outlet />;
};
