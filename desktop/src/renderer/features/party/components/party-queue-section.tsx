import { useRef, useState } from 'react';

import { ItemListHandle } from '/@/renderer/components/item-list/types';
import { usePartyRoomState } from '/@/renderer/features/party/party-store';
import { PlayQueue } from '/@/renderer/features/now-playing/components/play-queue';
import { PlayQueueListControls } from '/@/renderer/features/now-playing/components/play-queue-list-controls';
import { Text } from '/@/shared/components/text/text';
import { ItemListKey } from '/@/shared/types/types';

export const PartyQueueSection = () => {
    const state = usePartyRoomState();
    const [search, setSearch] = useState<string | undefined>(undefined);
    const tableRef = useRef<ItemListHandle | null>(null);

    if (!state) {
        return (
            <Text c="dimmed" size="sm">
                Start a party to manage the shared queue. Songs you add from the library go straight
                into the party playlist.
            </Text>
        );
    }

    return (
        <>
            <PlayQueueListControls
                handleSearch={setSearch}
                searchTerm={search}
                tableRef={tableRef}
                type={ItemListKey.QUEUE_SONG}
            />
            <PlayQueue listKey={ItemListKey.QUEUE_SONG} ref={tableRef} searchTerm={search} />
        </>
    );
};
