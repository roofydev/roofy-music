import { memo } from 'react';

import styles from './crt-overlay.module.css';

export const CrtOverlay = memo(function CrtOverlay() {
    return (
        <>
            <div className={styles.scanlines} />
            <div className={styles.dotMatrix} />
        </>
    );
});
