import type { CSSProperties } from "react";
import { Section, Text } from "@react-email/components";
import { BaseEmailTemplate, EmailDetailRow } from "@/lib/email/templates/base-template";

export type InventoryDailyReportLocationRow = {
  locationName: string;
  sessionCount: number;
  productCount: number;
  shortageCount: number;
  surplusCount: number;
};

export type InventoryDailyReportSessionRow = {
  sessionNumber: number;
  countedByName: string;
  locationName: string;
  /** תאריך הספירה — מוצג רק בדוח שמשתרע על כמה ימים */
  date?: string;
  startTime: string;
  endTime: string;
  duration: string;
  status: string;
};

export type InventoryDailyReportEmailData = {
  appUrl: string;
  /** YYYY-MM-DD */
  reportDay: string;
  reportDateLabel: string;
  generatedAtLabel: string;
  sessionCount: number;
  productsChecked: number;
  ok: number;
  shortage: number;
  surplus: number;
  anomalies: number;
  addedDuringCount: number;
  removedFromCount: number;
  totalCountedQty: number;
  counters: string;
  locations: InventoryDailyReportLocationRow[];
  sessions: InventoryDailyReportSessionRow[];
  attachmentNote?: string;
  actionUrl?: string;
  /** פסקת פתיחה בגוף המייל (שליחה יזומה מהמסך) */
  intro?: string;
  /** תיאור תקופת הדוח. כשקיים מחליף את שורת "תאריך" */
  periodLabel?: string;
  headline?: string;
  locationsCounted?: number;
  totalDurationLabel?: string;
  avgDurationLabel?: string;
};

