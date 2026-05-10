import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_Arabic } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { AuthProvider } from "@/components/auth-provider";
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

export const metadata: Metadata = {
  title: "WEGO BUSINESS",
  description: "מערכת ניהול כספים, תפעול ומשימות בארגון.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="he"
      dir="rtl"
      className={`${geistSans.variable} ${geistMono.variable} ${notoArabic.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-white text-slate-950">
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
