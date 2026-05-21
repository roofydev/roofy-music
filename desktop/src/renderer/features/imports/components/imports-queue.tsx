import { useMemo, useState } from 'react';

import styles from './imports-queue.module.css';

import { useImportJobActions, useImportJobs } from '/@/renderer/store';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Badge } from '/@/shared/components/badge/badge';
import { Button } from '/@/shared/components/button/button';
import { Group } from '/@/shared/components/group/group';
import { Icon } from '/@/shared/components/icon/icon';
import { Progress } from '/@/shared/components/progress/progress';
import { Stack } from '/@/shared/components/stack/stack';
import { Table } from '/@/shared/components/table/table';
import { Text } from '/@/shared/components/text/text';

type ImportFilter = 'active' | 'all' | 'completed' | 'failed';

const statusOrder: Record<string, number> = {
    completed: 3,
    failed: 0,
    queued: 2,
    running: 1,
};

const getStatusCopy = (status: string, progress: number) => {
    if (status === 'queued') return 'Waiting';
    if (status === 'running') return progress > 0 ? `Downloading ${progress}%` : 'Downloading';
    if (status === 'completed') return 'Imported';
    if (status === 'failed') return 'Needs attention';
    return status;
};

const getStatusBadge = (status: string) => {
    switch (status) {
        case 'completed':
            return <Badge color="green">Completed</Badge>;
        case 'failed':
            return <Badge color="red">Failed</Badge>;
        case 'queued':
            return <Badge variant="light">Queued</Badge>;
        case 'running':
            return <Badge color="blue">Running</Badge>;
        default:
            return <Badge>{status}</Badge>;
    }
};

