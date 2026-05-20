import { Badge } from '/@/shared/components/badge/badge';
import { ServerType } from '/@/shared/types/domain-types';

interface SourceBadgeProps {
    serverType?: ServerType;
    size?: 'xs' | 'sm' | 'md';
}

const SOURCE_LABELS: Record<string, string> = {
    [ServerType.JELLYFIN]: 'Jellyfin',
    [ServerType.NAVIDROME]: 'NAV',
    [ServerType.SUBSONIC]: 'SUB',
    [ServerType.YOUTUBE_MUSIC]: 'YT',
};

const SOURCE_VARIANTS: Record<string, 'default' | 'filled' | 'outline'> = {
    [ServerType.JELLYFIN]: 'outline',
    [ServerType.NAVIDROME]: 'outline',
    [ServerType.SUBSONIC]: 'outline',
    [ServerType.YOUTUBE_MUSIC]: 'filled',
};

export const SourceBadge = ({ serverType, size = 'xs' }: SourceBadgeProps) => {
    if (!serverType) return null;

    const label = SOURCE_LABELS[serverType];
    if (!label) return null;

    return (
        <Badge
            color={serverType === ServerType.YOUTUBE_MUSIC ? 'red' : 'gray'}
            size={size}
            variant={SOURCE_VARIANTS[serverType] || 'default'}
        >
            {label}
        </Badge>
    );
};
