"use client";
import Script from "next/script";
import { useEffect } from "react";

declare global {
  interface Window { Razorpay?: any; }
}

export default function RazorpayLoader() {
  return <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />;
}

export function openRazorpay(options: {
  key: string;
  order: { id: string; amount: number; currency: string };
  prefill?: { name?: string; email?: string; contact?: string };
  onSuccess: (payload: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void;
  onFailure: (error?: any) => void;
  themeColor?: string;
  name?: string;
  description?: string;
}) {
  if (typeof window === "undefined" || !window.Razorpay) {
    options.onFailure({ code: "RZP_NOT_LOADED", description: "Razorpay checkout failed to load. Retry or check your connection." });
    return;
  }
  const rzp = new window.Razorpay({
    key: options.key,
    amount: options.order.amount, // in paise
    currency: options.order.currency || "INR",
    name: options.name || "VPB — Verai Patang Bhandar",
    description: options.description || "VPB Manjha Order",
    order_id: options.order.id,
    prefill: {
      name: options.prefill?.name || "",
      email: options.prefill?.email || "",
      contact: options.prefill?.contact || "",
    },
    theme: { color: options.themeColor || "#7a1f1f" },
    modal: {
      ondismiss: () => options.onFailure({ code: "CANCELLED", description: "Payment was cancelled" }),
    },
    handler: function (resp: any) {
      options.onSuccess({
        razorpay_order_id: resp.razorpay_order_id,
        razorpay_payment_id: resp.razorpay_payment_id,
        razorpay_signature: resp.razorpay_signature,
      });
    },
  });
  rzp.on("payment.failed", function (resp: any) {
    options.onFailure(resp.error || resp);
  });
  rzp.open();
}