export function InventoryDailyReportEmail({
  data,
}: {
  data: InventoryDailyReportEmailData;
}) {
  const locations = data.locations ?? [];
  const sessions = data.sessions ?? [];
  const periodLabel = data.periodLabel || data.reportDateLabel;
  const headline = data.headline || `סיכום ספירות מלאי — ${periodLabel}`;
  const showSessionDate = sessions.some((row) => !!row.date);

  return (
    <BaseEmailTemplate
      previewText={headline}
      headline={headline}
      tone={data.shortage > 0 ? "WARNING" : "SUCCESS"}
      appUrl={data.appUrl}
      ctaLabel="פתיחת מודול המלאי"
      ctaUrl={data.actionUrl || `${data.appUrl}/ops/inventory`}
    >
      {data.intro ? (
        <Text style={{ color: "#0f172a", fontSize: 14, lineHeight: "24px", margin: "0 0 14px" }}>
          {data.intro}
        </Text>
      ) : null}

      <EmailDetailRow label={data.periodLabel ? "תקופת הדוח" : "תאריך"} value={periodLabel} />
      <EmailDetailRow label="שעת הפקה" value={data.generatedAtLabel} />
      <EmailDetailRow label="ספירות שבוצעו" value={String(data.sessionCount)} />
      {data.locationsCounted != null ? (
        <EmailDetailRow label="מיקומים שנספרו" value={String(data.locationsCounted)} />
      ) : null}
      {data.counters ? <EmailDetailRow label="מבצעי הספירות" value={data.counters} /> : null}

      <Section style={panel}>
        <Text style={panelTitle}>{data.periodLabel ? "תקציר" : "סיכום היום"}</Text>
        <table style={table} cellPadding={0} cellSpacing={0}>
          <tbody>
            <SummaryRow label="מוצרים שנבדקו" value={data.productsChecked} />
            <SummaryRow label="תקינים" value={data.ok} />
            <SummaryRow label="חוסרים" value={data.shortage} danger={data.shortage > 0} />
            <SummaryRow label="עודפים" value={data.surplus} />
            <SummaryRow label="חריגות" value={data.anomalies} danger={data.anomalies > 0} />
            <SummaryRow label="סה״כ יחידות שנספרו" value={data.totalCountedQty} />
            <SummaryRow label="מוצרים שנוספו" value={data.addedDuringCount} />
            <SummaryRow label="מוצרים שהוסרו מהספירה" value={data.removedFromCount} />
            {data.totalDurationLabel ? (
              <tr>
                <td style={td}>זמן ספירה כולל</td>
                <td style={tdNum}>{data.totalDurationLabel}</td>
              </tr>
            ) : null}
            {data.avgDurationLabel ? (
              <tr>
                <td style={td}>זמן ממוצע לספירה</td>
                <td style={tdNum}>{data.avgDurationLabel}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Section>

      {locations.length > 0 ? (
        <Section style={panel}>
          <Text style={panelTitle}>חלוקה לפי מיקום אחסון</Text>
          <table style={table} cellPadding={0} cellSpacing={0}>
            <thead>
              <tr>
                <th style={th}>מיקום</th>
                <th style={thNum}>ספירות</th>
                <th style={thNum}>מוצרים</th>
                <th style={thNum}>חוסרים</th>
                <th style={thNum}>עודפים</th>
              </tr>
            </thead>
            <tbody>
              {locations.map((row) => (
                <tr key={row.locationName}>
                  <td style={td}>{row.locationName}</td>
                  <td style={tdNum}>{row.sessionCount}</td>
                  <td style={tdNum}>{row.productCount}</td>
                  <td style={row.shortageCount > 0 ? tdNumDanger : tdNum}>
                    {row.shortageCount}
                  </td>
                  <td style={tdNum}>{row.surplusCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      ) : null}

      {sessions.length > 0 ? (
        <Section style={panel}>
          <Text style={panelTitle}>פירוט הספירות</Text>
          <table style={table} cellPadding={0} cellSpacing={0}>
            <thead>
              <tr>
                {showSessionDate ? <th style={thNum}>תאריך</th> : null}
                <th style={thNum}>#</th>
                <th style={th}>מבצע</th>
                <th style={th}>מיקום</th>
                <th style={thNum}>התחלה</th>
                <th style={thNum}>סיום</th>
                <th style={thNum}>משך</th>
                <th style={th}>סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((row) => (
                <tr key={`${row.date ?? ""}-${row.sessionNumber}-${row.locationName}`}>
                  {showSessionDate ? <td style={tdNum}>{row.date ?? ""}</td> : null}
                  <td style={tdNum}>{row.sessionNumber}</td>
                  <td style={td}>{row.countedByName}</td>
                  <td style={td}>{row.locationName}</td>
                  <td style={tdNum}>{row.startTime}</td>
                  <td style={tdNum}>{row.endTime}</td>
                  <td style={tdNum}>{row.duration}</td>
                  <td style={td}>{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      ) : null}

      <Text style={{ color: "#475569", fontSize: 13, lineHeight: "22px", marginTop: 12 }}>
        {data.attachmentNote ?? "מצורפים דוח PDF מעוצב וקובץ Excel עם כל נתוני הספירות."}
      </Text>
    </BaseEmailTemplate>
  );
}

function SummaryRow({
  label,
  value,
  danger,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <tr>
      <td style={td}>{label}</td>
      <td style={danger ? tdNumDanger : tdNum}>{value}</td>
    </tr>
  );
}

const panel: CSSProperties = {
  backgroundColor: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  marginTop: 16,
  padding: "14px 16px",
};

const panelTitle: CSSProperties = {
  color: "#0f172a",
  fontSize: 14,
  fontWeight: 800,
  margin: "0 0 10px",
};

const table: CSSProperties = {
  borderCollapse: "collapse",
  width: "100%",
};

const th: CSSProperties = {
  borderBottom: "1px solid #e2e8f0",
  color: "#64748b",
  fontSize: 11,
  fontWeight: 700,
  padding: "4px 6px",
  textAlign: "right",
};

const thNum: CSSProperties = { ...th, textAlign: "center" };

const td: CSSProperties = {
  borderBottom: "1px solid #eef2f7",
  color: "#0f172a",
  fontSize: 12,
  padding: "6px",
  textAlign: "right",
};

const tdNum: CSSProperties = {
  ...td,
  fontWeight: 700,
  textAlign: "center",
};

const tdNumDanger: CSSProperties = { ...tdNum, color: "#b91c1c" };
