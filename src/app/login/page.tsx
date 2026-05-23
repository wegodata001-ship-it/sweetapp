"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { Lock, ShieldCheck, User } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import styles from "./login.module.css";

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
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ identifier: identifier.trim(), password }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
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
        const code = data.code ?? "";
        const msg =
          code === "inactive"
            ? t("auth.errorInactive")
            : code === "use_national_id"
              ? t("auth.errorUseNationalId")
              : code === "server_config"
                ? t("auth.errorServerConfig")
                : data.error || t("auth.errorInvalidCredentials");
        setError(msg);
        setSubmitting(false);
        return;
      }
      if (data.user) setSessionUser(data.user);
      setSubmitting(false);
      if (data.user?.mustChangePassword) {
        router.replace("/change-password");
        return;
      }
      const dest =
        data.user?.role === "EMPLOYEE" && (nextUrl === "/" || nextUrl === "")
          ? "/employee"
          : nextUrl;
      router.replace(dest);
    } catch {
      setError(t("auth.errorNetwork"));
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
                <p className={styles.error} role="alert">
                  {error}
                </p>
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
