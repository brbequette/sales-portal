import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextAuthProvider } from "@/components/NextAuthProvider";
import { ZohoProvider } from "@/components/ZohoProvider";
import { AuthWrapper } from "@/components/AuthWrapper";
import { AppShell } from "@/components/AppShell";
import Script from "next/script";
import { ProductModalProvider } from "@/components/ProductModalProvider";
import { TimeclockTracker } from "@/components/TimeclockTracker";
import { NotificationProvider } from "@/components/NotificationProvider";
import "./globals.css";

import { PreferencesProvider } from "@/components/PreferencesProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Titan Diamond - Unified Hub",
  description: "Sales, Collections, and Commissions — all in one place",
  manifest: "/manifest.json",
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
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <head>
        <script src="https://live.zwidgets.com/js-sdk/1.2/ZohoEmbededAppSDK.min.js"></script>
        <script src="https://js.authorize.net/v1/Accept.js" charSet="utf-8"></script>
      </head>
      <body className="antialiased">
        <NextAuthProvider>
          <ZohoProvider>
            <PreferencesProvider>
              <AuthWrapper>
                <ProductModalProvider>
                  <NotificationProvider>
                    <AppShell>
                      <TimeclockTracker />
                      {children}
                    </AppShell>
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