export const ImportsQueue = () => {
    const jobs = useImportJobs();
    const { clearCompleted, clearFailed, removeJob } = useImportJobActions();
    const [filter, setFilter] = useState<ImportFilter>('all');

    const handleClearCompleted = () => {
        window.api?.localFirst?.clearImports?.('completed');
        clearCompleted();
    };

    const handleClearFailed = () => {
        window.api?.localFirst?.clearImports?.('failed');
        clearFailed();
    };

    const handleRemoveJob = (id: string) => {
        window.api?.localFirst?.removeImport?.(id);
        removeJob(id);
    };

    const allJobs = useMemo(() => {
        return Object.values(jobs).sort((a, b) => {
            if (statusOrder[a.status] !== statusOrder[b.status]) {
                return statusOrder[a.status] - statusOrder[b.status];
            }
            return (b.progress || 0) - (a.progress || 0);
        });
    }, [jobs]);

    const stats = useMemo(() => {
        return allJobs.reduce(
            (acc, job) => {
                acc.total += 1;
                acc[job.status] += 1;
                if (job.status === 'queued' || job.status === 'running') {
                    acc.active += 1;
                }
                return acc;
            },
            { active: 0, completed: 0, failed: 0, queued: 0, running: 0, total: 0 },
        );
    }, [allJobs]);

    const visibleJobs = useMemo(() => {
        if (filter === 'active') {
            return allJobs.filter((job) => job.status === 'queued' || job.status === 'running');
        }
        if (filter === 'completed') {
            return allJobs.filter((job) => job.status === 'completed');
        }
        if (filter === 'failed') {
            return allJobs.filter((job) => job.status === 'failed');
        }
        return allJobs;
    }, [allJobs, filter]);

    return (
        <Stack className={styles.container} gap="md">
            <Group justify="space-between" wrap="nowrap">
                <Text isMuted size="sm">
                    Imported songs, imported playlists, and YouTube Music download jobs.
                </Text>
                <Group gap="xs" wrap="nowrap">
                    <Button
                        disabled={stats.completed === 0}
                        onClick={handleClearCompleted}
                        size="compact-sm"
                        variant="subtle"
                    >
                        Clear completed
                    </Button>
                    <Button
                        disabled={stats.failed === 0}
                        onClick={handleClearFailed}
                        size="compact-sm"
                        variant="subtle"
                    >
                        Clear failed
                    </Button>
                </Group>
            </Group>

            <div className={styles.summary}>
                <button
                    className={styles.summaryItem}
                    data-active={filter === 'active'}
                    onClick={() => setFilter('active')}
                    type="button"
                >
                    <Text className={styles.summaryValue}>{stats.active}</Text>
                    <Text className={styles.summaryLabel}>Active</Text>
                </button>
                <button
                    className={styles.summaryItem}
                    data-active={filter === 'failed'}
                    onClick={() => setFilter('failed')}
                    type="button"
                >
                    <Text className={styles.summaryValue}>{stats.failed}</Text>
                    <Text className={styles.summaryLabel}>Failed</Text>
                </button>
                <button
                    className={styles.summaryItem}
                    data-active={filter === 'completed'}
                    onClick={() => setFilter('completed')}
                    type="button"
                >
                    <Text className={styles.summaryValue}>{stats.completed}</Text>
                    <Text className={styles.summaryLabel}>Completed</Text>
                </button>
                <button
                    className={styles.summaryItem}
                    data-active={filter === 'all'}
                    onClick={() => setFilter('all')}
                    type="button"
                >
                    <Text className={styles.summaryValue}>{stats.total}</Text>
                    <Text className={styles.summaryLabel}>All jobs</Text>
                </button>
            </div>

            {visibleJobs.length === 0 ? (
                <div className={styles.emptyState}>
                    <Icon icon="download" size="2xl" />
                    <Stack gap={4}>
                        <Text fw={600}>
                            {stats.total === 0 ? 'No imports yet' : 'No jobs here'}
                        </Text>
                        <Text isMuted size="sm">
                            {stats.total === 0
                                ? 'Imported YouTube Music tracks will appear here while they download and after they finish.'
                                : 'Switch filters to see other import states.'}
                        </Text>
                    </Stack>
                </div>
            ) : (
                <Table className={styles.table}>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Track</Table.Th>
                            <Table.Th>Target</Table.Th>
                            <Table.Th>Status</Table.Th>
                            <Table.Th>Progress</Table.Th>
                            <Table.Th />
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {visibleJobs.map((job) => {
                            const title =
                                job.name || job.title || job.sourceTrackId || 'Unknown track';
                            const artist = job.artist || 'YouTube Music';
                            const target = job.targetPlaylistNames?.join(', ') || 'Library';
                            const canDismiss =
                                job.status === 'completed' || job.status === 'failed';

                            return (
                                <Table.Tr className={styles.row} key={job.id}>
                                    <Table.Td>
                                        <Group gap="sm" wrap="nowrap">
                                            {job.imageUrl ? (
                                                <img
                                                    alt=""
                                                    className={styles.art}
                                                    src={job.imageUrl}
                                                />
                                            ) : (
                                                <div className={styles.emptyArt}>
                                                    <Icon icon="download" size="sm" />
                                                </div>
                                            )}
                                            <Stack gap={2}>
                                                <Text className={styles.trackTitle} size="sm">
                                                    {title}
                                                </Text>
                                                <Text isMuted size="xs">
                                                    {artist}
                                                </Text>
                                                {job.error && (
                                                    <Text
                                                        className={styles.errorText}
                                                        color="red"
                                                        size="xs"
                                                    >
                                                        {job.error}
                                                    </Text>
                                                )}
                                            </Stack>
                                        </Group>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text className={styles.target} size="sm">
                                            {target}
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>{getStatusBadge(job.status)}</Table.Td>
                                    <Table.Td>
                                        <Stack gap={4}>
                                            <Progress
                                                aria-label={`${title} import progress`}
                                                color={job.status === 'failed' ? 'red' : undefined}
                                                size="sm"
                                                value={
                                                    job.status === 'completed' ? 100 : job.progress
                                                }
                                            />
                                            <Text isMuted size="xs">
                                                {getStatusCopy(job.status, job.progress)}
                                            </Text>
                                        </Stack>
                                    </Table.Td>
                                    <Table.Td>
                                        <ActionIcon
                                            disabled={!canDismiss}
                                            icon="x"
                                            onClick={() => handleRemoveJob(job.id)}
                                            size="compact-sm"
                                            tooltip={{
                                                label: canDismiss
                                                    ? 'Dismiss job'
                                                    : 'Active jobs stay visible until they finish',
                                            }}
                                            variant="subtle"
                                        />
                                    </Table.Td>
                                </Table.Tr>
                            );
                        })}
                    </Table.Tbody>
                </Table>
            )}
        </Stack>
    );
};
