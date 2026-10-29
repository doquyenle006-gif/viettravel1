import { getAccessToken, setAccessToken } from "./token";
import { syncServerTime } from "./time";
import type { Meta, SessionUser } from "../types";

const BASE = "/api/v1";

export class ApiError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string>;
  requestId?: string;
  extra?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>, requestId?: string, extra?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.requestId = requestId;
    this.extra = extra;
  }
}

export class NetworkError extends Error {
  constructor(message = "Không thể kết nối máy chủ. Vui lòng kiểm tra đường truyền.") {
    super(message);
    this.name = "NetworkError";
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}

type RefreshHandler = (user: SessionUser, token: string) => void;
let onSessionRefreshed: RefreshHandler | null = null;
let onSessionExpired: (() => void) | null = null;
let refreshPromise: Promise<{ user: SessionUser; token: string } | null> | null = null;

export function setSessionHandlers(handlers: {
  refreshed?: RefreshHandler;
  expired?: () => void;
}): void {
  onSessionRefreshed = handlers.refreshed ?? null;
  onSessionExpired = handlers.expired ?? null;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string | null;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  skipAuthRetry?: boolean;
  timeoutMs?: number;
}

interface Envelope<T> {
  data: T;
  meta?: Meta;
  error?: {
    code?: string;
    message?: string;
    fields?: Record<string, string>;
    requestId?: string;
    [key: string]: unknown;
  };
}

const SESSION_HINT = "vt_has_session";

function hasSessionHint(): boolean {
  return document.cookie.split("; ").some((part) => part === `${SESSION_HINT}=1`);
}

function clearSessionHint(): void {
  document.cookie = `${SESSION_HINT}=; Path=/; SameSite=Lax; Max-Age=0`;
}

async function refreshSession(): Promise<{ user: SessionUser; token: string } | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const response = await fetch(`${BASE}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        clearSessionHint();
        return null;
      }
      const payload = (await response.json()) as Envelope<{ user: SessionUser; accessToken: string }>;
      if (!payload.data) return null;
      setAccessToken(payload.data.accessToken);
      onSessionRefreshed?.(payload.data.user, payload.data.accessToken);
      return { user: payload.data.user, token: payload.data.accessToken };
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 15000;
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort);
  try {
    const token = options.token !== undefined ? options.token : getAccessToken();
    const headers: Record<string, string> = { ...(options.headers || {}) };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;
    headers["X-Request-Id"] = crypto.randomUUID();
    return await fetch(`${BASE}${path}`, {
      method: options.method || "GET",
      headers,
      credentials: "include",
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }
}

export async function apiFull<T>(path: string, options: RequestOptions = {}): Promise<{ data: T; meta?: Meta }> {
  let response: Response;
  try {
    response = await send(path, options);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError" && options.signal?.aborted) throw error;
    throw new NetworkError();
  }

  if (response.status === 401 && !options.skipAuthRetry && !path.startsWith("/auth/")) {
    const refreshed = await refreshSession();
    if (refreshed) {
      try {
        response = await send(path, { ...options, token: refreshed.token, skipAuthRetry: true });
      } catch {
        throw new NetworkError();
      }
    } else {
      setAccessToken(null);
      onSessionExpired?.();
    }
  }

  let payload: Envelope<T>;
  try {
    payload = (await response.json()) as Envelope<T>;
  } catch {
    throw new NetworkError("Máy chủ trả về dữ liệu không hợp lệ.");
  }

  const serverTime = payload.meta?.serverTime || (payload.data as { serverTime?: string } | null)?.serverTime;
  syncServerTime(typeof serverTime === "string" ? serverTime : null);

  if (!response.ok || payload.error) {
    const error = payload.error || {};
    const extra = { ...error };
    delete extra.code;
    delete extra.message;
    delete extra.fields;
    delete extra.requestId;
    throw new ApiError(
      response.status,
      typeof error.code === "string" ? error.code : "INTERNAL_ERROR",
      typeof error.message === "string" ? error.message : "Có lỗi hệ thống. Vui lòng thử lại sau.",
      error.fields,
      typeof error.requestId === "string" ? error.requestId : undefined,
      extra,
    );
  }

  return { data: payload.data, meta: payload.meta };
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const result = await apiFull<T>(path, options);
  return result.data;
}

/** POST /auth/refresh on app start. Returns null for anonymous visitors. */
export async function restoreSession(): Promise<{ user: SessionUser; token: string } | null> {
  if (!hasSessionHint()) {
    setAccessToken(null);
    return null;
  }
  const result = await refreshSession();
  if (!result) {
    clearSessionHint();
    setAccessToken(null);
  }
  return result;
}

export async function refreshCurrentSession(): Promise<SessionUser | null> {
  const result = await refreshSession();
  return result?.user ?? null;
}

export function clearClientSession(): void {
  setAccessToken(null);
  clearSessionHint();
}

export function idempotencyKey(): string {
  return crypto.randomUUID();
}
