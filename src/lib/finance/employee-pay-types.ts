/** סוג מסמך לתשלום עובד — נשמר ב-metadata.employeePayType */
export const EMPLOYEE_PAY_TYPE_VALUES = ["salary", "advance", "gift", "other"] as const;

export type EmployeePayType = (typeof EMPLOYEE_PAY_TYPE_VALUES)[number];

export const EMPLOYEE_PAY_TYPE_I18N: Record<EmployeePayType, string> = {
  salary: "register.employeePayTypes.salary",
  advance: "register.employeePayTypes.advance",
  gift: "register.employeePayTypes.gift",
  other: "register.employeePayTypes.other",
};

/** תווית לכרטסת / documentType */
export const EMPLOYEE_PAY_TYPE_DOC_LABEL: Record<EmployeePayType, string> = {
  salary: "שכר",
  advance: "מפרעה",
  gift: "מתנה",
  other: "אחר",
};

export function isEmployeePayType(v: unknown): v is EmployeePayType {
  return typeof v === "string" && (EMPLOYEE_PAY_TYPE_VALUES as readonly string[]).includes(v);
}

export function normalizeEmployeePayType(v: unknown): EmployeePayType {
  return isEmployeePayType(v) ? v : "salary";
}

export function documentTypeForEmployeePay(v: unknown): string {
  return EMPLOYEE_PAY_TYPE_DOC_LABEL[normalizeEmployeePayType(v)];
}
