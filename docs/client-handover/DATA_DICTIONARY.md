# Data dictionary — WEGO ERP (stage 1 audit)

Source: `prisma/schema.prisma` (71 models, 9 enums).  
**RECORD COUNT for every model: NOT AVAILABLE** — Production was not queried; local `DATABASE_URL` is unset.

Currency in this system is ILS (shekel). Amount fields are `Float` unless noted.

Status / soft-delete fields must stay in the technical backup. Client-friendly files may show them as Status.

---

## Enums

| Enum | Values |
|---|---|
| UserRole | SUPER_ADMIN, ADMIN, EMPLOYEE |
| WorkflowRunStatus | IN_PROGRESS, COMPLETED, ABORTED |
| WorkflowItemStatus | PENDING, ACTIVE, COMPLETED, SKIPPED |
| WorkSessionStatus | ACTIVE, ENDED, CANCELLED |
| NotificationRoleTarget | ADMIN, EMPLOYEE, BOTH |
| NotificationPriority | LOW, MEDIUM, HIGH, CRITICAL |
| NotificationEmailImportance | NONE, LOW, NORMAL, HIGH, CRITICAL |
| NotificationType | TASK_*, CLOCK_*, CHECK_*, INVENTORY_*, ORDER_*, SYSTEM_ALERT, … |
| EmployeeNotePriority | NORMAL, HIGH, URGENT |

---

## Finance / counterparties

### Customer
- **PURPOSE:** Customer card (name, phone, opening balance).
- **CLIENT DATA / EXPORT:** YES / YES
- **SENSITIVE:** NO
- **PK:** id
- **Relations:** FinancialDocument, Payment, CheckPayment
- **Dates:** createdAt. **Amounts:** openingBalance

### Supplier
- **PURPOSE:** Supplier card + opening balance.
- **CLIENT DATA / EXPORT:** YES / YES
- **SENSITIVE:** NO
- **PK:** id
- **Relations:** FinancialDocument (expenses), LedgerEntry, Product, SupplierProduct
- **Dates:** createdAt, updatedAt. **Amounts:** openingBalance

### Employee
- **PURPOSE:** Employee ledger card (not the login User).
- **CLIENT DATA / EXPORT:** YES / YES
- **SENSITIVE:** NO (phone is operational)
- **PK:** id
- **Relations:** LedgerEntry, FinancialDocument, EmployeeTask*, User, InventoryLocationWorker
- **Dates:** createdAt. **Amounts:** openingBalance, hourlyRate
- **Status:** isActive

### LedgerEntry
- **PURPOSE:** Supplier/employee ledger lines (debit/credit).
- **CLIENT DATA / EXPORT:** YES / YES
- **SENSITIVE:** NO
- **PK:** id
- **Relations:** supplierId, employeeId, financialDocumentId
- **Dates:** entryDate, createdAt. **Amounts:** debit, credit

### FinancialDocument
- **PURPOSE:** Income/expense documents (invoices, receipts, credit notes, Z-report, supplier payments).
- **CLIENT DATA / EXPORT:** YES / YES
- **SENSITIVE:** NO
- **PK:** id
- **Relations:** Customer, Supplier, Employee, items, Payment, LedgerEntry, DocumentUpload, checks, cashflow
- **Dates:** docDate, createdAt, sentToCpaAt
- **Amounts:** totalAmount, paidAmount, remainingAmount, depositAmount
- **Status:** paymentStatus, depositStatus, sentToCpa, category, documentType
- **Files:** pdfStoragePath

### FinancialDocumentItem
- **PURPOSE:** Line items on a financial document.
- **CLIENT DATA / EXPORT:** YES / YES
- **SENSITIVE:** NO
- **PK:** id → documentId, productId?

### Payment
- **PURPOSE:** Customer AR receipt (ledger payment).
- **CLIENT DATA / EXPORT:** YES / YES
- **SENSITIVE:** NO
- **PK:** id → customerId, documentId?
- **Dates:** createdAt. **Amounts:** amount

