import { useEffect, useMemo, useRef, useState } from 'react';

import { ImageRequest } from '/@/shared/types/domain-types';

type FetchPriority = 'auto' | 'high' | 'low';

const BROWSER_IMAGE_LOAD_HOSTS = new Set([
    'i.ytimg.com',
    'lh3.googleusercontent.com',
    'www.gstatic.com',
    'yt3.ggpht.com',
    'yt3.googleusercontent.com',
]);
const THROTTLED_IMAGE_HOSTS = new Set([
    'i.ytimg.com',
    'lh3.googleusercontent.com',
    'www.gstatic.com',
    'yt3.ggpht.com',
    'yt3.googleusercontent.com',
]);
const THROTTLED_IMAGE_MAX_CONCURRENT = 4;
const THROTTLED_IMAGE_START_GAP_MS = 125;

interface NativeImageState {
    displaySrc?: string;
    status: 'error' | 'idle' | 'loaded' | 'loading';
}

interface QueuedImageLoad<T> {
    reject: (reason?: unknown) => void;
    resolve: (value: T) => void;
    run: () => Promise<T>;
    signal?: AbortSignal | null;
}

interface UseNativeImageArgs {
    enabled: boolean;
    fetchPriority?: FetchPriority;
    onFetchError?: () => void;
    request?: ImageRequest | null;
}

let activeThrottledImageFetches = 0;
let lastThrottledImageFetchStart = 0;
let throttledImageFetchTimer: null | ReturnType<typeof setTimeout> = null;

const throttledImageFetchQueue: QueuedImageLoad<unknown>[] = [];

const isHostInSet = (url: string, hosts: Set<string>) => {
    try {
        return hosts.has(new URL(url).hostname);
    } catch {
        return false;
    }
};

const isBrowserImageLoadUrl = (url: string) => isHostInSet(url, BROWSER_IMAGE_LOAD_HOSTS);
const isThrottledImageUrl = (url: string) => isHostInSet(url, THROTTLED_IMAGE_HOSTS);

const abortError = () => new DOMException('Image request was aborted', 'AbortError');

const pumpThrottledImageFetchQueue = () => {
    if (throttledImageFetchTimer) {
        clearTimeout(throttledImageFetchTimer);
        throttledImageFetchTimer = null;
    }

    if (
        activeThrottledImageFetches >= THROTTLED_IMAGE_MAX_CONCURRENT ||
        throttledImageFetchQueue.length === 0
    ) {
        return;
    }

    const elapsedSinceLastStart = Date.now() - lastThrottledImageFetchStart;
    const waitMs = Math.max(0, THROTTLED_IMAGE_START_GAP_MS - elapsedSinceLastStart);

    if (waitMs > 0) {
        throttledImageFetchTimer = setTimeout(pumpThrottledImageFetchQueue, waitMs);
        return;
    }

    const job = throttledImageFetchQueue.shift();
    if (!job) {
        return;
    }

    if (job.signal?.aborted) {
        job.reject(abortError());
        pumpThrottledImageFetchQueue();
        return;
    }

    activeThrottledImageFetches += 1;
    lastThrottledImageFetchStart = Date.now();

    job.run()
        .then(job.resolve, job.reject)
        .finally(() => {
            activeThrottledImageFetches -= 1;
            pumpThrottledImageFetchQueue();
        });

    pumpThrottledImageFetchQueue();
};

const enqueueThrottledImageLoad = <T>({
    run,
    signal,
}: {
    run: () => Promise<T>;
    signal?: AbortSignal | null;
}) =>
    new Promise<T>((resolve, reject) => {
        if (signal?.aborted) {
            reject(abortError());
            return;
        }

        const job: QueuedImageLoad<unknown> = {
            reject,
            resolve: resolve as (value: unknown) => void,
            run: run as () => Promise<unknown>,
            signal,
        };

        const onAbort = () => {
            const index = throttledImageFetchQueue.indexOf(job);

            if (index >= 0) {
                throttledImageFetchQueue.splice(index, 1);
                reject(abortError());
            }
        };

        signal?.addEventListener('abort', onAbort, { once: true });

        const cleanup = () => {
            signal?.removeEventListener('abort', onAbort);
        };

        job.resolve = (value) => {
            cleanup();
            resolve(value as T);
        };
        job.reject = (reason) => {
            cleanup();
            reject(reason);
        };

        throttledImageFetchQueue.push(job);
        pumpThrottledImageFetchQueue();
    });

const loadBrowserImage = (url: string, signal: AbortSignal) =>
    new Promise<string>((resolve, reject) => {
        if (signal.aborted) {
            reject(abortError());
            return;
        }

        const image = new window.Image();

        const cleanup = () => {
            image.onload = null;
            image.onerror = null;
            signal.removeEventListener('abort', onAbort);
        };
        const onAbort = () => {
            cleanup();
            image.src = '';
            reject(abortError());
        };

        image.decoding = 'async';
        image.onload = () => {
            cleanup();
            resolve(url);
        };
        image.onerror = () => {
            cleanup();
            reject(new Error('Failed to load image'));
        };

        signal.addEventListener('abort', onAbort, { once: true });
        image.src = url;
    });

