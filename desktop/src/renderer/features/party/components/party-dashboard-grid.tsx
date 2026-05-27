import { PartyChatColumn } from '/@/renderer/features/party/components/party-chat-column';
import { PartyGuestsColumn } from '/@/renderer/features/party/components/party-guests-column';
import { PartyQueueColumn } from '/@/renderer/features/party/components/party-queue-column';
import styles from '/@/renderer/features/party/party-dashboard.module.css';

export const PartyDashboardGrid = () => (
    <div className={styles.partyDashboardGrid}>
        <PartyGuestsColumn />
        <PartyQueueColumn />
        <PartyChatColumn />
    </div>
);