### CheckPayment
- **PURPOSE:** Check tracking (deposit / clear / bounce / cancel).
- **CLIENT DATA / EXPORT:** YES / YES
- **SENSITIVE:** NO
- **PK:** id → customerId, paymentId?, documentId?
- **Status:** PENDING | DEPOSITED | CLEARED | BOUNCED | EXPIRED | CANCELLED
- **Dates:** dueDate, depositedAt, clearedAt, bouncedAt, cancelledAt, createdAt, updatedAt

### CheckNotificationLog
- **PURPOSE:** Alert history for a check.
- **CLIENT DATA / EXPORT:** YES / YES (technical+ops)
- **SENSITIVE:** NO
- **PK:** id → checkId

### CashFlowEntry
- **PURPOSE:** Cash journal (income/expense/deposit/refund, Z-report, order-cashflow).
- **CLIENT DATA / EXPORT:** YES / YES
- **SENSITIVE:** NO
- **PK:** id
- **Relations:** documentId, paymentId, customerId, relatedOrderId, orderPaymentId, zReportId
- **Dates:** entryDate, createdAt. **Amounts:** amount
- **Status:** entryType, source, isDirect

### FinanceSettings
- **PURPOSE:** Cash opening + forecast bank balance + manual forecast JSON.
- **CLIENT DATA / EXPORT:** YES / YES
- **SENSITIVE:** NO
- **PK:** id (Int)

### DocumentEmailContact
- **PURPOSE:** Accountant email address book.
- **CLIENT DATA / EXPORT:** YES / YES
- **SENSITIVE:** LOW (emails)
- **PK:** id. **businessId** default `"default"`

### AccountantTransferLog / AccountantEmailLog
- **PURPOSE:** CPA send / mark-sent history.
- **CLIENT DATA / EXPORT:** YES / YES
- **SENSITIVE:** LOW (recipient emails, resendId)
- **PK:** id → documentId

---

## Orders (operational — not customer ledger)

### FutureOrder
- **PURPOSE:** Daily / wedding orders. Name-only customer (no customerId).
- **CLIENT DATA / EXPORT:** YES / YES
- **SENSITIVE:** NO
- **PK:** id. **Unique:** orderNumber
- **Relations:** OrderPayment[]
- **Status:** PENDING | IN_PREPARATION | READY | COMPLETED | CANCELLED; isCompleted
- **Dates:** eventDate, createdAt, updatedAt, completedAt, turkeyImportDate
- **Amounts:** totalAmount, depositAmount, remainingAmount, turkeyAmount

### OrderPayment
- **PURPOSE:** Order cashbook (CASHFLOW_ONLY — not ledger Payment).
- **CLIENT DATA / EXPORT:** YES / YES
- **SENSITIVE:** NO
- **PK:** id → orderId
- **Status:** ACTIVE | CANCELLED. **kind:** DEPOSIT | PAYMENT | REFUND

### SystemReconciliationImport / SystemReconciliationRow
- **PURPOSE:** External week import (Turkey/China) vs FutureOrder.
- **CLIENT DATA / EXPORT:** YES / YES
- **SENSITIVE:** NO
- **Files:** filePath

---

## Inventory

### ProductCategory / Warehouse / Product / ProductHistory
- **PURPOSE:** Legacy/simple catalog + min/current stock on `Product`.
- **CLIENT DATA / EXPORT:** YES / YES
- **SENSITIVE:** NO
- **Note:** Operational counting uses `InventoryProduct`, not only `Product`.

### InventoryLocation
- **PURPOSE:** Storage locations / shelves.
- **CLIENT DATA / EXPORT:** YES / YES
- **Status:** isActive, locationType

### InventoryLocationWorker
- **PURPOSE:** Named counters per location.
- **CLIENT DATA / EXPORT:** YES / YES
- **Status:** isActive