const loadDisplayImageUrl = (url: string, signal: AbortSignal) => {
    const run = () => loadBrowserImage(url, signal);

    if (!isThrottledImageUrl(url)) {
        return run();
    }

    return enqueueThrottledImageLoad({ run, signal });
};

const fetchImage = (url: string, init: RequestInit & { priority?: FetchPriority }) => {
    const run = () => fetch(url, init);

    if (!isThrottledImageUrl(url)) {
        return run();
    }

    return enqueueThrottledImageLoad({ run, signal: init.signal });
};

export function useNativeImage({
    enabled,
    fetchPriority,
    onFetchError,
    request,
}: UseNativeImageArgs) {
    const abortControllerRef = useRef<AbortController | null>(null);
    const directImageUrlRef = useRef<null | string>(null);
    const loadedRequestSignatureRef = useRef<null | string>(null);
    const objectUrlRef = useRef<null | string>(null);
    const onFetchErrorRef = useRef(onFetchError);
    const [state, setState] = useState<NativeImageState>({ status: 'idle' });

    const requestSignature = useMemo(() => {
        if (!request) {
            return null;
        }

        return JSON.stringify({
            cacheKey: request.cacheKey,
            credentials: request.credentials,
            headers: request.headers,
            url: request.url,
        });
    }, [request]);

    onFetchErrorRef.current = onFetchError;

    useEffect(() => {
        const abortCurrentRequest = () => {
            abortControllerRef.current?.abort();
            abortControllerRef.current = null;
        };

        const revokeObjectUrl = () => {
            if (!objectUrlRef.current) {
                directImageUrlRef.current = null;
                loadedRequestSignatureRef.current = null;
                return;
            }

            URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = null;
            directImageUrlRef.current = null;
            loadedRequestSignatureRef.current = null;
        };

        if (!request || !requestSignature) {
            abortCurrentRequest();
            revokeObjectUrl();
            setState({ status: 'idle' });
            return;
        }

        if (!enabled) {
            abortCurrentRequest();
            setState((currentState) =>
                currentState.displaySrc
                    ? { ...currentState, status: 'loaded' }
                    : { status: 'idle' },
            );
            return;
        }

        if (loadedRequestSignatureRef.current === requestSignature) {
            if (objectUrlRef.current) {
                setState({ displaySrc: objectUrlRef.current, status: 'loaded' });
                return;
            }

            if (directImageUrlRef.current) {
                setState({ displaySrc: directImageUrlRef.current, status: 'loaded' });
                return;
            }
        }

        if (request.skipFetch || isBrowserImageLoadUrl(request.url)) {
            abortCurrentRequest();
            revokeObjectUrl();
            setState({ status: 'loading' });

            const abortController = new AbortController();
            abortControllerRef.current = abortController;

            void (async () => {
                try {
                    const displayUrl = await loadDisplayImageUrl(
                        request.url,
                        abortController.signal,
                    );

                    if (abortController.signal.aborted) {
                        return;
                    }

                    directImageUrlRef.current = displayUrl;
                    loadedRequestSignatureRef.current = requestSignature;
                    setState({ displaySrc: displayUrl, status: 'loaded' });
                } catch {
                    if (abortController.signal.aborted) {
                        return;
                    }

                    revokeObjectUrl();
                    setState({ status: 'error' });
                    onFetchErrorRef.current?.();
                } finally {
                    if (abortControllerRef.current === abortController) {
                        abortControllerRef.current = null;
                    }
                }
            })();

            return () => {
                abortController.abort();

                if (abortControllerRef.current === abortController) {
                    abortControllerRef.current = null;
                }
            };
        }

        abortCurrentRequest();
        revokeObjectUrl();
        setState({ status: 'loading' });

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        void (async () => {
            try {
                const init = {
                    credentials: request.credentials,
                    headers: request.headers,
                    signal: abortController.signal,
                } as RequestInit & { priority?: FetchPriority };

                if (fetchPriority) {
                    init.priority = fetchPriority;
                }

                const response = await fetchImage(request.url, init);

                if (!response.ok) {
                    throw new Error(`Failed to load image: ${response.status}`);
                }

                const blob = await response.blob();

                if (abortController.signal.aborted) {
                    return;
                }

                const objectUrl = URL.createObjectURL(blob);
                objectUrlRef.current = objectUrl;
                loadedRequestSignatureRef.current = requestSignature;
                setState({ displaySrc: objectUrl, status: 'loaded' });
            } catch {
                if (abortController.signal.aborted) {
                    return;
                }

                revokeObjectUrl();
                setState({ status: 'error' });
                onFetchErrorRef.current?.();
            } finally {
                if (abortControllerRef.current === abortController) {
                    abortControllerRef.current = null;
                }
            }
        })();

        return () => {
            abortController.abort();

            if (abortControllerRef.current === abortController) {
                abortControllerRef.current = null;
            }
        };
    }, [enabled, fetchPriority, request, requestSignature]);

    useEffect(() => {
        return () => {
            abortControllerRef.current?.abort();

            if (objectUrlRef.current) {
                URL.revokeObjectURL(objectUrlRef.current);
            }
        };
    }, []);

    return {
        displaySrc: state.displaySrc,
        isError: state.status === 'error',
        isLoaded: state.status === 'loaded',
        isLoading: state.status === 'loading',
    };
}
