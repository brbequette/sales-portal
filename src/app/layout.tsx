import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ZohoProvider } from "@/components/ZohoProvider";
import { AuthWrapper } from "@/components/AuthWrapper";
import { AppShell } from "@/components/AppShell";
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
        <ZohoProvider>
          <AuthWrapper>
            <AppShell>
              {children}
            </AppShell>
          </AuthWrapper>
        </ZohoProvider>
      </body>
    </html>
  );
}
