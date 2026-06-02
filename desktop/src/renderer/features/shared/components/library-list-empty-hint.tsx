import { useIsFetchingItemListCount } from '/@/renderer/components/item-list/helpers/use-is-fetching-item-list';
import { useListContext } from '/@/renderer/context/list-context';
import { ProductUxEmptyState } from '/@/shared/components/product-ux-empty-state';
import { AppIconSelection } from '/@/shared/components/icon/icon';
import { LibraryItem } from '/@/shared/types/domain-types';

interface LibraryListEmptyHintProps {
    itemType:
        | LibraryItem.ALBUM
        | LibraryItem.ALBUM_ARTIST
        | LibraryItem.PLAYLIST
        | LibraryItem.SONG;
    offline?: boolean;
    searchTerm?: string;
}

export function LibraryListEmptyHint({
    itemType,
    offline = false,
    searchTerm,
}: LibraryListEmptyHintProps) {
    const { itemCount } = useListContext();
    const isFetchingCount = useIsFetchingItemListCount({ itemType });

    if (itemCount === undefined || itemCount > 0 || isFetchingCount) {
        return null;
    }

    if (searchTerm?.trim()) {
        return (
            <ProductUxEmptyState
                descriptionKey="productUx.search.empty.description"
                icon="search"
                titleKey="productUx.search.empty.title"
            />
        );
    }

    if (offline && itemType === LibraryItem.SONG) {
        return (
            <ProductUxEmptyState
                descriptionKey="productUx.library.offlineEmpty.description"
                icon="download"
                titleKey="productUx.library.offlineEmpty.title"
            />
        );
    }

    const emptyByType: Record<
        | LibraryItem.ALBUM
        | LibraryItem.ALBUM_ARTIST
        | LibraryItem.PLAYLIST
        | LibraryItem.SONG,
        { descriptionKey: string; icon: AppIconSelection; titleKey: string }
    > = {
        [LibraryItem.ALBUM]: {
            descriptionKey: 'productUx.library.albumsEmpty.description',
            icon: 'album',
            titleKey: 'productUx.library.albumsEmpty.title',
        },
        [LibraryItem.ALBUM_ARTIST]: {
            descriptionKey: 'productUx.library.artistsEmpty.description',
            icon: 'artist',
            titleKey: 'productUx.library.artistsEmpty.title',
        },
        [LibraryItem.PLAYLIST]: {
            descriptionKey: 'productUx.library.playlistsEmpty.description',
            icon: 'playlist',
            titleKey: 'productUx.library.playlistsEmpty.title',
        },
        [LibraryItem.SONG]: {
            descriptionKey: 'productUx.library.empty.description',
            icon: 'library',
            titleKey: 'productUx.library.empty.title',
        },
    };

    const config = emptyByType[itemType];

    return (
        <ProductUxEmptyState
            descriptionKey={config.descriptionKey}
            icon={config.icon}
            titleKey={config.titleKey}
        />
    );
}
