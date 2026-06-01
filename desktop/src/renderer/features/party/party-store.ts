import { create } from 'zustand';

import { PartyRoomState } from '/@/shared/types/party-types';

interface PartyStore {
    actions: {
        setState: (state: null | PartyRoomState) => void;
    };
    state: null | PartyRoomState;
}

export const usePartyStore = create<PartyStore>((set) => ({
    actions: {
        setState: (state) => set({ state }),
    },
    state: null,
}));

export const usePartyRoomState = () => usePartyStore((store) => store.state);

export const usePartyStoreActions = () => usePartyStore((store) => store.actions);
