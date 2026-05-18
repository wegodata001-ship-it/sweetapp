import { prismaAny } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { logActivity } from "@/lib/activity-log";
import type { TranslateFn } from "@/lib/i18n/translator";
import { passwordPolicyViolation } from "@/lib/auth/password-policy";

export type PasswordChangeError = {
  ok: false;
  status: number;
  code: string;
  message: string;
};

export type PasswordChangeOk = { ok: true };

export async function executeSelfServicePasswordChange(options: {
  userId: string;
  currentPassword?: string;
  newPassword: string;
  confirmPassword: string;
  t: TranslateFn;
}): Promise<PasswordChangeOk | PasswordChangeError> {
  const { userId, currentPassword = "", newPassword: rawNew, confirmPassword: rawConfirm, t } = options;
  const newPassword = rawNew.trim();
  const confirm = rawConfirm.trim();

  if (!newPassword || !confirm) {
    return {
      ok: false,
      status: 400,
      code: "VALIDATION_ERROR",
      message: t("auth.errors.passwordFieldsRequired"),
    };
  }

  if (newPassword !== confirm) {
    return {
      ok: false,
      status: 400,
      code: "PASSWORD_MISMATCH",
      message: t("auth.errors.passwordMismatch"),
    };
  }

  const policy = passwordPolicyViolation(newPassword);
  if (policy) {
    const message =
      policy === "PASSWORD_TOO_SHORT"
        ? t("auth.errors.passwordTooShort")
        : policy === "PASSWORD_NO_UPPERCASE"
          ? t("auth.errors.passwordNoUppercase")
          : t("auth.errors.passwordNoDigit");
    return { ok: false, status: 400, code: policy, message };
  }

  const user = (await prismaAny.user.findUnique({
    where: { id: userId },
    select: { id: true, passwordHash: true, mustChangePassword: true, isActive: true },
  })) as {
    id: string;
    passwordHash: string;
    mustChangePassword: boolean;
    isActive: boolean;
  } | null;

  if (!user || !user.isActive) {
    return {
      ok: false,
      status: 401,
      code: "UNAUTHORIZED",
      message: t("auth.errors.inactiveOrMissing"),
    };
  }

  if (!user.mustChangePassword) {
    const cur = currentPassword.trim();
    if (!cur) {
      return {
        ok: false,
        status: 400,
        code: "CURRENT_PASSWORD_REQUIRED",
        message: t("auth.errors.currentPasswordRequired"),
      };
    }
    const match = await verifyPassword(cur, user.passwordHash);
    if (!match) {
      return {
        ok: false,
        status: 401,
        code: "CURRENT_PASSWORD_INVALID",
        message: t("auth.errors.currentPasswordWrong"),
      };
    }
  }

  const sameAsBefore = await verifyPassword(newPassword, user.passwordHash);
  if (sameAsBefore) {
    return {
      ok: false,
      status: 400,
      code: "PASSWORD_SAME_AS_BEFORE",
      message: t("auth.errors.passwordSameAsBefore"),
    };
  }

  const newHash = await hashPassword(newPassword);
  await prismaAny.user.update({
    where: { id: user.id },
    data: {
      passwordHash: newHash,
      mustChangePassword: false,
      passwordUpdatedAt: new Date(),
    },
  });

  await logActivity(user.id, "password_change");
  return { ok: true };
}
