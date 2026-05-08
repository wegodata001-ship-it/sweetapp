import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Sidebar } from "@/components/sidebar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WEGO ERP V1.0",
  description: "Enterprise ERP system for finance and operations workflows.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-slate-100 text-slate-950">
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="border-b border-slate-200 bg-white/85 px-5 py-4 backdrop-blur lg:hidden">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.24em]">
                    WEGO
                  </p>
                  <p className="text-xs font-semibold text-slate-500">
                    ERP V1.0
                  </p>
                </div>
                <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-bold text-white">
                  Command Center
                </span>
              </div>
            </header>
            <main className="flex-1 px-5 py-6 sm:px-8 lg:px-10 lg:py-10">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
