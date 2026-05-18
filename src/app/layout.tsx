import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_Arabic } from "next/font/google";
import { cookies } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { AuthProvider } from "@/components/auth-provider";
import { I18nProvider } from "@/components/i18n-provider";
import { ToastProvider } from "@/components/toast-provider";
import {
  WEGO_LOCALE_COOKIE,
  isRtlLocale,
  localeToBcp47,
  normalizeLocale,
} from "@/lib/i18n/constants";
import { createTranslator } from "@/lib/i18n/translator";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoArabic = Noto_Sans_Arabic({
  variable: "--font-noto-arabic",
  subsets: ["arabic"],
  weight: ["500", "600", "700"],
});

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get(WEGO_LOCALE_COOKIE)?.value);
  const t = createTranslator(locale);
  return {
    title: t("meta.appTitle"),
    description: t("meta.appDescription"),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get(WEGO_LOCALE_COOKIE)?.value);
  const dir = isRtlLocale(locale) ? "rtl" : "ltr";
  const lang = localeToBcp47(locale);
  return (
    <html
      lang={lang}
      dir={dir}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${notoArabic.variable} h-full antialiased`}
    >
      <body
        className={`min-h-full bg-white text-slate-950 locale-${locale}`}
        suppressHydrationWarning
      >
        <AuthProvider>
          <I18nProvider initialLocale={locale}>
            <ToastProvider>
              <AppShell>{children}</AppShell>
            </ToastProvider>
          </I18nProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
