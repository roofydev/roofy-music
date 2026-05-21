import clsx from 'clsx';
import { memo } from 'react';
import { Link, LinkProps, useLocation } from 'react-router';

import styles from './sidebar-item.module.css';

import { Button, ButtonProps } from '/@/shared/components/button/button';

interface SidebarItemProps extends Omit<ButtonProps, 'component' | 'ref'> {
    to: LinkProps['to'];
}

export const SidebarItem = ({ children, className, to, ...props }: SidebarItemProps) => {
    const location = useLocation();
    const [toPath, rawToSearch = ''] =
        typeof to === 'string' ? to.split('?') : [to.pathname || '', to.search || ''];
    const toSearch = rawToSearch
        ? rawToSearch.startsWith('?')
            ? rawToSearch
            : `?${rawToSearch}`
        : '';
    const isActive =
        location.pathname === toPath && (toSearch ? location.search === toSearch : true);

    const handleLinkDragStart = (e: React.DragEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.stopPropagation();
    };

    return (
        <Button
            className={clsx(
                {
                    [styles.active]: isActive,
                    [styles.disabled]: props.disabled,
                    [styles.link]: true,
                    [styles.root]: true,
                },
                className,
            )}
            classNames={{
                inner: styles.inner,
                label: styles.label,
            }}
            component={Link}
            draggable={false}
            onDragStart={handleLinkDragStart}
            to={to}
            variant="subtle"
            {...props}
        >
            {children}
        </Button>
    );
};

export const MemoizedSidebarItem = memo(SidebarItem);
