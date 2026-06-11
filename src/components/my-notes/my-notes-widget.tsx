"use client";

import { Loader2, StickyNote } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import type { SerializedEmployeeNote } from "@/lib/employee-notes/employee-notes-service";
import styles from "@/components/dashboard/alerts-panel.module.css";

export function MyNotesWidget() {
  const { t } = useI18n();
  const [notes, setNotes] = useState<SerializedEmployeeNote[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/me/employee-notes?status=open&preview=1", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        data?: { notes: SerializedEmployeeNote[]; openCount: number };
      };
      if (json.ok && json.data) {
        setNotes(json.data.notes.slice(0, 3));
        setOpenCount(json.data.openCount);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  return (
    <section className={styles.panel}>
      <h2 className={styles.title}>{t("myNotes.widgetTitle")}</h2>
      {loading ? (
        <div className="flex flex-1 items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-hidden />
        </div>
      ) : openCount === 0 ? (
        <p className={styles.empty}>{t("myNotes.widgetEmpty")}</p>
      ) : (
        <>
          <p className="mt-2 text-xs font-bold text-slate-600">
            {t("myNotes.widgetOpenCount", { count: openCount })}
          </p>
          <div className={styles.list}>
            {notes.map((note) => (
              <Link
                key={note.id}
                href={`/my-notes?id=${encodeURIComponent(note.id)}`}
                className={`${styles.alert} ${styles.info}`}
              >
                <p className={styles.alertTitle}>
                  <StickyNote className={styles.alertIcon} aria-hidden />
                  {note.title}
                </p>
                {note.content ? (
                  <p className={styles.alertDetail}>{note.content}</p>
                ) : null}
              </Link>
            ))}
          </div>
          <Link
            href="/my-notes"
            className="mt-2 inline-flex min-h-[40px] items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
          >
            {t("myNotes.showAll")}
          </Link>
        </>
      )}
    </section>
  );
}
