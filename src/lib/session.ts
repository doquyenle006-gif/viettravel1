import { create } from "zustand";
import { api, clearClientSession, restoreSession, setSessionHandlers } from "./api";
import { setAccessToken } from "./token";
import type { SessionUser } from "../types";

type SessionStatus = "loading" | "anonymous" | "authenticated";

interface SessionState {
  status: SessionStatus;
  user: SessionUser | null;
  init: () => Promise<void>;
  login: (email: string, password: string, totp?: string) => Promise<SessionUser>;
  register: (payload: {
    fullName: string; email: string; phone?: string; password: string;
    marketingConsent?: boolean; termsAccepted: boolean;
  }) => Promise<SessionUser>;
  refreshMe: () => Promise<SessionUser | null>;
  setUser: (user: SessionUser) => void;
  logout: () => Promise<void>;
}

let initPromise: Promise<void> | null = null;

export const useSessionStore = create<SessionState>((set, get) => ({
  status: "loading",
  user: null,

  init: async () => {
    if (get().status !== "loading") return;
    if (initPromise) return initPromise;
    initPromise = (async () => {
      const restored = await restoreSession();
      if (restored) {
        set({ status: "authenticated", user: restored.user });
      } else {
        set({ status: "anonymous", user: null });
      }
    })().finally(() => {
      initPromise = null;
    });
    return initPromise;
  },

  login: async (email, password, totp) => {
    setAccessToken(null);
    const result = await api<{ user: SessionUser; accessToken: string }>("/auth/login", {
      method: "POST",
      body: { email, password, totp },
      token: null,
      skipAuthRetry: true,
    });
    setAccessToken(result.accessToken);
    set({ status: "authenticated", user: result.user });
    return result.user;
  },

  register: async (payload) => {
    setAccessToken(null);
    const result = await api<{ user: SessionUser; accessToken: string; requiresVerification: boolean }>("/auth/register", {
      method: "POST",
      body: payload,
      token: null,
      skipAuthRetry: true,
    });
    setAccessToken(result.accessToken);
    set({ status: "authenticated", user: result.user });
    return result.user;
  },

  refreshMe: async () => {
    try {
      const result = await api<{ user: SessionUser }>("/me");
      set({ status: "authenticated", user: result.user });
      return result.user;
    } catch {
      return null;
    }
  },

  setUser: (user) => set({ user, status: "authenticated" }),

  logout: async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      // Cookie may already be invalid; local state still needs to be cleared.
    }
    clearClientSession();
    set({ status: "anonymous", user: null });
    broadcastLogout();
  },
}));

const sessionChannel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("viettrails-session") : null;
function broadcastLogout() {
  sessionChannel?.postMessage("logout");
}
if (sessionChannel) {
  sessionChannel.addEventListener("message", (event) => {
    if (event.data !== "logout") return;
    clearClientSession();
    useSessionStore.setState({ status: "anonymous", user: null });
  });
}

setSessionHandlers({
  refreshed: (user, token) => {
    setAccessToken(token);
    useSessionStore.setState({ user, status: "authenticated" });
  },
  expired: () => {
    useSessionStore.setState({ user: null, status: "anonymous" });
  },
});

export function useSession() {
  const status = useSessionStore((state) => state.status);
  const user = useSessionStore((state) => state.user);
  return { status, user };
}

export function useCan(permission: string): boolean {
  const user = useSessionStore((state) => state.user);
  return Boolean(user?.permissions.includes(permission));
}
