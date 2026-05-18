"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  XCircle,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/i18n-provider";

/**
 * Lightweight toast system used by the tasks redesign (and reusable elsewhere).
 *
 * Usage:
 *
 *   const { showToast } = useToast();
 *   showToast({ tone: "success", title: t("toasts.fileUploaded") });
 *
 * Notes:
 * - Renders into document.body via a portal so the toasts stack above modals.
 * - Auto-dismisses after `duration` ms (default 4500).
 * - Tones map to the same accent colors used elsewhere in the app.
 */

export type ToastTone = "success" | "error" | "warning" | "info";

export type ToastInput = {
  tone?: ToastTone;
  title: string;
  description?: string;
  durationMs?: number;
};

type ToastItem = ToastInput & { id: string; createdAt: number };

type ToastContextValue = {
  showToast: (toast: ToastInput) => string;
  dismissToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counterRef = useRef(0);
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const handle = timeoutsRef.current.get(id);
    if (handle) {
      clearTimeout(handle);
      timeoutsRef.current.delete(id);
    }
  }, []);

  const showToast = useCallback(
    (input: ToastInput) => {
      counterRef.current += 1;
      const id = `toast-${Date.now()}-${counterRef.current}`;
      const tone: ToastTone = input.tone ?? "info";
      const duration = input.durationMs ?? (tone === "error" ? 6000 : 4500);
      const next: ToastItem = {
        id,
        createdAt: Date.now(),
        ...input,
        tone,
      };
      setToasts((prev) => [...prev.slice(-4), next]);
      const handle = setTimeout(() => dismissToast(id), duration);
      timeoutsRef.current.set(id, handle);
      return id;
    },
    [dismissToast],
  );

  useEffect(() => {
    const map = timeoutsRef.current;
    return () => {
      for (const handle of map.values()) clearTimeout(handle);
      map.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({ showToast, dismissToast }),
    [showToast, dismissToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

const TONE_STYLES: Record<ToastTone, { bg: string; ring: string; icon: typeof CheckCircle2 }> = {
  success: {
    bg: "bg-emerald-50 text-emerald-950",
    ring: "ring-emerald-200",
    icon: CheckCircle2,
  },
  error: { bg: "bg-rose-50 text-rose-950", ring: "ring-rose-200", icon: XCircle },
  warning: {
    bg: "bg-amber-50 text-amber-950",
    ring: "ring-amber-200",
    icon: AlertTriangle,
  },
  info: { bg: "bg-slate-50 text-slate-900", ring: "ring-slate-200", icon: Info },
};

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  const { dir } = useI18n();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);
  if (!mounted || typeof document === "undefined") return null;
  return createPortal(
    <div
      dir={dir}
      aria-live="polite"
      className={`pointer-events-none fixed bottom-4 z-[120] flex w-full max-w-md flex-col gap-2 px-4 ${
        dir === "rtl" ? "right-0" : "left-0"
      } md:bottom-6 ${dir === "rtl" ? "md:right-6" : "md:left-6"}`}
    >
      {toasts.map((toast) => {
        const tone = TONE_STYLES[toast.tone ?? "info"];
        const Icon = tone.icon;
        return (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-3 rounded-xl ring-1 ${tone.ring} ${tone.bg} px-4 py-3 shadow-lg backdrop-blur transition-all`}
          >
            <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <div className="flex-1 text-sm">
              <p className="font-black">{toast.title}</p>
              {toast.description ? (
                <p className="mt-0.5 text-xs opacity-80">{toast.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="rounded-md p-1 text-current/70 transition hover:bg-black/5"
              aria-label="dismiss"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
