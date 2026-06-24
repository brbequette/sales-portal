import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextAuthProvider } from "@/components/NextAuthProvider";
import { ZohoProvider } from "@/components/ZohoProvider";
import { AuthWrapper } from "@/components/AuthWrapper";
import { AppShell } from "@/components/AppShell";
import { ProductModalProvider } from "@/components/ProductModalProvider";
import { TimeclockTracker } from "@/components/TimeclockTracker";
import Softphone from "@/components/Softphone";
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
                  <AppShell>
                    <TimeclockTracker />
                    {children}
                    <Softphone />
                  </AppShell>
                </ProductModalProvider>
              </AuthWrapper>
            </PreferencesProvider>
          </ZohoProvider>
        </NextAuthProvider>
      </body>
    </html>
  );
}
