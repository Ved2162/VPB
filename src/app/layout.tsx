import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "@/lib/store";
import { Navbar, Footer, CartDrawer, RevealInit } from "@/components/site";
import { RequestActivity } from '@/components/loading';

export const metadata: Metadata = {
  icons: { icon: [{ url: '/favicon.ico', sizes: 'any' }, { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' }, { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' }], apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }] },
  title: "VPB — Verai Patang Bhandar | Premium Bareilly Manjha",
  description: "VPB Verai Patang Bhandar — 100% pure cotton Bareilly manjha. Hand-crafted, quality tested, shipped across India.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className="min-h-screen">
        <Providers>
          <RevealInit />
          <Navbar />
          <RequestActivity />
          <CartDrawer />
          <main className="min-h-[60vh]">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
