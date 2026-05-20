import { render } from "@react-email/render";
import type { SystemEmailTemplate } from "@/lib/email/types";
import { getEmailConfig } from "@/lib/email/config";
import { TaskAssignedEmail, type TaskAssignedEmailData } from "@/lib/email/templates/task-assigned";
import { TaskCompletedEmail, type TaskCompletedEmailData } from "@/lib/email/templates/task-completed";
import { ShiftLateEmail, type ShiftLateEmailData } from "@/lib/email/templates/shift-late";
import { CheckDepositEmail, type CheckDepositEmailData } from "@/lib/email/templates/check-deposit";
import { FutureOrderEmail, type FutureOrderEmailData } from "@/lib/email/templates/future-order";
import { NewUpdateEmail, type NewUpdateEmailData } from "@/lib/email/templates/new-update";
import { SystemAlertEmail, type SystemAlertEmailData } from "@/lib/email/templates/system-alert";
import { TestSimpleEmail, type TestSimpleEmailData } from "@/lib/email/templates/test-simple";

export async function renderSystemEmail(
  template: SystemEmailTemplate,
  data: Record<string, unknown>,
): Promise<string> {
  const { appUrl } = getEmailConfig();
  const base = { appUrl, ...data };

  switch (template) {
    case "test-simple":
      return render(<TestSimpleEmail data={base as unknown as TestSimpleEmailData} />);
    case "task-assigned":
      return render(<TaskAssignedEmail data={base as unknown as TaskAssignedEmailData} />);
    case "task-completed":
      return render(<TaskCompletedEmail data={base as unknown as TaskCompletedEmailData} />);
    case "shift-late":
      return render(<ShiftLateEmail data={base as unknown as ShiftLateEmailData} />);
    case "check-deposit":
      return render(<CheckDepositEmail data={base as unknown as CheckDepositEmailData} />);
    case "future-order":
      return render(<FutureOrderEmail data={base as unknown as FutureOrderEmailData} />);
    case "new-update":
      return render(<NewUpdateEmail data={base as unknown as NewUpdateEmailData} />);
    case "system-alert":
      return render(<SystemAlertEmail data={base as unknown as SystemAlertEmailData} />);
    default:
      return render(
        <SystemAlertEmail
          data={{ appUrl, title: "התראת מערכת", message: String(data.message ?? "") }}
        />,
      );
  }
}