### InventoryProduct
- **PURPOSE:** Countable SKU (names i18n, barcode, sku, min/max).
- **CLIENT DATA / EXPORT:** YES / YES
- **SENSITIVE:** NO

### InventoryProductOnLocation
- **PURPOSE:** Placement + weekday minimums.
- **CLIENT DATA / EXPORT:** YES / YES
- **PK:** id → inventoryProductId, locationId

### InventoryCountSession
- **PURPOSE:** One count event (header).
- **CLIENT DATA / EXPORT:** YES / YES
- **Status:** session status
- **Dates:** countDate, startedAt, createdAt

### InventoryCount
- **PURPOSE:** Count row (previous/current/min/difference).
- **CLIENT DATA / EXPORT:** YES / YES
- **PK:** id → inventoryProductId, sessionId?, locationId?

### InventoryCountWorker
- **PURPOSE:** Per-worker quantity on a count line.
- **CLIENT DATA / EXPORT:** YES / YES

### InventoryCountExclusion
- **PURPOSE:** Removed/restored count lines (history).
- **CLIENT DATA / EXPORT:** YES / YES
- **Status:** isRemoved; restoredAt

### InventoryMovement
- **PURPOSE:** Product stock movement (legacy Product).
- **CLIENT DATA / EXPORT:** YES / YES

### InventoryDailyReportRun
- **PURPOSE:** Daily count email run log.
- **CLIENT DATA / EXPORT:** YES / YES (ops)

---

## Documents / files (DB pointers)

### DocumentUpload
- **PURPOSE:** Uploaded scan/PDF metadata.
- **CLIENT DATA / EXPORT:** YES / YES + file bytes
- **SENSITIVE:** NO
- **PK:** id. **tenantId** default `"default"`
- **Files:** storageBucket, storagePath, publicUrl
- **Dates:** uploadedAt

### GeneratedPdf
- **PURPOSE:** Generated PDF URL record.
- **CLIENT DATA / EXPORT:** YES / YES + file
- **Files:** pdfUrl

### GeneratedReport
- **PURPOSE:** Report file path/url.
- **CLIENT DATA / EXPORT:** YES / YES + file
- **Files:** filePath, publicUrl

### TaskFile
- **PURPOSE:** Attachment on a task group.
- **CLIENT DATA / EXPORT:** YES / YES + file
- **Files:** fileUrl, storagePath

### OcrCache
- **PURPOSE:** Cached OCR text by file hash.
- **CLIENT DATA / EXPORT:** YES (their document text) / YES in technical
- **SENSITIVE:** MEDIUM (full OCR payload)
- **PK:** fileHash

---

## Tasks / work / attendance

### TaskTemplate / WorkTemplate / WorkTemplateTask
- **PURPOSE:** Reusable daily-work templates.
- **CLIENT DATA / EXPORT:** YES / YES
- **Status:** TaskTemplate.isActive

### EmployeeWorkSession / EmployeeTaskGroup / EmployeeTask
- **PURPOSE:** Assigned work for a day (Employee card).
- **CLIENT DATA / EXPORT:** YES / YES
- **Status:** PENDING | IN_PROGRESS | COMPLETED; session ACTIVE | ENDED
- **Dates:** workDate, startedAt, completedAt, targetDueAt

### TaskGroup / TaskGroupMember
- **PURPOSE:** Ad-hoc campaign/workspace (files + members).
- **CLIENT DATA / EXPORT:** YES / YES
- **Status:** OPEN | IN_PROGRESS | COMPLETED | ARCHIVED

### WorkflowTask / WorkflowTemplate / WorkflowTemplateItem / WorkflowRun / WorkflowRunItem
- **PURPOSE:** Timed workflow runs (can be archived/deleted).
- **CLIENT DATA / EXPORT:** YES / YES
- **Soft delete:** archivedAt, deletedAt — keep in technical backup

