import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ZohoProvider } from "@/components/ZohoProvider";

import { AuthWrapper } from "@/components/AuthWrapper";
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
  title: "Titan Diamond - Sales Portal",
  description: "Sales management system and AI assistant",
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
      </head>
      <body className="antialiased">
        <ZohoProvider>
          <AuthWrapper>
            {children}
          </AuthWrapper>
        </ZohoProvider>
      </body>
    </html>
  );
}
