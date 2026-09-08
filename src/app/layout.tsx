import type { Metadata, Viewport } from "next";
import { GeistSans, GeistMono } from "./fonts";
import { Suspense } from "react";
import { AppShell, DisplayAwareAppShell } from "@/components/AppShell";
import Script from "next/script";
import { TimeclockTracker } from "@/components/TimeclockTracker";
import { ClientToaster } from "@/components/ClientToaster";
import { PwaInstaller } from "@/components/PwaInstaller";
import "./globals.css";

import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "Titan Diamond - Unified Hub",
  description: "Sales, Collections, and Commissions -- all in one place",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/titan-app-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/titan-app-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/titan-apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#05080c",
};

import { ThemeProvider } from "@/components/ThemeProvider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const appContent = (
    <>
      <TimeclockTracker />
      <ClientToaster />
      <PwaInstaller />
      {children}
    </>
  );

  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <head>
        <link rel="apple-touch-icon" href="/titan-apple-touch-icon.png" />
      </head>
      <body className="antialiased">
        <Script src="https://live.zwidgets.com/js-sdk/1.2/ZohoEmbededAppSDK.min.js" strategy="afterInteractive" />
        <ThemeProvider>
          <Providers>
            <Suspense fallback={<AppShell>{appContent}</AppShell>}>
              <DisplayAwareAppShell>{appContent}</DisplayAwareAppShell>
            </Suspense>
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
