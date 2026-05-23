import type { Metadata, Viewport } from "next";
import { Cairo, Geist, Geist_Mono, Tajawal } from "next/font/google";
import { cookies } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { AuthProvider } from "@/components/auth-provider";
import { NotificationsProvider } from "@/components/notifications-provider";
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

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const tajawal = Tajawal({
  variable: "--font-tajawal",
  subsets: ["arabic"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get(WEGO_LOCALE_COOKIE)?.value);
  const t = createTranslator(locale);
  return {
    title: {
      default: `${t("meta.appTitle")} · ${t("meta.erpShort")}`,
      template: `%s · ${t("meta.erpShort")}`,
    },
    description: t("meta.appDescription"),
    icons: {
      icon: [
        { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
    },
    appleWebApp: {
      capable: true,
      title: t("meta.erpShort"),
      statusBarStyle: "black-translucent",
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#071826",
};

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
      className={`${geistSans.variable} ${geistMono.variable} ${cairo.variable} ${tajawal.variable} h-full antialiased`}
    >
      <body
        className={`min-h-full bg-white text-slate-950 locale-${locale}`}
        suppressHydrationWarning
      >
        <AuthProvider>
          <I18nProvider initialLocale={locale}>
            <ToastProvider>
              <NotificationsProvider>
                <AppShell>{children}</AppShell>
              </NotificationsProvider>
            </ToastProvider>
          </I18nProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
