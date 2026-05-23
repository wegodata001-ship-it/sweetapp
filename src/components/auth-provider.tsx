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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const initialDone = useRef(false);

  const refresh = useCallback(async (opts?: { sync?: boolean }) => {
    const sync = opts?.sync ?? false;
    const key = sync ? AUTH_SYNC_KEY : AUTH_KEY;
    const ttl = sync ? 0 : AUTH_CACHE_MS;

    if (sync) invalidateCacheKey(AUTH_KEY);

    const data = await fetchWithDedupe<{ user?: AuthUser | null }>(
      key,
      async () => {
        const res = await fetch(`/api/auth/me${sync ? "?sync=1" : ""}`, {
          credentials: "same-origin",
        });
        return (await res.json()) as { user?: AuthUser | null };
      },
      ttl,
    );
    setUser(data.user ?? null);
    setLoading(false);
  }, []);

  const setSessionUser = useCallback((next: AuthUser | null) => {
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

  /** סנכרון הרשאות מה-DB + JWT מעודכן — כל 60 שניות בלבד */
  useEffect(() => {
    if (!user) return;
    const interval = window.setInterval(() => {
      void refresh({ sync: true });
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [user, refresh]);

  const logout = useCallback(async () => {
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
