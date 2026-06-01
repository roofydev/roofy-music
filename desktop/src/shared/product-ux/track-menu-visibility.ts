import type { Song } from '/@/shared/types/domain-types';

import {
    type TrackActionId,
    resolveTrackActions,
} from './track-action-resolver';

export function getVisibleTrackActionSet(songs: Song[]): Set<TrackActionId> {
    return new Set(resolveTrackActions(songs));
}

export function isTrackActionVisible(songs: Song[], action: TrackActionId): boolean {
    return getVisibleTrackActionSet(songs).has(action);
}
