import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DownFlick — Universal Media Downloader",
  description: "Paste any link. DownFlick detects the platform and downloads straight to your device.",
  keywords: [
    "downloader",
    "youtube downloader",
    "tiktok downloader",
    "instagram downloader",
    "facebook downloader",
    "twitter downloader",
    "video downloader",
    "mp3 converter",
  ],
  authors: [{ name: "RYZISHIN" }],
  openGraph: {
    title: "DownFlick — Universal Media Downloader",
    description: "Paste any link. DownFlick detects the platform and downloads straight to your device.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body
        className={`${geistSans.variable} antialiased bg-[#0a0a0f] text-zinc-100 min-h-screen`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
