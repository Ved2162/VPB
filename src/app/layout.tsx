import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "@/lib/store";
import { Navbar, Footer, CartDrawer, RevealInit } from "@/components/site";
import RazorpayLoader from "@/lib/razorpay-client";

export const metadata: Metadata = {
  title: "VPB — Verai Patang Bhandar | Premium Bareilly Manjha & Kites",
  description: "VPB Verai Patang Bhandar — 100% pure cotton Bareilly manjha, premium kites. Hand-crafted, quality tested, shipped across India.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Providers>
          <RevealInit />
          <Navbar />
          <CartDrawer />
          <RazorpayLoader />
          <main className="min-h-[60vh]">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
