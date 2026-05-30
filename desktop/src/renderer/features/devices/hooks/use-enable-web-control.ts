import { useCallback } from 'react';

import { useTranslation } from 'react-i18next';

import { useRemoteSettings, useSettingsStoreActions } from '/@/renderer/store';
import { toast } from '/@/shared/components/toast/toast';

export const useEnableWebControl = () => {
    const { t } = useTranslation();
    const remote = useRemoteSettings();
    const { setSettings } = useSettingsStoreActions();

    const setWebControlEnabled = useCallback(
        async (enabled: boolean) => {
            if (!window.api?.remote) return;

            if (enabled) {
                const errorMsg = await window.api.remote.updateSetting(
                    true,
                    remote.port,
                    remote.username,
                    remote.password,
                );

                if (errorMsg) {
                    toast.error({
                        message: errorMsg,
                        title: t('productUx.devices.webControl'),
                    });
                    return;
                }

                setSettings({ remote: { enabled: true } });
                return;
            }

            const errorMsg = await window.api.remote.setRemoteEnabled(false);
            if (errorMsg) {
                toast.error({ message: errorMsg, title: 'Web control' });
                return;
            }

            setSettings({ remote: { enabled: false } });
        },
        [remote.password, remote.port, remote.username, setSettings],
    );

    return { setWebControlEnabled };
};