### WorkSession
- **PURPOSE:** User clock-in/out session.
- **CLIENT DATA / EXPORT:** YES / YES
- **Status:** WorkSessionStatus

### WorkShift / Attendance / AttendanceEditLog
- **PURPOSE:** Planned shifts + actual hours + edit history.
- **CLIENT DATA / EXPORT:** YES / YES
- **Dates:** workDate, clockIn, clockOut, createdAt, updatedAt

### DynamicFormField
- **PURPOSE:** Configurable form fields (legacy forms).
- **CLIENT DATA / EXPORT:** YES / YES

### Recipe / RecipeStep / RecipeRun / RecipeRunStep
- **PURPOSE:** Kitchen recipes and run history.
- **CLIENT DATA / EXPORT:** YES / YES
- **Status:** Recipe.isActive; RecipeRun.status

---

## Users / notifications / system

### User
- **PURPOSE:** Login identity, role, permissions link, language.
- **CLIENT DATA / EXPORT:** YES (profile/role) / YES with redaction
- **SENSITIVE:** YES — never export `passwordHash`, `currentSessionId`
- **PK:** id. **Unique:** email, nationalId?
- **Relations:** UserPermission, Employee?, many audit/work FKs
- **Status:** isActive, role, mustChangePassword

### UserPermission
- **PURPOSE:** Permission keys for ADMIN/EMPLOYEE (SUPER_ADMIN = all keys).
- **CLIENT DATA / EXPORT:** YES / YES
- **PK:** id. **Unique:** [userId, permission]

### PasswordResetToken
- **PURPOSE:** Hashed reset codes.
- **CLIENT DATA / EXPORT:** NO / NO (technical vault only if restore required)
- **SENSITIVE:** YES

### LoginAudit
- **PURPOSE:** Login/logout attempts (IP, user-agent).
- **CLIENT DATA / EXPORT:** technical YES / client-friendly optional
- **SENSITIVE:** MEDIUM (IP)

### ActivityLog
- **PURPOSE:** Coarse user actions (login/logout).
- **CLIENT DATA / EXPORT:** YES / YES

### EmployeeNote
- **PURPOSE:** Personal staff notes.
- **CLIENT DATA / EXPORT:** YES / YES
- **businessId** default `"default"`

### Notification / StaffAlert / EmailLog / SystemNotificationRecipient
- **PURPOSE:** In-app + email notification history and extra recipients.
- **CLIENT DATA / EXPORT:** YES / YES
- **SENSITIVE:** LOW (emails)

---

## Classification totals

| | Count |
|---|---|
| Models | 71 |
| Client-data models | 69 |
| Do not put in client-friendly zip | PasswordResetToken; User.passwordHash; User.currentSessionId |
| Technical-only extra caution | LoginAudit, OcrCache.rawResponse, EmailLog errors |

---

## Key relationship chains (keep IDs)

```
Customer → FinancialDocument → FinancialDocumentItem
Customer → Payment → CheckPayment
Customer → CheckPayment
FinancialDocument → DocumentUpload / GeneratedPdf / LedgerEntry / CashFlowEntry

Supplier → LedgerEntry
Supplier → FinancialDocument (expense)
Supplier → SupplierProduct → SupplierProductPriceHistory

Employee → LedgerEntry
Employee → EmployeeWorkSession → EmployeeTaskGroup → EmployeeTask

FutureOrder → OrderPayment → CashFlowEntry (relatedOrderId / orderPaymentId)

InventoryLocation → InventoryProductOnLocation → InventoryProduct
InventoryCountSession → InventoryCount → InventoryCountWorker

User → UserPermission
User → Attendance / WorkSession / WorkShift
User → WorkflowRun

TaskGroup → TaskFile + TaskGroupMember
```

---

## Read-only count helper (not run against Production)

`npx tsx scripts/audit-handover-counts.ts`

Prints model counts only. Never prints `DATABASE_URL`.
