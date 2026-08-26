"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { AlertTriangle, Lock, ShieldCheck, User } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import styles from "./login.module.css";

function loginErrorMessage(code: string | undefined, t: (key: string) => string): string {
  switch (code) {
    case "REQUIRED_FIELDS":
      return t("auth.errors.requiredFields");
    case "INVALID_CREDENTIALS":
    case "bad_credentials":
    case "use_national_id":
      return t("auth.errors.invalidCredentials");
    case "ACCOUNT_DISABLED":
    case "inactive":
      return t("auth.errors.accountDisabled");
    case "SYSTEM_ERROR":
    case "server_error":
    case "server_config":
      return t("auth.errors.systemError");
    default:
      return t("auth.errors.systemError");
  }
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setSessionUser, user, loading } = useAuth();
  const { t, dir } = useI18n();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const nextUrl = searchParams.get("next") || "/";
  const reason = searchParams.get("reason");

  useEffect(() => {
    if (reason === "superseded") {
      setError(t("auth.errorSessionSuperseded"));
    }
  }, [reason, t]);

  useEffect(() => {
    if (!loading && user) {
      if (user.mustChangePassword) {
        router.replace("/change-password");
        return;
      }
      router.replace(nextUrl);
    }
  }, [loading, user, router, nextUrl]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const id = identifier.trim();
    if (!id || !password) {
      setError(t("auth.errors.requiredFields"));
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ identifier: id, password }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        code?: string;
        user?: {
          id: string;
          fullName: string;
          email: string;
          nationalId?: string | null;
          phone?: string | null;
          role: "SUPER_ADMIN" | "ADMIN" | "EMPLOYEE";
          mustChangePassword?: boolean;
          permissions: string[];
        };
      };
      if (!res.ok || !data.ok) {
        setError(loginErrorMessage(data.code, t));
        setSubmitting(false);
        return;
      }
      if (data.user) setSessionUser(data.user);

      if (data.user?.mustChangePassword) {
        window.location.assign("/change-password");
        return;
      }
      const dest =
        data.user?.role === "EMPLOYEE" && (nextUrl === "/" || nextUrl === "")
          ? "/employee"
          : nextUrl.startsWith("/")
            ? nextUrl
            : "/";
      window.location.assign(dest);
    } catch {
      setError(t("auth.errors.systemError"));
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page} dir={dir}>
      <div className={styles.bgMesh} aria-hidden>
        <span className={styles.particle} />
        <span className={styles.particle} />
        <span className={styles.particle} />
        <span className={styles.particle} />
        <span className={styles.particle} />
      </div>

      <div className={styles.lang}>
        <LanguageSwitcher guest />
      </div>

      <div className={styles.grid}>
        <div className={styles.cardWrap}>
          <div className={styles.card}>
            <div className={styles.cardIcon}>
              <ShieldCheck className="h-6 w-6" strokeWidth={2} aria-hidden />
            </div>
            <p className={styles.cardTitle}>WEGO BUSINESS</p>
            <p className={styles.cardSubtitle}>{t("auth.loginControlPanel")}</p>

            <div className={styles.welcome}>
              <p className={styles.welcomeTitle}>{t("auth.loginWelcomeTitle")}</p>
              <p className={styles.welcomeText}>{t("auth.loginWelcomeText")}</p>
            </div>

            <form onSubmit={(e) => void onSubmit(e)} className={styles.form}>
              <div>
                <label htmlFor="identifier" className={styles.label}>
                  {t("auth.identifier")}
                </label>
                <p className="mb-1 text-[11px] font-semibold text-slate-500">{t("auth.identifierHint")}</p>
                <div className={styles.inputWrap}>
                  <span className={styles.inputIcon}>
                    <User className="h-4 w-4" aria-hidden />
                  </span>
                  <input
                    id="identifier"
                    type="text"
                    inputMode="text"
                    autoComplete="username"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={t("auth.identifierPlaceholder")}
                    dir="auto"
                    className={styles.input}
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className={styles.label}>
                  {t("auth.password")}
                </label>
                <div className={styles.inputWrap}>
                  <span className={styles.inputIcon}>
                    <Lock className="h-4 w-4" aria-hidden />
                  </span>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={styles.input}
                    required
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className={styles.togglePass}
                >
                  {showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                </button>
              </div>

              {error ? (
                <div className={styles.error} role="alert">
                  <AlertTriangle className={styles.errorIcon} aria-hidden />
                  <span>{error}</span>
                </div>
              ) : null}

              <button
                type="submit"
                disabled={submitting || !identifier.trim() || !password}
                className={styles.submitBtn}
              >
                {submitting ? t("auth.submitting") : t("auth.loginSubmit")}
              </button>
            </form>

            <p className={styles.footerLinks}>
              {t("auth.needHelp")}
              <br />
              <Link href="/">{t("auth.backHome")}</Link>
            </p>
          </div>
        </div>

        <section className={styles.brand} aria-label={t("auth.loginBrandArea")}>
          <div className={styles.brandCard}>
            <div className={styles.logoStage}>
              <span className={styles.logoGlow} aria-hidden />
              <Image
                src="/logo.png"
                alt="WEGO BUSINESS"
                width={380}
                height={380}
                priority
                className={styles.logoImage}
              />
            </div>
            <p className={styles.brandTitle}>WEGO BUSINESS</p>
            <p className={styles.brandSubtitle}>{t("auth.loginControlPanel")}</p>
            <p className={styles.brandTagline}>{t("auth.loginTagline")}</p>
          </div>
        </section>
      </div>
    </div>
  );
}

function LoginFallback() {
  const { t } = useI18n();
  return (
    <div className={styles.loadingFallback}>
      <p>{t("common.loading")}</p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginContent />
    </Suspense>
  );
}
