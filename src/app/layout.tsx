import type { Metadata, Viewport } from "next";
import { GeistSans, GeistMono } from "./fonts";
import { NextAuthProvider } from "@/components/NextAuthProvider";
import { ZohoProvider } from "@/components/ZohoProvider";
import { AuthWrapper } from "@/components/AuthWrapper";
import { AppShell } from "@/components/AppShell";
import Script from "next/script";
import { ProductModalProvider } from "@/components/ProductModalProvider";
import { TimeclockTracker } from "@/components/TimeclockTracker";
import { NotificationProvider } from "@/components/NotificationProvider";
import { ClientToaster } from "@/components/ClientToaster";
import "./globals.css";

import { PreferencesProvider } from "@/components/PreferencesProvider";
import { CampaignProgressProvider } from "@/components/CampaignProgressProvider";

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
        <Script src="https://live.zwidgets.com/js-sdk/1.2/ZohoEmbededAppSDK.min.js" strategy="beforeInteractive" />
        <Script src="https://js.authorize.net/v1/Accept.js" strategy="afterInteractive" />
      </head>
      <body className="antialiased">
        <NextAuthProvider>
          <ZohoProvider>
            <PreferencesProvider>
              <AuthWrapper>
                <ProductModalProvider>
                  <NotificationProvider>
                    <CampaignProgressProvider>
                      <AppShell>
                        <TimeclockTracker />
                        <ClientToaster />
                        {children}
                      </AppShell>
                    </CampaignProgressProvider>
                  </NotificationProvider>
                </ProductModalProvider>
              </AuthWrapper>
            </PreferencesProvider>
          </ZohoProvider>
        </NextAuthProvider>
      </body>
    </html>
  );
}
