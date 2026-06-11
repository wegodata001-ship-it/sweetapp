"use client";

import { CheckCircle2, Loader2, Pencil, Plus, StickyNote, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { useToast } from "@/components/toast-provider";
import { dispatchNotificationsRefresh } from "@/lib/notifications/refresh-event";
import type { SerializedEmployeeNote } from "@/lib/employee-notes/employee-notes-service";

type NoteStatus = "open" | "completed";
type NotePriority = "NORMAL" | "HIGH" | "URGENT";

type NoteFormState = {
  id: string | null;
  title: string;
  content: string;
  priority: NotePriority;
  saving: boolean;
};

const EMPTY_FORM: NoteFormState = {
  id: null,
  title: "",
  content: "",
  priority: "NORMAL",
  saving: false,
};

function priorityTone(priority: NotePriority): string {
  switch (priority) {
    case "URGENT":
      return "border-rose-200 bg-rose-50 text-rose-800";
    case "HIGH":
      return "border-amber-200 bg-amber-50 text-amber-900";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

export function MyNotesClient() {
  const { t, dir, locale } = useI18n();
  const { user } = useAuth();
  const { showToast } = useToast();
  const searchParams = useSearchParams();

  const [status, setStatus] = useState<NoteStatus>("open");
  const [notes, setNotes] = useState<SerializedEmployeeNote[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<NoteFormState>(EMPTY_FORM);

  const bcp47 = locale === "ar" ? "ar-EG" : locale === "en" ? "en-US" : "he-IL";

  const formatDate = useCallback(
    (iso: string) =>
      new Date(iso).toLocaleDateString(bcp47, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }),
    [bcp47],
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/me/employee-notes?status=${status}&_=${Date.now()}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        data?: { notes: SerializedEmployeeNote[]; openCount: number };
        error?: string;
      };
      if (!res.ok || !json.ok || !json.data) {
        showToast({
          tone: "error",
          title: t("myNotes.loadError"),
          description: json.error ?? "",
        });
        return;
      }
      setNotes(json.data.notes);
      setOpenCount(json.data.openCount);
    } finally {
      setLoading(false);
    }
  }, [showToast, status, t]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  useEffect(() => {
    const noteId = searchParams.get("id");
    if (!noteId || loading) return;
    const target = notes.find((n) => n.id === noteId);
    if (target && !target.isCompleted) {
      setStatus("open");
    }
  }, [loading, notes, searchParams]);

  const priorityLabel = useCallback(
    (priority: NotePriority) => {
      switch (priority) {
        case "URGENT":
          return t("myNotes.priorityUrgent");
        case "HIGH":
          return t("myNotes.priorityHigh");
        default:
          return t("myNotes.priorityNormal");
      }
    },
    [t],
  );

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (note: SerializedEmployeeNote) => {
    setForm({
      id: note.id,
      title: note.title,
      content: note.content ?? "",
      priority: note.priority,
      saving: false,
    });
    setFormOpen(true);
  };

  const saveNote = async () => {
    const title = form.title.trim();
    if (!title) {
      showToast({ tone: "error", title: t("myNotes.titleRequired") });
      return;
    }
    setForm((f) => ({ ...f, saving: true }));
    try {
      const isEdit = Boolean(form.id);
      const res = await fetch(
        isEdit ? `/api/me/employee-notes/${encodeURIComponent(form.id!)}` : "/api/me/employee-notes",
        {
          method: isEdit ? "PATCH" : "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            content: form.content.trim() || null,
            priority: form.priority,
          }),
        },
      );
      const json = (await res.json()) as {
        ok?: boolean;
        data?: { note: SerializedEmployeeNote; openCount: number };
        error?: string;
      };
      if (!res.ok || !json.ok || !json.data) {
        showToast({
          tone: "error",
          title: t("myNotes.saveError"),
          description: json.error ?? "",
        });
        return;
      }
      setOpenCount(json.data.openCount);
      setFormOpen(false);
      setForm(EMPTY_FORM);
      showToast({
        tone: "success",
        title: isEdit ? t("myNotes.updated") : t("myNotes.created"),
      });
      dispatchNotificationsRefresh();
      await load();
    } finally {
      setForm((f) => ({ ...f, saving: false }));
    }
  };

  const completeNote = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/me/employee-notes/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete" }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        data?: { openCount: number };
        error?: string;
      };
      if (!res.ok || !json.ok) {
        showToast({
          tone: "error",
          title: t("myNotes.completeError"),
          description: json.error ?? "",
        });
        return;
      }
      setOpenCount(json.data?.openCount ?? Math.max(0, openCount - 1));
      showToast({ tone: "success", title: t("myNotes.completed") });
      dispatchNotificationsRefresh();
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const deleteNote = async (id: string) => {
    if (!window.confirm(t("myNotes.deleteConfirm"))) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/me/employee-notes/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        data?: { openCount: number };
        error?: string;
      };
      if (!res.ok || !json.ok) {
        showToast({
          tone: "error",
          title: t("myNotes.deleteError"),
          description: json.error ?? "",
        });
        return;
      }
      setOpenCount(json.data?.openCount ?? openCount);
      showToast({ tone: "success", title: t("myNotes.deleted") });
      dispatchNotificationsRefresh();
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const highlightedId = searchParams.get("id");
  const emptyMessage = useMemo(
    () => (status === "open" ? t("myNotes.emptyOpen") : t("myNotes.emptyCompleted")),
    [status, t],
  );

  return (
    <div dir={dir} className="mx-auto max-w-3xl space-y-5 p-3 md:p-6">
      <header className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-slate-500">
              {t("myNotes.eyebrow")}
            </p>
            <h1 className="mt-1 flex items-center gap-2 text-xl font-black text-slate-900 md:text-2xl">
              <StickyNote className="h-6 w-6 text-[#c9a227]" aria-hidden />
              {t("myNotes.title")}
            </h1>
            <p className="mt-1 text-sm text-slate-600">{t("myNotes.subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#071826] px-4 py-2 text-sm font-black text-white shadow-sm hover:bg-[#0f2740]"
          >
            <Plus className="h-4 w-4" aria-hidden />
            {t("myNotes.addNote")}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <TabButton
            active={status === "open"}
            onClick={() => setStatus("open")}
            label={`🟡 ${t("myNotes.tabOpen")}`}
            count={openCount}
          />
          <TabButton
            active={status === "completed"}
            onClick={() => setStatus("completed")}
            label={`🟢 ${t("myNotes.tabCompleted")}`}
          />
        </div>
      </header>

      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-slate-400" aria-hidden />
        </div>
      ) : notes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
          <StickyNote className="mx-auto h-8 w-8 text-slate-300" aria-hidden />
          <p className="mt-3 text-base font-black text-slate-700">{emptyMessage}</p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" aria-hidden />
            {t("myNotes.addNote")}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <article
              key={note.id}
              id={`note-${note.id}`}
              className={`rounded-2xl border bg-white p-4 shadow-sm ring-1 ring-slate-200 transition ${
                highlightedId === note.id ? "border-[#c9a227] ring-[#c9a227]/40" : "border-slate-200"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-black ${priorityTone(note.priority)}`}
                    >
                      {priorityLabel(note.priority)}
                    </span>
                    {note.isCompleted ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                        {t("myNotes.doneBadge")}
                      </span>
                    ) : null}
                  </div>
                  <h2 className="mt-2 text-base font-black text-slate-900">📌 {note.title}</h2>
                  {note.content ? (
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
                      {note.content}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
                <div className="space-y-0.5">
                  <p>
                    {t("myNotes.createdAt")}: {formatDate(note.createdAt)}
                  </p>
                  <p>
                    {t("myNotes.createdBy")}: {note.createdByName || user?.fullName || "—"}
                  </p>
                  {note.completedAt ? (
                    <p>
                      {t("myNotes.completedAt")}: {formatDate(note.completedAt)}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {!note.isCompleted ? (
                    <>
                      <button
                        type="button"
                        disabled={busyId === note.id}
                        onClick={() => void completeNote(note.id)}
                        className="inline-flex min-h-[40px] items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {busyId === note.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                        )}
                        {t("myNotes.completeBtn")}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === note.id}
                        onClick={() => openEdit(note)}
                        className="inline-flex min-h-[40px] items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                        {t("myNotes.editBtn")}
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    disabled={busyId === note.id}
                    onClick={() => void deleteNote(note.id)}
                    className="inline-flex min-h-[40px] items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    {t("myNotes.deleteBtn")}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {formOpen ? (
        <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 p-3 sm:items-center">
          <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl ring-1 ring-slate-200 sm:p-5">
            <h2 className="text-lg font-black text-slate-900">
              {form.id ? t("myNotes.editTitle") : t("myNotes.newTitle")}
            </h2>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-xs font-bold text-slate-600">{t("myNotes.fieldTitle")}</span>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900 outline-none ring-[#c9a227]/30 focus:ring-2"
                  placeholder={t("myNotes.fieldTitlePlaceholder")}
                  autoFocus
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-600">{t("myNotes.fieldContent")}</span>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  rows={4}
                  className="mt-1 w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none ring-[#c9a227]/30 focus:ring-2"
                  placeholder={t("myNotes.fieldContentPlaceholder")}
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-600">{t("myNotes.fieldPriority")}</span>
                <select
                  value={form.priority}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, priority: e.target.value as NotePriority }))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900 outline-none ring-[#c9a227]/30 focus:ring-2"
                >
                  <option value="NORMAL">{t("myNotes.priorityNormal")}</option>
                  <option value="HIGH">{t("myNotes.priorityHigh")}</option>
                  <option value="URGENT">{t("myNotes.priorityUrgent")}</option>
                </select>
              </label>
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setFormOpen(false);
                  setForm(EMPTY_FORM);
                }}
                className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={form.saving}
                onClick={() => void saveNote()}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#071826] px-4 py-2 text-sm font-black text-white hover:bg-[#0f2740] disabled:opacity-50"
              >
                {form.saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {t("common.save")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl px-3 py-2 text-sm font-black transition ${
        active
          ? "bg-[#071826] text-white shadow-sm"
          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {label}
      {typeof count === "number" && count > 0 ? (
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-black ${
            active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"
          }`}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}
