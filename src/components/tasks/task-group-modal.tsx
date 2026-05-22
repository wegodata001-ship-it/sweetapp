"use client";

import {
  CheckCircle2,
  Clock,
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Plus,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { useI18n } from "@/components/i18n-provider";
import { useToast } from "@/components/toast-provider";
import {
  detailToSummary,
  type TaskGroupChangeEvent,
} from "@/components/tasks/task-group-types";
export type TaskGroupMemberDto = {
  id: string;
  user_id: string;
  full_name: string;
  email: string | null;
  role: string | null;
};

export type TaskFileDto = {
  id: string;
  group_id: string;
  title: string;
  file_url: string;
  file_name: string;
  file_type: string;
  size_bytes: number | null;
  storage_path: string | null;
  uploaded_by_id: string | null;
  uploaded_by_name: string | null;
  created_at: string;
};

export type TaskGroupDetailDto = {
  id: string;
  title: string;
  color: string | null;
  description: string | null;
  due_date: string | null;
  status: string;
  task_count: number;
  open_task_count: number;
  completed_task_count: number;
  file_count: number;
  member_count: number;
  members: TaskGroupMemberDto[];
  files: TaskFileDto[];
  tasks: { id: string; title?: string; status?: string }[];
  created_at: string;
  updated_at: string;
};

export type EmployeeOption = {
  id: string;
  fullName: string;
  email: string;
  role: string;
};

type Props = {
  open: boolean;
  groupId: string | null;
  employees: EmployeeOption[];
  canManage: boolean;
  onClose: () => void;
  /** Called after any mutation that should refresh the parent list */
  onChanged?: (event?: TaskGroupChangeEvent) => void;
};

type TabId = "tasks" | "files" | "members" | "notes";

const ACCEPTED_FILE_EXTS =
  ".pdf,.png,.jpg,.jpeg,.webp,.gif,.zip,.doc,.docx,.xls,.xlsx,.csv,.txt";

const MAX_FILE_BYTES = 25 * 1024 * 1024;

function formatBytes(n: number | null | undefined): string {
  if (!n || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fileIcon(mime: string) {
  if (mime.startsWith("image/")) return ImageIcon;
  if (mime === "application/pdf") return FileText;
  return Paperclip;
}

export function TaskGroupModal({
  open,
  groupId,
  employees,
  canManage,
  onClose,
  onChanged,
}: Props) {
  if (!open || !groupId) return null;
  return (
    <TaskGroupModalContent
      groupId={groupId}
      employees={employees}
      canManage={canManage}
      onClose={onClose}
      onChanged={onChanged}
    />
  );
}

type ContentProps = {
  groupId: string;
  employees: EmployeeOption[];
  canManage: boolean;
  onClose: () => void;
  onChanged?: (event?: TaskGroupChangeEvent) => void;
};

function TaskGroupModalContent({
  groupId,
  employees,
  canManage,
  onClose,
  onChanged,
}: ContentProps) {
  const { t, dir, bcp47 } = useI18n();
  const { showToast } = useToast();

  const [data, setData] = useState<TaskGroupDetailDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>("tasks");

  const [uploadingCount, setUploadingCount] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftColor, setDraftColor] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftDueDate, setDraftDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingMembers, setSavingMembers] = useState(false);
  const [memberEdit, setMemberEdit] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/task-groups/${encodeURIComponent(groupId)}`, {
        credentials: "same-origin",
      });
      const json = (await res.json()) as
        | { ok: true; data: TaskGroupDetailDto }
        | { ok: false; error?: string };
      if (!json.ok) {
        setLoadError(json.error ?? t("taskGroups.modal.errLoad"));
        return;
      }
      setData(json.data);
      setDraftTitle(json.data.title);
      setDraftColor(json.data.color ?? "");
      setDraftDescription(json.data.description ?? "");
      setDraftDueDate(json.data.due_date ?? "");
      setMemberEdit(new Set(json.data.members.map((m) => m.user_id)));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : t("taskGroups.modal.errLoad"));
    } finally {
      setLoading(false);
    }
  }, [groupId, t]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const uploadFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    for (const f of list) {
      if (f.size > MAX_FILE_BYTES) {
        showToast({
          tone: "error",
          title: t("taskGroups.toast.fileTooLargeTitle"),
          description: t("taskGroups.toast.fileTooLargeDesc", { name: f.name }),
        });
        continue;
      }
      setUploadingCount((c) => c + 1);
      try {
        const fd = new FormData();
        fd.append("file", f);
        const res = await fetch(
          `/api/task-groups/${encodeURIComponent(groupId)}/files`,
          { method: "POST", body: fd, credentials: "same-origin" },
        );
        const json = (await res.json()) as
          | { ok: true; data: TaskFileDto }
          | { ok: false; error?: string };
        if (!json.ok) {
          showToast({
            tone: "error",
            title: t("taskGroups.toast.uploadFailedTitle"),
            description: json.error ?? f.name,
          });
        } else {
          setData((prev) => {
            if (!prev) return prev;
            const next = {
              ...prev,
              files: [json.data, ...prev.files],
              file_count: prev.file_count + 1,
            };
            onChanged?.({ type: "updated", summary: detailToSummary(next) });
            return next;
          });
          showToast({
            tone: "success",
            title: t("taskGroups.toast.uploadOkTitle"),
            description: f.name,
          });
        }
      } catch (e) {
        showToast({
          tone: "error",
          title: t("taskGroups.toast.uploadFailedTitle"),
          description: e instanceof Error ? e.message : String(e),
        });
      } finally {
        setUploadingCount((c) => Math.max(0, c - 1));
      }
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    void uploadFiles(e.dataTransfer.files);
  };

  const handleDeleteFile = async (file: TaskFileDto) => {
    if (!window.confirm(t("taskGroups.modal.confirmDeleteFile", { name: file.title }))) return;
    const res = await fetch(`/api/task-files/${encodeURIComponent(file.id)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    if (res.ok) {
      setData((prev) => {
        if (!prev) return prev;
        const next = {
          ...prev,
          files: prev.files.filter((f) => f.id !== file.id),
          file_count: Math.max(0, prev.file_count - 1),
        };
        onChanged?.({ type: "updated", summary: detailToSummary(next) });
        return next;
      });
      showToast({ tone: "info", title: t("taskGroups.toast.fileRemoved") });
    } else {
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      showToast({
        tone: "error",
        title: t("taskGroups.toast.deleteFailed"),
        description: j?.error,
      });
    }
  };

  const handleSaveDetails = async () => {
    if (!draftTitle.trim()) {
      showToast({ tone: "warning", title: t("taskGroups.modal.errEmptyTitle") });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/task-groups/${encodeURIComponent(groupId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draftTitle.trim(),
          color: draftColor.trim() || null,
          description: draftDescription.trim() || null,
          dueDate: draftDueDate.trim() || null,
        }),
        credentials: "same-origin",
      });
      const json = (await res.json()) as
        | { ok: true; data: TaskGroupDetailDto }
        | { ok: false; error?: string };
      if (!json.ok) {
        showToast({
          tone: "error",
          title: t("taskGroups.toast.saveFailed"),
          description: json.error,
        });
        return;
      }
      setData((prev) => {
        const next = prev
          ? { ...prev, ...json.data, tasks: prev.tasks, files: prev.files }
          : json.data;
        onChanged?.({ type: "updated", summary: detailToSummary(next) });
        return next;
      });
      setEditing(false);
      showToast({ tone: "success", title: t("taskGroups.toast.groupSaved") });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMembers = async () => {
    setSavingMembers(true);
    try {
      const res = await fetch(
        `/api/task-groups/${encodeURIComponent(groupId)}/members`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userIds: Array.from(memberEdit) }),
          credentials: "same-origin",
        },
      );
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        showToast({
          tone: "error",
          title: t("taskGroups.toast.saveFailed"),
          description: json.error,
        });
        return;
      }
      showToast({ tone: "success", title: t("taskGroups.toast.membersUpdated") });
      await load();
      onChanged?.({ type: "refresh" });
    } finally {
      setSavingMembers(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!data) return;
    if (!window.confirm(t("taskGroups.modal.confirmDeleteGroup", { name: data.title }))) return;
    const res = await fetch(`/api/task-groups/${encodeURIComponent(groupId)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; archived?: boolean; error?: string };
    if (!json.ok) {
      showToast({
        tone: "error",
        title: t("taskGroups.toast.deleteFailed"),
        description: json.error,
      });
      return;
    }
    showToast({
      tone: "info",
      title: json.archived ? t("taskGroups.toast.groupArchived") : t("taskGroups.toast.groupDeleted"),
    });
    onChanged?.({ type: "deleted", id: groupId });
    onClose();
  };

  const dueDateValue = data?.due_date ?? null;
  const dueLabel = useMemo(() => {
    if (!dueDateValue) return null;
    try {
      return new Date(dueDateValue).toLocaleDateString(bcp47, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return dueDateValue;
    }
  }, [dueDateValue, bcp47]);

  return (
    <div
      dir={dir}
      className="fixed inset-0 z-[100] flex items-stretch bg-black/65 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="m-0 flex w-full max-w-[1240px] flex-col self-stretch overflow-hidden bg-white shadow-2xl md:m-4 md:max-h-[calc(100vh-2rem)] md:rounded-2xl">
        {/* Header */}
        <div
          className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3"
          style={{
            background: data?.color
              ? `linear-gradient(135deg, ${data.color}33 0%, #ffffff 70%)`
              : "linear-gradient(135deg, #f1f5f9 0%, #ffffff 70%)",
          }}
        >
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
              style={{ background: data?.color || "#475569" }}
              aria-hidden
            >
              <Users className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-wider text-slate-500">
                {t("taskGroups.modal.kicker")}
              </p>
              <h2 className="truncate text-lg font-black text-slate-950 md:text-xl">
                {data?.title || t("taskGroups.modal.loading")}
              </h2>
              <p className="mt-0.5 truncate text-xs font-bold text-slate-600">
                {data
                  ? t("taskGroups.modal.summary", {
                      tasks: data.task_count,
                      files: data.file_count,
                      members: data.member_count,
                    })
                  : "…"}
                {dueLabel ? <span className="ms-2 opacity-80">· {t("taskGroups.modal.dueOn", { date: dueLabel })}</span> : null}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center gap-1 rounded-lg bg-slate-100 px-3 text-xs font-bold text-slate-700 hover:bg-slate-200"
            aria-label={t("common.close")}
          >
            <X className="h-4 w-4" aria-hidden />
            {t("common.close")}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50/60 px-2">
          {(
            [
              { id: "tasks", label: t("taskGroups.modal.tabs.tasks"), count: data?.task_count ?? 0 },
              { id: "files", label: t("taskGroups.modal.tabs.files"), count: data?.file_count ?? 0 },
              { id: "members", label: t("taskGroups.modal.tabs.members"), count: data?.member_count ?? 0 },
              { id: "notes", label: t("taskGroups.modal.tabs.notes"), count: 0 },
            ] as { id: TabId; label: string; count: number }[]
          ).map((opt) => {
            const active = tab === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTab(opt.id)}
                className={`relative whitespace-nowrap px-3 py-2 text-sm font-black transition ${
                  active
                    ? "text-slate-950"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  {opt.label}
                  {opt.count > 0 && opt.id !== "notes" ? (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                        active ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {opt.count}
                    </span>
                  ) : null}
                </span>
                {active ? (
                  <span className="absolute inset-x-2 bottom-0 h-[3px] rounded-full bg-emerald-500" />
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 md:p-5">
          {loadError ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-900">
              {loadError}
            </p>
          ) : null}

          {loading ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-hidden />
            </div>
          ) : !data ? null : (
            <>
              {tab === "tasks" && (
                <section>
                  {data.tasks.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm font-bold text-slate-500">
                      {t("taskGroups.modal.noTasks")}
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {data.tasks.map((task) => (
                        <li
                          key={task.id}
                          className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-black text-slate-950">
                                {task.title ?? "—"}
                              </p>
                            </div>
                            {task.status ? (
                              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black uppercase text-slate-700">
                                {task.status}
                              </span>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              {tab === "files" && (
                <section>
                  <div
                    className={`mb-3 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition ${
                      dragOver
                        ? "border-emerald-400 bg-emerald-50"
                        : "border-slate-300 bg-slate-50/50"
                    }`}
                    onDrop={handleDrop}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                  >
                    <Upload className="h-7 w-7 text-slate-400" aria-hidden />
                    <p className="text-sm font-black text-slate-800">
                      {t("taskGroups.modal.dropFiles")}
                    </p>
                    <p className="text-xs text-slate-500">
                      {t("taskGroups.modal.acceptedFormats")}
                    </p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-1 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-slate-800"
                    >
                      <Plus className="h-4 w-4" aria-hidden />
                      {t("taskGroups.modal.chooseFiles")}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept={ACCEPTED_FILE_EXTS}
                      onChange={(e) => {
                        if (e.target.files) void uploadFiles(e.target.files);
                        e.target.value = "";
                      }}
                      className="hidden"
                    />
                    {uploadingCount > 0 ? (
                      <p className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-slate-600">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        {t("taskGroups.modal.uploadingN", { n: uploadingCount })}
                      </p>
                    ) : null}
                  </div>

                  {data.files.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm font-bold text-slate-500">
                      {t("taskGroups.modal.noFiles")}
                    </p>
                  ) : (
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {data.files.map((f) => {
                        const Icon = fileIcon(f.file_type);
                        const isImage = f.file_type.startsWith("image/");
                        return (
                          <li
                            key={f.id}
                            className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm transition hover:border-slate-300"
                          >
                            <a
                              href={f.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100"
                              aria-label={t("taskGroups.modal.viewFile")}
                            >
                              {isImage ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img src={f.file_url} alt={f.title} className="h-full w-full object-cover" />
                              ) : (
                                <Icon className="h-5 w-5 text-slate-500" aria-hidden />
                              )}
                            </a>
                            <div className="min-w-0 flex-1">
                              <a
                                href={f.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block truncate text-sm font-black text-slate-900 hover:underline"
                              >
                                {f.title}
                              </a>
                              <p className="truncate text-xs text-slate-500">
                                {formatBytes(f.size_bytes)} ·{" "}
                                {new Date(f.created_at).toLocaleDateString(bcp47)}
                                {f.uploaded_by_name ? ` · ${f.uploaded_by_name}` : ""}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => void handleDeleteFile(f)}
                              className="rounded-lg p-1 text-rose-500 hover:bg-rose-50"
                              aria-label={t("taskGroups.modal.deleteFile")}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              )}

              {tab === "members" && (
                <section>
                  {canManage ? (
                    <>
                      <p className="mb-2 text-xs font-bold text-slate-500">
                        {t("taskGroups.modal.membersHint")}
                      </p>
                      <ul className="grid max-h-[55vh] gap-2 overflow-auto rounded-2xl border border-slate-200 bg-slate-50/50 p-2 sm:grid-cols-2">
                        {employees.map((emp) => {
                          const checked = memberEdit.has(emp.id);
                          return (
                            <li key={emp.id}>
                              <label
                                className={`flex cursor-pointer items-center gap-3 rounded-xl border bg-white px-3 py-2 shadow-sm transition ${
                                  checked
                                    ? "border-emerald-300 ring-1 ring-emerald-200"
                                    : "border-slate-200 hover:border-slate-300"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    setMemberEdit((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(emp.id)) next.delete(emp.id);
                                      else next.add(emp.id);
                                      return next;
                                    })
                                  }
                                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-400"
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-black text-slate-950">
                                    {emp.fullName}
                                  </p>
                                  <p className="truncate text-xs text-slate-500">{emp.email}</p>
                                </div>
                                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-700">
                                  {emp.role}
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                      <div className="mt-3 flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => void handleSaveMembers()}
                          disabled={savingMembers}
                          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {savingMembers ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
                          {t("taskGroups.modal.saveMembers")}
                        </button>
                      </div>
                    </>
                  ) : (
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {data.members.map((m) => (
                        <li
                          key={m.id}
                          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
                        >
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-xs font-black text-slate-700">
                            {(m.full_name?.[0] ?? "?").toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-slate-950">{m.full_name}</p>
                            <p className="truncate text-xs text-slate-500">{m.email}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              {tab === "notes" && (
                <section>
                  {canManage && !editing ? (
                    <button
                      type="button"
                      onClick={() => setEditing(true)}
                      className="mb-3 inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                      {t("taskGroups.modal.editDetails")}
                    </button>
                  ) : null}

                  {editing ? (
                    <div className="grid gap-3">
                      <label className="block text-xs font-bold text-slate-700">
                        {t("taskGroups.modal.fieldTitle")}
                        <input
                          type="text"
                          value={draftTitle}
                          onChange={(e) => setDraftTitle(e.target.value)}
                          className="mt-1 block h-10 w-full rounded-xl border border-slate-300 px-3 text-sm shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                        />
                      </label>
                      <label className="block text-xs font-bold text-slate-700">
                        {t("taskGroups.modal.fieldColor")}
                        <div className="mt-1 flex items-center gap-2">
                          <input
                            type="color"
                            value={draftColor || "#10b981"}
                            onChange={(e) => setDraftColor(e.target.value)}
                            className="h-10 w-14 cursor-pointer rounded-lg border border-slate-300"
                          />
                          <input
                            type="text"
                            value={draftColor}
                            onChange={(e) => setDraftColor(e.target.value)}
                            placeholder="#10b981"
                            className="h-10 flex-1 rounded-xl border border-slate-300 px-3 text-sm shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                          />
                        </div>
                      </label>
                      <label className="block text-xs font-bold text-slate-700">
                        {t("taskGroups.modal.fieldDueDate")}
                        <input
                          type="date"
                          value={draftDueDate}
                          onChange={(e) => setDraftDueDate(e.target.value)}
                          className="mt-1 block h-10 w-full rounded-xl border border-slate-300 px-3 text-sm shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                        />
                      </label>
                      <label className="block text-xs font-bold text-slate-700">
                        {t("taskGroups.modal.fieldDescription")}
                        <textarea
                          value={draftDescription}
                          onChange={(e) => setDraftDescription(e.target.value)}
                          rows={5}
                          className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                          placeholder={t("taskGroups.modal.notesPlaceholder")}
                        />
                      </label>
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(false);
                            setDraftTitle(data.title);
                            setDraftColor(data.color ?? "");
                            setDraftDescription(data.description ?? "");
                            setDraftDueDate(data.due_date ?? "");
                          }}
                          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                        >
                          {t("common.cancel")}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleSaveDetails()}
                          disabled={saving}
                          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
                          {t("common.save")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {data.description ? (
                        <p className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-800">
                          {data.description}
                        </p>
                      ) : (
                        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm font-bold text-slate-500">
                          {t("taskGroups.modal.noNotes")}
                        </p>
                      )}
                      <dl className="grid gap-2 sm:grid-cols-2">
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs">
                          <dt className="font-black uppercase text-slate-500">
                            {t("taskGroups.modal.created")}
                          </dt>
                          <dd className="mt-1 flex items-center gap-1 font-bold text-slate-800">
                            <Clock className="h-3.5 w-3.5" aria-hidden />
                            {new Date(data.created_at).toLocaleString(bcp47)}
                          </dd>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs">
                          <dt className="font-black uppercase text-slate-500">
                            {t("taskGroups.modal.updated")}
                          </dt>
                          <dd className="mt-1 flex items-center gap-1 font-bold text-slate-800">
                            <Clock className="h-3.5 w-3.5" aria-hidden />
                            {new Date(data.updated_at).toLocaleString(bcp47)}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {canManage && data ? (
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
            <button
              type="button"
              onClick={() => void handleDeleteGroup()}
              className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              {data.task_count > 0
                ? t("taskGroups.modal.archiveGroup")
                : t("taskGroups.modal.deleteGroup")}
            </button>
            <span className="text-xs text-slate-500">
              {data.open_task_count} {t("taskGroups.modal.openTasksSuffix")} · {data.completed_task_count} {t("taskGroups.modal.doneTasksSuffix")}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
