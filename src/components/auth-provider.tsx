"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { fetchWithDedupe, invalidateCacheKey, setCached } from "@/lib/client/fetch-cache";

const SESSION_SUPERSEDED_CODE = "SESSION_SUPERSEDED";

export type LastLoginInfo = {
  at: string | null;
  ip: string | null;
  device: string | null;
};

export type AuthUser = {
  id: string;
  fullName: string;
  email: string;
  nationalId?: string | null;
  phone?: string | null;
  role: "SUPER_ADMIN" | "ADMIN" | "EMPLOYEE";
  hourlyRate?: number;
  mustChangePassword?: boolean;
  /** he | ar | en */
  language?: string;
  permissions: string[];
  lastLogin?: LastLoginInfo;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  refresh: (opts?: { sync?: boolean }) => Promise<void>;
  setSessionUser: (user: AuthUser | null) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const AUTH_CACHE_MS = 20_000;
const AUTH_KEY = "auth-me";
const AUTH_SYNC_KEY = "auth-me-sync";
const SESSION_POLL_MS = 5_000;

type MeResponse = {
  ok?: boolean;
  user?: AuthUser | null;
  code?: string;
};

function redirectToLoginSuperseded(): void {
  invalidateCacheKey(AUTH_KEY);
  invalidateCacheKey(AUTH_SYNC_KEY);
  window.location.href = "/login?reason=superseded";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const initialDone = useRef(false);
  /**
   * מונה דור — כל login/logout מעלה אותו כדי שתשובות /me ישנות
   * (שהתחילו לפני הקוקי החדש) לא ידרסו את המשתמש ב־client.
   */
  const sessionGen = useRef(0);

  const refresh = useCallback(async (opts?: { sync?: boolean }) => {
    const sync = opts?.sync ?? false;
    const key = sync ? AUTH_SYNC_KEY : AUTH_KEY;
    const ttl = sync ? 0 : AUTH_CACHE_MS;
    const gen = sessionGen.current;

    if (sync) invalidateCacheKey(AUTH_KEY);

    const data = await fetchWithDedupe<MeResponse>(
      key,
      async () => {
        const res = await fetch(`/api/auth/me${sync ? "?sync=1" : ""}`, {
          credentials: "same-origin",
        });
        return (await res.json()) as MeResponse;
      },
      ttl,
    );

    // תשובה מיושנת אחרי setSessionUser / logout — מתעלמים
    if (gen !== sessionGen.current) return;

    if (data.code === SESSION_SUPERSEDED_CODE) {
      setUser(null);
      setLoading(false);
      redirectToLoginSuperseded();
      return;
    }

    setUser(data.user ?? null);
    setLoading(false);
  }, []);

  const setSessionUser = useCallback((next: AuthUser | null) => {
    sessionGen.current += 1;
    invalidateCacheKey(AUTH_KEY);
    invalidateCacheKey(AUTH_SYNC_KEY);
    if (next) setCached(AUTH_KEY, { user: next }, AUTH_CACHE_MS);
    setUser(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (initialDone.current) return;
    initialDone.current = true;
    void refresh();
  }, [refresh]);

  /** בדיקת session פעיל — כל 5 שניות + בעת חזרה לטאב */
  useEffect(() => {
    if (!user) return;

    const poll = () => void refresh({ sync: true });

    const interval = window.setInterval(poll, SESSION_POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") poll();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user, refresh]);

  const logout = useCallback(async () => {
    sessionGen.current += 1;
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    invalidateCacheKey(AUTH_KEY);
    invalidateCacheKey(AUTH_SYNC_KEY);
    setUser(null);
    window.location.href = "/login";
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, refresh, setSessionUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
