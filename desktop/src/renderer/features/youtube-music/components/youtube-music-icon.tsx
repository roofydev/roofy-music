import { RiYoutubeFill } from 'react-icons/ri';

import styles from './youtube-music-icon.module.css';

interface YoutubeMusicIconProps {
    size?: string;
}

export const YoutubeMusicIcon = ({ size = '1.25rem' }: YoutubeMusicIconProps) => (
    <span aria-hidden className={styles.wrapper}>
        <RiYoutubeFill size={size} />
    </span>
);
