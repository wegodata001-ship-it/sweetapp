"use client";

import { Document, Font, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";

Font.register({
  family: "Rubik",
  src: "https://fonts.gstatic.com/s/rubik/v28/iJWZBXyIfDnIV5PNhY1KTN7Z-Yh-B4iFQVU.ttf",
});

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: "Rubik",
    fontSize: 10,
  },
  h1: {
    fontSize: 16,
    marginBottom: 14,
    textAlign: "right",
  },
  section: {
    marginBottom: 10,
  },
  row: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  label: {
    width: "42%",
    textAlign: "right",
    color: "#334155",
  },
  value: {
    width: "58%",
    textAlign: "right",
  },
  tableHeader: {
    flexDirection: "row-reverse",
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    paddingBottom: 4,
    marginTop: 8,
    marginBottom: 4,
    fontWeight: "bold",
  },
  cell: {
    textAlign: "right",
  },
  cellWide: { width: "40%" },
  cellNum: { width: "18%" },
  footer: {
    marginTop: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#0ea5e9",
    flexDirection: "row-reverse",
    justifyContent: "space-between",
  },
  grand: {
    fontSize: 13,
    fontWeight: "bold",
  },
});

export type IncomePdfPayload = {
  kind: "income";
  customerName: string;
  incomeDate: string;
  documentType: string;
  depositAmount?: string;
  trayQty?: string;
  returnDate?: string;
  showEvent: boolean;
  lines: { itemName: string; quantity: string; price: string; lineTotal: number }[];
  grandTotal: number;
};

export type ZPdfPayload = {
  kind: "zreport";
  zDate: string;
  zNumber: string;
  cashTaxable: number;
  cashExempt: number;
  creditTaxable: number;
  creditExempt: number;
  transfers: number;
  grandTotal: number;
};

export type ExpensePdfPayload = {
  kind: "expense";
  supplier: string;
  category: string;
  expenseDate: string;
  docNumber: string;
  amountBeforeVat: number;
  vatAmount: number;
  expenseTotal: number;
};

export type RegisterPdfPayload = IncomePdfPayload | ZPdfPayload | ExpensePdfPayload;

function formatMoney(n: number): string {
  return `₪${n.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function IncomeDoc({ payload }: { payload: IncomePdfPayload }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>רישום כספי — מסמכי הכנסה ואירועים</Text>
        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={styles.label}>שם לקוח</Text>
            <Text style={styles.value}>{payload.customerName || "—"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>תאריך</Text>
            <Text style={styles.value}>{payload.incomeDate || "—"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>סוג מסמך</Text>
            <Text style={styles.value}>{payload.documentType}</Text>
          </View>
        </View>
        {payload.showEvent && (
          <View style={styles.section}>
            <Text style={[styles.h1, { fontSize: 12 }]}>פרטי אירוע</Text>
            <View style={styles.row}>
              <Text style={styles.label}>פיקדון</Text>
              <Text style={styles.value}>{payload.depositAmount || "—"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>מגשים</Text>
              <Text style={styles.value}>{payload.trayQty || "—"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>תאריך החזרה</Text>
              <Text style={styles.value}>{payload.returnDate || "—"}</Text>
            </View>
          </View>
        )}
        <View style={styles.tableHeader}>
          <Text style={[styles.cell, styles.cellWide]}>פריט</Text>
          <Text style={[styles.cell, styles.cellNum]}>כמות</Text>
          <Text style={[styles.cell, styles.cellNum]}>מחיר</Text>
          <Text style={[styles.cell, styles.cellNum]}>סה״כ</Text>
        </View>
        {payload.lines.map((line, i) => (
          <View key={i} style={styles.row}>
            <Text style={[styles.cell, styles.cellWide]}>{line.itemName || `שורה ${i + 1}`}</Text>
            <Text style={[styles.cell, styles.cellNum]}>{line.quantity}</Text>
            <Text style={[styles.cell, styles.cellNum]}>{line.price}</Text>
            <Text style={[styles.cell, styles.cellNum]}>{formatMoney(line.lineTotal)}</Text>
          </View>
        ))}
        <View style={styles.footer}>
          <Text style={styles.grand}>סה״כ</Text>
          <Text style={styles.grand}>{formatMoney(payload.grandTotal)}</Text>
        </View>
      </Page>
    </Document>
  );
}

function ZDoc({ payload }: { payload: ZPdfPayload }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>דוח Z קופה</Text>
        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={styles.label}>תאריך</Text>
            <Text style={styles.value}>{payload.zDate || "—"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>מספר דוח Z</Text>
            <Text style={styles.value}>{payload.zNumber || "—"}</Text>
          </View>
        </View>
        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={styles.label}>מזומן חייב</Text>
            <Text style={styles.value}>{formatMoney(payload.cashTaxable)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>מזומן פטור</Text>
            <Text style={styles.value}>{formatMoney(payload.cashExempt)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>אשראי חייב</Text>
            <Text style={styles.value}>{formatMoney(payload.creditTaxable)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>אשראי פטור</Text>
            <Text style={styles.value}>{formatMoney(payload.creditExempt)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>העברות בנק</Text>
            <Text style={styles.value}>{formatMoney(payload.transfers)}</Text>
          </View>
        </View>
        <View style={styles.footer}>
          <Text style={styles.grand}>סה״כ דוח Z</Text>
          <Text style={styles.grand}>{formatMoney(payload.grandTotal)}</Text>
        </View>
      </Page>
    </Document>
  );
}

function ExpenseDoc({ payload }: { payload: ExpensePdfPayload }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>רישום הוצאה</Text>
        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={styles.label}>ספק</Text>
            <Text style={styles.value}>{payload.supplier || "—"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>קטגוריה</Text>
            <Text style={styles.value}>{payload.category || "—"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>תאריך</Text>
            <Text style={styles.value}>{payload.expenseDate || "—"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>מספר מסמך</Text>
            <Text style={styles.value}>{payload.docNumber || "—"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>לפני מע״מ</Text>
            <Text style={styles.value}>{formatMoney(payload.amountBeforeVat)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>מע״מ</Text>
            <Text style={styles.value}>{formatMoney(payload.vatAmount)}</Text>
          </View>
        </View>
        <View style={styles.footer}>
          <Text style={styles.grand}>סה״כ לתשלום</Text>
          <Text style={styles.grand}>{formatMoney(payload.expenseTotal)}</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function buildRegisterPdfBlob(payload: RegisterPdfPayload): Promise<Blob> {
  if (payload.kind === "income") {
    const doc = <IncomeDoc payload={payload} />;
    return await pdf(doc).toBlob();
  }
  if (payload.kind === "zreport") {
    const doc = <ZDoc payload={payload} />;
    return await pdf(doc).toBlob();
  }
  const doc = <ExpenseDoc payload={payload} />;
  return await pdf(doc).toBlob();
}
