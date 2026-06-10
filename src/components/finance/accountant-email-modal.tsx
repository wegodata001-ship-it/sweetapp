"use client";

import { Loader2, Mail, Star, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import type { DocumentEmailContactRow } from "@/lib/finance/db";
import {
  fetchDocumentEmailContacts,
  toggleDocumentEmailContactFavorite,
} from "@/lib/finance/db";

type Props = {
  open: boolean;
  selectedCount: number;
  defaultEmail: string;
  defaultSubject: string;
  sending: boolean;
  onClose: () => void;
  onSend: (params: { recipients: string[]; subject: string; message: string }) => void;
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

export function AccountantEmailModal({
  open,
  selectedCount,
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

  useEffect(() => {
    if (!open) return;
    setSubject(defaultSubject);
    setMessage("");
    setManualEmail("");
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

  const recipients = [...selectedEmails];

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
            disabled={sending || recipients.length === 0}
            onClick={() =>
              onSend({
                recipients,
                subject: subject.trim(),
                message: message.trim(),
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
