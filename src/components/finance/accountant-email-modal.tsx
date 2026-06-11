"use client";

import { Check, Loader2, Mail, Star, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import type { DocumentEmailAttachmentPreview } from "@/lib/finance/db";
import {
  fetchDocumentEmailContacts,
  previewAccountantEmailAttachments,
  toggleDocumentEmailContactFavorite,
  type DocumentEmailContactRow,
} from "@/lib/finance/db";

export type AccountantEmailSendMode = "pdf_only" | "source_only" | "pdf_and_source";

type Props = {
  open: boolean;
  selectedCount: number;
  selectedDocumentIds: string[];
  defaultEmail: string;
  defaultSubject: string;
  sending: boolean;
  onClose: () => void;
  onSend: (params: {
    recipients: string[];
    subject: string;
    message: string;
    sendMode: AccountantEmailSendMode;
    includePdf: boolean;
    includeSource: boolean;
  }) => void;
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function modeFromFlags(includePdf: boolean, includeSource: boolean): AccountantEmailSendMode {
  if (includePdf && includeSource) return "pdf_and_source";
  if (includeSource) return "source_only";
  return "pdf_only";
}

function flagsFromMode(mode: AccountantEmailSendMode): { includePdf: boolean; includeSource: boolean } {
  switch (mode) {
    case "pdf_only":
      return { includePdf: true, includeSource: false };
    case "source_only":
      return { includePdf: false, includeSource: true };
    default:
      return { includePdf: true, includeSource: true };
  }
}

export function AccountantEmailModal({
  open,
  selectedCount,
  selectedDocumentIds,
  defaultEmail,
  defaultSubject,
  sending,
  onClose,
  onSend,
}: Props) {
  const { t, dir } = useI18n();
  const [contacts, setContacts] = useState<DocumentEmailContactRow[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [manualEmail, setManualEmail] = useState("");
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState("");
  const [sendMode, setSendMode] = useState<AccountantEmailSendMode>("pdf_and_source");
  const [includePdf, setIncludePdf] = useState(true);
  const [includeSource, setIncludeSource] = useState(true);
  const [preview, setPreview] = useState<DocumentEmailAttachmentPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSubject(defaultSubject);
    setMessage("");
    setManualEmail("");
    setSendMode("pdf_and_source");
    setIncludePdf(true);
    setIncludeSource(true);
    const initial = defaultEmail.trim();
    setSelectedEmails(initial && isValidEmail(initial) ? new Set([normalizeEmail(initial)]) : new Set());

    setContactsLoading(true);
    void fetchDocumentEmailContacts()
      .then(setContacts)
      .finally(() => setContactsLoading(false));
  }, [open, defaultEmail, defaultSubject]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !sending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, sending, onClose]);

  useEffect(() => {
    if (!open || selectedDocumentIds.length === 0) {
      setPreview(null);
      return;
    }
    if (!includePdf && !includeSource) {
      setPreview(null);
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);
    void previewAccountantEmailAttachments({
      documentIds: selectedDocumentIds,
      includePdf,
      includeSource,
      sendMode,
    })
      .then((res) => {
        if (cancelled) return;
        setPreview(res.ok ? (res.data ?? null) : null);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, selectedDocumentIds, includePdf, includeSource, sendMode]);

  const sortedContacts = useMemo(() => {
    return [...contacts].sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
      const aTime = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
      const bTime = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
      if (aTime !== bTime) return bTime - aTime;
      return a.email.localeCompare(b.email);
    });
  }, [contacts]);

  const datalistId = "accountant-email-suggestions";

  if (!open) return null;

  const selectedLabel =
    selectedCount === 1
      ? t("archive.emailModal.selectedOne")
      : t("archive.emailModal.selectedMany", { count: String(selectedCount) });

  const toggleRecipient = (email: string) => {
    const key = normalizeEmail(email);
    setSelectedEmails((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const addManualEmail = () => {
    const email = normalizeEmail(manualEmail);
    if (!isValidEmail(email)) return;
    setSelectedEmails((prev) => new Set(prev).add(email));
    setManualEmail("");
  };

  const toggleFavorite = async (contact: DocumentEmailContactRow) => {
    const ok = await toggleDocumentEmailContactFavorite(contact.id, !contact.isFavorite);
    if (!ok) return;
    setContacts((prev) =>
      prev.map((c) => (c.id === contact.id ? { ...c, isFavorite: !c.isFavorite } : c)),
    );
  };

  const applyMode = (mode: AccountantEmailSendMode) => {
    const flags = flagsFromMode(mode);
    setSendMode(mode);
    setIncludePdf(flags.includePdf);
    setIncludeSource(flags.includeSource);
  };

  const setPdfChecked = (checked: boolean) => {
    const nextPdf = checked;
    const nextSource = checked ? includeSource : includeSource || !nextPdf;
    if (!nextPdf && !nextSource) return;
    setIncludePdf(nextPdf);
    setIncludeSource(nextSource);
    setSendMode(modeFromFlags(nextPdf, nextSource));
  };

  const setSourceChecked = (checked: boolean) => {
    const nextSource = checked;
    const nextPdf = checked ? includePdf : includePdf || !nextSource;
    if (!nextPdf && !nextSource) return;
    setIncludePdf(nextPdf);
    setIncludeSource(nextSource);
    setSendMode(modeFromFlags(nextPdf, nextSource));
  };

  const recipients = [...selectedEmails];
  const canSend =
    recipients.length > 0 &&
    (includePdf || includeSource) &&
    (preview?.totalFiles ?? 0) > 0 &&
    !previewLoading;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" dir={dir}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="accountant-email-modal-title"
      >
        <header className="flex items-start justify-between border-b px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-900 text-white">
              <Mail className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h2 id="accountant-email-modal-title" className="text-lg font-black text-slate-950">
                {t("archive.emailModal.title")}
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">{t("archive.emailModal.subtitle")}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            aria-label={t("common.close")}
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-4 px-5 py-4">
          <div>
            <span className="text-xs font-bold text-slate-600">{t("archive.emailModal.recipientsLabel")}</span>
            {contactsLoading ? (
              <p className="mt-2 flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                {t("archive.emailModal.contactsLoading")}
              </p>
            ) : sortedContacts.length > 0 ? (
              <ul className="mt-2 max-h-44 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
                {sortedContacts.map((contact) => {
                  const checked = selectedEmails.has(contact.email);
                  return (
                    <li
                      key={contact.id}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRecipient(contact.email)}
                        disabled={sending}
                        className="h-4 w-4 accent-luxury-navy-rich"
                        aria-label={contact.email}
                      />
                      <button
                        type="button"
                        onClick={() => void toggleFavorite(contact)}
                        disabled={sending}
                        className={`rounded p-0.5 ${contact.isFavorite ? "text-amber-500" : "text-slate-300 hover:text-amber-400"}`}
                        aria-label={t("archive.emailModal.toggleFavorite")}
                      >
                        <Star className={`h-4 w-4 ${contact.isFavorite ? "fill-current" : ""}`} aria-hidden />
                      </button>
                      <label className="min-w-0 flex-1 cursor-pointer text-sm">
                        <span className="block truncate font-semibold text-slate-800">
                          {contact.name?.trim() || contact.email}
                        </span>
                        {contact.name?.trim() ? (
                          <span className="block truncate text-xs text-slate-500">{contact.email}</span>
                        ) : null}
                      </label>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-slate-500">{t("archive.emailModal.contactsEmpty")}</p>
            )}
          </div>

          <div>
            <span className="text-xs font-bold text-slate-600">{t("archive.emailModal.addEmailLabel")}</span>
            <div className="mt-1 flex gap-2">
              <input
                type="email"
                list={datalistId}
                value={manualEmail}
                onChange={(e) => setManualEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addManualEmail();
                  }
                }}
                placeholder={t("archive.emailModal.toPlaceholder")}
                className="h-11 min-w-0 flex-1 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-luxury-gold focus:ring-1 focus:ring-luxury-gold/25"
                disabled={sending}
              />
              <button
                type="button"
                onClick={addManualEmail}
                disabled={sending || !isValidEmail(manualEmail)}
                className="shrink-0 rounded-xl border border-slate-300 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {t("archive.emailModal.addEmail")}
              </button>
            </div>
            <datalist id={datalistId}>
              {sortedContacts.map((c) => (
                <option key={c.id} value={c.email} label={c.name ?? undefined} />
              ))}
            </datalist>
          </div>

          {recipients.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {recipients.map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-800"
                >
                  {email}
                  <button
                    type="button"
                    onClick={() => toggleRecipient(email)}
                    disabled={sending}
                    className="rounded-full p-0.5 hover:bg-slate-200"
                    aria-label={t("common.remove")}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          <fieldset className="rounded-xl border border-slate-200 p-3">
            <legend className="px-1 text-xs font-bold text-slate-600">
              {t("archive.emailModal.fileTypeLegend")}
            </legend>
            <ul className="mt-1 space-y-2">
              {(
                [
                  ["pdf_only", t("archive.emailModal.modePdfOnly")],
                  ["source_only", t("archive.emailModal.modeSourceOnly")],
                  ["pdf_and_source", t("archive.emailModal.modePdfAndSource")],
                ] as const
              ).map(([mode, label]) => (
                <li key={mode}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                    <input
                      type="radio"
                      name="accountantEmailSendMode"
                      checked={sendMode === mode}
                      onChange={() => applyMode(mode)}
                      disabled={sending}
                      className="h-4 w-4 border-slate-300"
                    />
                    <span className="text-sm font-semibold text-slate-800">{label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-bold text-slate-600">{t("archive.emailModal.filesCardTitle")}</p>
            <ul className="mt-2 space-y-2">
              <li>
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={includePdf}
                    onChange={(e) => setPdfChecked(e.target.checked)}
                    disabled={sending}
                    className="h-4 w-4 rounded border-slate-300 accent-luxury-navy-rich"
                  />
                  <span className="text-sm font-semibold text-slate-800">
                    {t("archive.emailModal.includePdf")}
                  </span>
                </label>
              </li>
              <li>
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={includeSource}
                    onChange={(e) => setSourceChecked(e.target.checked)}
                    disabled={sending}
                    className="h-4 w-4 rounded border-slate-300 accent-luxury-navy-rich"
                  />
                  <span className="text-sm font-semibold text-slate-800">
                    {t("archive.emailModal.includeSource")}
                  </span>
                </label>
              </li>
            </ul>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-950">
            <p className="font-bold">{t("archive.emailModal.willSendTitle")}</p>
            {previewLoading ? (
              <p className="mt-1 flex items-center gap-2 text-emerald-800">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                {t("archive.emailModal.previewLoading")}
              </p>
            ) : preview ? (
              <ul className="mt-1 space-y-0.5 text-emerald-900">
                {preview.selectedPdfCount > 0 ? (
                  <li className="flex items-center gap-1.5">
                    <Check className="h-4 w-4 shrink-0" aria-hidden />
                    {t("archive.emailModal.previewPdfCount", {
                      count: String(preview.selectedPdfCount),
                    })}
                  </li>
                ) : null}
                {preview.selectedSourceCount > 0 ? (
                  <li className="flex items-center gap-1.5">
                    <Check className="h-4 w-4 shrink-0" aria-hidden />
                    {t("archive.emailModal.previewSourceCount", {
                      count: String(preview.selectedSourceCount),
                    })}
                  </li>
                ) : null}
                <li className="pt-1 font-bold">
                  {t("archive.emailModal.previewTotal", { count: String(preview.totalFiles) })}
                </li>
                {preview.documentsWithNoFiles.length > 0 ? (
                  <li className="text-amber-800">
                    {t("archive.emailModal.previewMissing", {
                      count: String(preview.documentsWithNoFiles.length),
                    })}
                  </li>
                ) : null}
              </ul>
            ) : (
              <p className="mt-1 text-emerald-800">{t("archive.emailModal.previewEmpty")}</p>
            )}
          </div>

          <label className="block">
            <span className="text-xs font-bold text-slate-600">{t("archive.emailModal.subjectLabel")}</span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={defaultSubject}
              className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-luxury-gold focus:ring-1 focus:ring-luxury-gold/25"
              disabled={sending}
            />
          </label>

          <label className="block">
            <span className="text-xs font-bold text-slate-600">{t("archive.emailModal.messageLabel")}</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder={t("archive.emailModal.messagePlaceholder")}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-luxury-gold focus:ring-1 focus:ring-luxury-gold/25"
              disabled={sending}
            />
          </label>

          <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">{selectedLabel}</p>
          <p className="text-xs leading-5 text-slate-500">{t("archive.emailModal.attachmentsHint")}</p>
          <p className="text-xs leading-5 text-slate-500">{t("archive.emailModal.zipHint")}</p>
        </div>

        <footer className="flex gap-2 border-t px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={sending || !canSend}
            onClick={() =>
              onSend({
                recipients,
                subject: subject.trim(),
                message: message.trim(),
                sendMode,
                includePdf,
                includeSource,
              })
            }
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Mail className="h-4 w-4" aria-hidden />}
            {t("archive.emailModal.send")}
          </button>
        </footer>
      </div>
    </div>
  );
}
