import { useEffect, useState } from "react";
import { ApiError, apiFull, isApiError, isNetworkError, NetworkError } from "./api";
import type { Meta } from "../types";

interface ApiState<T> {
  data: T | null;
  meta?: Meta;
  loading: boolean;
  error: ApiError | NetworkError | null;
}

/**
 * Lightweight server-state hook: abortable fetch, manual reload, no shared cache.
 * Money/seat/state truth always comes from the server payload.
 */
export function useApi<T>(path: string | null, deps: readonly unknown[] = []): ApiState<T> & { reload: () => void; setData: (data: T) => void } {
  const [state, setState] = useState<ApiState<T>>({ data: null, loading: Boolean(path), error: null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!path) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    const controller = new AbortController();
    setState((prev) => ({ data: prev.data, meta: prev.meta, loading: true, error: null }));
    apiFull<T>(path, { signal: controller.signal })
      .then(({ data, meta }) => setState({ data, meta, loading: false, error: null }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (isApiError(error) || isNetworkError(error)) {
          setState({ data: null, loading: false, error });
        } else {
          setState({ data: null, loading: false, error: new NetworkError() });
        }
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, nonce, ...deps]);

  return {
    ...state,
    reload: () => setNonce((value) => value + 1),
    setData: (data: T) => setState({ data, loading: false, error: null }),
  };
}

export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title ? `${title} — VietTrails` : "VietTrails";
  }, [title]);
}

export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
