import { describe, expect, it } from 'vitest';

import { inferPlaybackErrorCode } from './user-error-messages';

describe('inferPlaybackErrorCode', () => {
    it('detects YouTube 403 errors', () => {
        expect(inferPlaybackErrorCode('HTTP 403 Forbidden')).toBe('YT_STREAM_403');
    });

    it('detects personal library offline errors', () => {
        expect(inferPlaybackErrorCode('Navidrome connection refused')).toBe('NAVIDROME_OFFLINE');
    });

    it('returns undefined for unknown messages', () => {
        expect(inferPlaybackErrorCode('something odd')).toBeUndefined();
    });
});
