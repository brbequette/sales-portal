import type { Metadata, Viewport } from "next";
import { GeistSans, GeistMono } from "./fonts";
import { AppShell } from "@/components/AppShell";
import Script from "next/script";
import { TimeclockTracker } from "@/components/TimeclockTracker";
import { ClientToaster } from "@/components/ClientToaster";
import { AiAssistant } from "@/components/AiAssistant";
import "./globals.css";

import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "Titan Diamond - Unified Hub",
  description: "Sales, Collections, and Commissions -- all in one place",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0d0e10",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <head>
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body className="antialiased">
        <Script src="https://live.zwidgets.com/js-sdk/1.2/ZohoEmbededAppSDK.min.js" strategy="beforeInteractive" />
        <Script src="https://js.authorize.net/v1/Accept.js" strategy="afterInteractive" />
        <Providers>
          <AppShell>
            <TimeclockTracker />
            <ClientToaster />
            {children}
          </AppShell>
          <AiAssistant />
        </Providers>
      </body>
    </html>
  );
}
