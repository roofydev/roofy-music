import { useEffect } from 'react';

import { PartyDashboardGrid } from '/@/renderer/features/party/components/party-dashboard-grid';
import { PartyDjToolsBar } from '/@/renderer/features/party/components/party-dj-tools-bar';
import { PartyRoomHeader } from '/@/renderer/features/party/components/party-room-header';
import { PartySetupScreen } from '/@/renderer/features/party/components/party-setup-screen';
import styles from '/@/renderer/features/party/party-dashboard.module.css';
import { usePartyRoomState } from '/@/renderer/features/party/party-store';
import { AnimatedPage } from '/@/renderer/features/shared/components/animated-page';
import { LibraryContainer } from '/@/renderer/features/shared/components/library-container';
import { PageErrorBoundary } from '/@/renderer/features/shared/components/page-error-boundary';
import { useAppStoreActions } from '/@/renderer/store';
import { toast } from '/@/shared/components/toast/toast';

const PartyRoute = () => {
    const state = usePartyRoomState();
    const { setSideBar } = useAppStoreActions();

    useEffect(() => {
        setSideBar({ rightExpanded: false });
        return () => {
            setSideBar({ rightExpanded: true });
        };
    }, [setSideBar]);

    useEffect(() => {
        if (!state) return;
        const listeners = state.guests.filter((guest) => guest.status === 'approved').length;
        if (listeners >= 5) {
            toast.warn({
                id: 'party-bandwidth-warning',
                message: 'Streaming to many guests uses your upload bandwidth.',
                title: 'Bandwidth notice',
            });
        }
    }, [state?.guests]);

    return (
        <AnimatedPage>
            <LibraryContainer>
                <div className={styles.partyDashboard}>
                    {!state ? (
                        <PartySetupScreen />
                    ) : (
                        <>
                            <PartyRoomHeader />
                            <PartyDashboardGrid />
                            <PartyDjToolsBar />
                        </>
                    )}
                </div>
            </LibraryContainer>
        </AnimatedPage>
    );
};

const PartyRouteWithBoundary = () => (
    <PageErrorBoundary>
        <PartyRoute />
    </PageErrorBoundary>
);

export default PartyRouteWithBoundary;
