import { cloneElement, Fragment, isValidElement, ReactNode } from 'react';

import styles from './item-list-pagination.module.css';

import { Pagination } from '/@/shared/components/pagination/pagination';

const withEntranceAnimationDisabled = (child: ReactNode): ReactNode => {
    if (!isValidElement(child)) {
        return child;
    }

    return cloneElement(child, { enableEntranceAnimation: false });
};

interface ItemListWithPaginationProps {
    children: ReactNode;
    currentPage: number;
    itemsPerPage: number;
    onChange: (e: number) => void;
    pageCount: number;
    totalItemCount: number;
}

export const ItemListWithPagination = ({
    children,
    currentPage,
    itemsPerPage,
    onChange,
    pageCount,
    totalItemCount,
}: ItemListWithPaginationProps) => {
    return (
        <div className={styles.container}>
            <div className={styles.listContent}>
                <Fragment key={currentPage}>
                    {withEntranceAnimationDisabled(children)}
                </Fragment>
            </div>
            <div className={styles.paginationContainer}>
                <Pagination
                    itemsPerPage={itemsPerPage}
                    onChange={onChange}
                    total={pageCount}
                    totalItemCount={totalItemCount}
                    value={currentPage}
                />
            </div>
        </div>
    );
};
