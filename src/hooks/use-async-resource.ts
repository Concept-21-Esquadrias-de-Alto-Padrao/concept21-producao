"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type CacheEntry<T> = {
  data?: T;
  error?: Error;
  promise?: Promise<T>;
  updatedAt: number;
};

type AsyncResourceOptions = {
  enabled?: boolean;
  refreshOnMount?: boolean;
  ttlMs?: number;
};

type AsyncResourceState<T> = {
  data: T | null;
  error: Error | null;
  loading: boolean;
  refreshing: boolean;
};

const resourceCache = new Map<string, CacheEntry<unknown>>();

function normalizeError(error: unknown) {
  return error instanceof Error ? error : new Error("Não foi possível carregar os dados.");
}

function readCache<T>(key: string) {
  return resourceCache.get(key) as CacheEntry<T> | undefined;
}

function isFresh(entry: CacheEntry<unknown> | undefined, ttlMs: number) {
  return Boolean(entry?.data !== undefined && Date.now() - entry.updatedAt < ttlMs);
}

export function invalidateAsyncResource(key: string) {
  resourceCache.delete(key);
}

export function setAsyncResourceData<T>(key: string, data: T) {
  resourceCache.set(key, {
    data,
    updatedAt: Date.now(),
  });
}

export function useAsyncResource<T>(
  key: string,
  loader: () => Promise<T>,
  options: AsyncResourceOptions = {},
) {
  const enabled = options.enabled ?? true;
  const refreshOnMount = options.refreshOnMount ?? true;
  const ttlMs = options.ttlMs ?? 30000;
  const initial = readCache<T>(key);
  const loaderRef = useRef(loader);
  const [state, setState] = useState<AsyncResourceState<T>>({
    data: initial?.data ?? null,
    error: initial?.error ?? null,
    loading: enabled && initial?.data === undefined,
    refreshing: enabled && initial?.data !== undefined && refreshOnMount && !isFresh(initial, ttlMs),
  });

  useEffect(() => {
    loaderRef.current = loader;
  }, [loader]);

  const setData = useCallback(
    (updater: T | null | ((current: T | null) => T | null)) => {
      setState((current) => {
        const nextData =
          typeof updater === "function"
            ? (updater as (current: T | null) => T | null)(current.data)
            : updater;

        if (nextData === null) {
          resourceCache.delete(key);
        } else {
          setAsyncResourceData(key, nextData);
        }

        return {
          data: nextData,
          error: null,
          loading: false,
          refreshing: false,
        };
      });
    },
    [key],
  );

  const load = useCallback(
    async (force = false) => {
      if (!enabled) return null;

      const cached = readCache<T>(key);
      if (!force && isFresh(cached, ttlMs)) {
        setState({
          data: cached?.data ?? null,
          error: cached?.error ?? null,
          loading: false,
          refreshing: false,
        });
        return cached?.data ?? null;
      }

      const promise = cached?.promise ?? loaderRef.current();
      if (!cached?.promise) {
        resourceCache.set(key, {
          ...cached,
          promise,
          updatedAt: cached?.updatedAt ?? 0,
        });
      }

      setState((current) => ({
        ...current,
        loading: current.data === null,
        refreshing: current.data !== null,
        error: null,
      }));

      try {
        const data = await promise;
        setAsyncResourceData(key, data);
        setState({
          data,
          error: null,
          loading: false,
          refreshing: false,
        });
        return data;
      } catch (error) {
        const normalized = normalizeError(error);
        const stale = readCache<T>(key)?.data ?? null;
        resourceCache.set(key, {
          data: stale ?? undefined,
          error: normalized,
          updatedAt: Date.now(),
        });
        setState({
          data: stale,
          error: normalized,
          loading: false,
          refreshing: false,
        });
        throw normalized;
      }
    },
    [enabled, key, ttlMs],
  );

  const reload = useCallback(() => load(true), [load]);

  const invalidate = useCallback(() => {
    invalidateAsyncResource(key);
    setState({
      data: null,
      error: null,
      loading: enabled,
      refreshing: false,
    });
  }, [enabled, key]);

  useEffect(() => {
    let active = true;

    function setStateAfterEffect(nextState: AsyncResourceState<T> | ((current: AsyncResourceState<T>) => AsyncResourceState<T>)) {
      window.setTimeout(() => {
        if (!active) return;
        setState(nextState);
      }, 0);
    }

    if (!enabled) {
      setStateAfterEffect((current) => ({
        ...current,
        loading: false,
        refreshing: false,
      }));
      return () => {
        active = false;
      };
    }

    const cached = readCache<T>(key);
    if (cached?.data !== undefined) {
      setStateAfterEffect({
        data: cached.data,
        error: cached.error ?? null,
        loading: false,
        refreshing: refreshOnMount && !isFresh(cached, ttlMs),
      });
    }

    if (!refreshOnMount && cached?.data !== undefined) {
      return () => {
        active = false;
      };
    }

    const loadTimeout = window.setTimeout(() => {
      if (!active) return;
      void load().catch(() => undefined);
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(loadTimeout);
    };
  }, [enabled, key, load, refreshOnMount, ttlMs]);

  return {
    ...state,
    reload,
    setData,
    invalidate,
  };
}
