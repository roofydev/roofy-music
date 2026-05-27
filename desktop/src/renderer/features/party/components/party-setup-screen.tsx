import { Button } from '@mantine/core';
import { RiPlayCircleLine } from 'react-icons/ri';

import { PartySettingsPanel } from '/@/renderer/features/party/components/party-settings-panel';
import { usePartyActions } from '/@/renderer/features/party/hooks/use-party-actions';
import styles from '/@/renderer/features/party/party-dashboard.module.css';

export const PartySetupScreen = () => {
    const { starting, startParty } = usePartyActions();

    return (
        <div className={styles.partySetupScreen}>
            <div className={styles.partySetupInner}>
                <header className={styles.partySetupHero}>
                    <div className={styles.partySetupTitleRow}>
                        <h1 className={styles.partySetupTitle}>Party</h1>
                        <span className={styles.partySetupBadge}>Off</span>
                    </div>
                    <p className={styles.partySetupSubtitle}>
                        Host a synchronized listening room. Guests can chat, request songs, and follow
                        your queue — you stay in control as DJ.
                    </p>
                </header>

                <section aria-labelledby="party-setup-heading" className={styles.partySetupCard}>
                    <h2 className={styles.partySetupCardTitle} id="party-setup-heading">
                        Room setup
                    </h2>
                    <PartySettingsPanel layout="setup" />
                </section>

                <footer className={styles.partySetupFooter}>
                    <Button
                        disabled={starting}
                        leftSection={<RiPlayCircleLine size={18} />}
                        loading={starting}
                        onClick={() => startParty()}
                        size="md"
                    >
                        Start party
                    </Button>
                    <p className={styles.partySetupHint}>
                        Settings are saved locally. You can change most options while the room is live.
                    </p>
                </footer>
            </div>
        </div>
    );
};
