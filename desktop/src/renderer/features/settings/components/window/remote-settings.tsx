import isElectron from 'is-electron';
import debounce from 'lodash/debounce';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { WebControlShare } from '/@/renderer/features/devices/components/web-control-share';
import { useEnableWebControl } from '/@/renderer/features/devices/hooks/use-enable-web-control';
import { SettingsSection } from '/@/renderer/features/settings/components/settings-section';
import { useRemoteSettings, useSettingsStoreActions } from '/@/renderer/store';
import { Stack } from '/@/shared/components/stack/stack';
import { NumberInput } from '/@/shared/components/number-input/number-input';
import { Switch } from '/@/shared/components/switch/switch';
import { TextInput } from '/@/shared/components/text-input/text-input';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';

const remote = window.api?.remote ?? null;

export const RemoteSettings = memo(({ advanced = false }: { advanced?: boolean }) => {
    const { t } = useTranslation();
    const settings = useRemoteSettings();
    const { setSettings } = useSettingsStoreActions();
    const { setWebControlEnabled } = useEnableWebControl();

    const debouncedEnableRemote = debounce(async (enabled: boolean) => {
        await setWebControlEnabled(enabled);
    }, 50);

    const debouncedChangeRemotePort = debounce(async (port: number) => {
        const errorMsg = await remote!.setRemotePort(port);
        if (!errorMsg) {
            setSettings({
                remote: {
                    port,
                },
            });
            toast.warn({
                message: t('error.remotePortWarning'),
            });
        } else {
            toast.error({
                message: errorMsg,
                title: t('error.remotePortError'),
            });
        }
    }, 100);

    const isHidden = !isElectron();

    const controlOptions = [
        {
            control: (
                <Switch
                    defaultChecked={settings.enabled}
                    onChange={async (e) => {
                        const enabled = e.currentTarget.checked;
                        await debouncedEnableRemote(enabled);
                    }}
                />
            ),
            description: advanced ? (
                <Text isMuted isNoSelect size="sm">
                    {t('productUx.devices.webControlAdvancedHint')}
                </Text>
            ) : undefined,
            isHidden,
            title: advanced ? t('setting.enableRemote') : t('productUx.devices.webControl'),
        },
        ...(advanced
            ? [
        {
            control: (
                <NumberInput
                    max={65535}
                    onBlur={async (e) => {
                        if (!e) return;
                        const port = Number(e.currentTarget.value);
                        await debouncedChangeRemotePort(port);
                    }}
                    value={settings.port}
                />
            ),
            description: t('setting.remotePort', {
                context: 'description',
            }),
            isHidden,
            title: t('setting.remotePort'),
        },
        {
            control: (
                <TextInput
                    defaultValue={settings.username}
                    onBlur={(e) => {
                        const username = e.currentTarget.value;
                        if (username === settings.username) return;
                        remote!.updateUsername(username);
                        setSettings({
                            remote: {
                                username,
                            },
                        });
                    }}
                />
            ),
            description: t('setting.remoteUsername', {
                context: 'description',
            }),
            isHidden,
            title: t('setting.remoteUsername'),
        },
        {
            control: (
                <TextInput
                    defaultValue={settings.password}
                    onBlur={(e) => {
                        const password = e.currentTarget.value;
                        if (password === settings.password) return;
                        remote!.updatePassword(password);
                        setSettings({
                            remote: {
                                password,
                            },
                        });
                    }}
                />
            ),
            description: t('setting.remotePassword', {
                context: 'description',
            }),
            isHidden,
            title: t('setting.remotePassword'),
        },
            ]
            : []),
    ];

    return (
        <Stack gap="md">
            <SettingsSection
                options={controlOptions}
                title={
                    advanced
                        ? t('setting.remote', { defaultValue: 'Web control' })
                        : t('productUx.devices.webControl')
                }
            />
            {!advanced && settings.enabled && <WebControlShare />}
        </Stack>
    );
});
