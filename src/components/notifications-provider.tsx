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
import { useAuth } from "@/components/auth-provider";
import { useToast } from "@/components/toast-provider";
import { NOTIFICATIONS_REFRESH_EVENT } from "@/lib/notifications/refresh-event";
import { fetchWithDedupe, invalidateCacheKey } from "@/lib/client/fetch-cache";

export type InboxKind = "employee" | "admin";

export type NotifItem = {
  id: string;
  type: string;
  section: string;
  title: string;
  message: string;
  priority?: string;
  color: string | null;
  isRead: boolean;
  actionUrl?: string | null;
  createdAt: string;
};

type InboxPayload = {
  unreadCount: number;
  items: NotifItem[];
  inbox: InboxKind;
};

type NotificationsContextValue = {
  unread: number;
  items: NotifItem[];
  inbox: InboxKind;
  loading: boolean;
  refresh: (opts?: { force?: boolean }) => Promise<void>;
  applyLocalRead: (ids: string[]) => void;
  setAllReadLocally: () => void;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

const POLL_MS = 60_000;
const CACHE_MS = 60_000;
const REFRESH_DEBOUNCE_MS = 4_000;
const CACHE_KEY = "me-notifications";

function toastForNewNotification(item: NotifItem): { title: string; description?: string } {
  if (item.type === "TASK_ASSIGNED") {
    return { title: "נוספה לך משימה חדשה", description: item.message || item.title };
  }
  if (item.type === "TASK_COMPLETED") {
    return { title: item.title, description: item.message };
  }
  if (item.type === "NEW_UPDATE") {
    return { title: "פורסם עדכון חדש", description: item.message };
  }
  return { title: item.title, description: item.message || undefined };
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotifItem[]>([]);
  const [inbox, setInbox] = useState<InboxKind>("employee");
  const [loading, setLoading] = useState(true);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const initialLoadRef = useRef(true);
  const itemsRef = useRef<NotifItem[]>([]);
  const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyPayload = useCallback(
    (data: InboxPayload, showNewToasts: boolean) => {
      setUnread(data.unreadCount);
      setItems(data.items);
      itemsRef.current = data.items;
      setInbox(data.inbox);
      setLoading(false);

      if (!showNewToasts) {
        for (const it of data.items) knownIdsRef.current.add(it.id);
        return;
      }

      const fresh = data.items.filter((it) => !it.isRead && !knownIdsRef.current.has(it.id));
      for (const it of data.items) knownIdsRef.current.add(it.id);

      if (initialLoadRef.current) {
        initialLoadRef.current = false;
        return;
      }

      for (const it of fresh.slice(0, 3)) {
        const toast = toastForNewNotification(it);
        showToast({
          tone: "info",
          title: toast.title,
          description: toast.description,
          durationMs: 5000,
        });
      }
    },
    [showToast],
  );

  const refresh = useCallback(
    async (opts?: { force?: boolean }) => {
      if (opts?.force) invalidateCacheKey(CACHE_KEY);
      try {
        const data = await fetchWithDedupe<InboxPayload | null>(
          CACHE_KEY,
          async () => {
            const res = await fetch("/api/me/notifications", {
              credentials: "same-origin",
            });
            if (!res.ok) return null;
            const j = (await res.json()) as {
              ok?: boolean;
              data?: InboxPayload;
            };
            if (!j.ok || !j.data) return null;
            return j.data;
          },
          opts?.force ? 0 : CACHE_MS,
        );
        if (!data) return;
        applyPayload(data, true);
      } catch {
        setLoading(false);
      }
    },
    [applyPayload],
  );

  useEffect(() => {
    if (!user) {
      setUnread(0);
      setItems([]);
      setLoading(false);
      return;
    }
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    const onRefresh = () => {
      if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
      refreshDebounceRef.current = setTimeout(() => void refresh({ force: true }), REFRESH_DEBOUNCE_MS);
    };
    window.addEventListener(NOTIFICATIONS_REFRESH_EVENT, onRefresh);
    return () => {
      clearInterval(timer);
      if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
      window.removeEventListener(NOTIFICATIONS_REFRESH_EVENT, onRefresh);
    };
  }, [user, refresh]);

  const applyLocalRead = useCallback((ids: string[]) => {
    if (!ids.length) return;
    const idSet = new Set(ids);
    let decrement = 0;
    for (const it of itemsRef.current) {
      if (idSet.has(it.id) && !it.isRead) decrement += 1;
    }
    setItems((prev) => {
      const next = prev.map((it) => (idSet.has(it.id) ? { ...it, isRead: true } : it));
      itemsRef.current = next;
      return next;
    });
    setUnread((prev) => Math.max(0, prev - decrement));
  }, []);

  const setAllReadLocally = useCallback(() => {
    setItems((prev) => {
      const next = prev.map((it) => ({ ...it, isRead: true }));
      itemsRef.current = next;
      return next;
    });
    setUnread(0);
  }, []);

  return (
    <NotificationsContext.Provider
      value={{
        unread,
        items,
        inbox,
        loading,
        refresh,
        applyLocalRead,
        setAllReadLocally,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotificationsInbox() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error("useNotificationsInbox must be used within NotificationsProvider");
  }
  return ctx;
}
