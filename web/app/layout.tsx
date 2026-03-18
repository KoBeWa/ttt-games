import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: {
    default: "TTT Games",
    template: "%s | TTT Games",
  },
  description: "NFL Pick'em, Playoff Challenge, Mock Draft und mehr.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://ttt-games.vercel.app"
  ),
  openGraph: {
    siteName: "TTT Games",
    type: "website",
    locale: "de_DE",
  },
  robots: {
    index: process.env.NODE_ENV === "production",
    follow: process.env.NODE_ENV === "production",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
