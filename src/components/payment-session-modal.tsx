"use client";
import { X, Lock, AlertCircle } from "lucide-react";
import { ButtonLoader } from "./loading";

interface PaymentSessionModalProps {
  isOpen: boolean;
  onStay: () => void;
  onLeave: () => void;
  isCancelling: boolean;
  orderNumber?: string;
}

export function PaymentSessionModal({ isOpen, onStay, onLeave, isCancelling, orderNumber }: PaymentSessionModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
        {/* Header */}
        <div className="border-b border-[#e7d6b8] bg-[#fff6e3] px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-amber-100 text-amber-600">
              <AlertCircle size={20} />
            </span>
            <div>
              <h2 className="font-serif text-lg font-bold text-[#1c0f0a]">
                Your payment session is still active
              </h2>
              {orderNumber && (
                <p className="text-xs text-stone-500">Order {orderNumber}</p>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          <p className="text-sm leading-relaxed text-stone-600">
            You haven't completed or exited your payment session yet. Would you like to continue your payment or leave checkout?
          </p>

          <div className="mt-5 space-y-2">
            {/* Stay Button */}
            <button
              onClick={onStay}
              disabled={isCancelling}
              className="btn-primary w-full !py-3.5 disabled:opacity-60"
            >
              <Lock size={15} /> Stay & Complete Payment
            </button>

            {/* Leave Button */}
            <button
              onClick={onLeave}
              disabled={isCancelling}
              className="btn-ghost w-full !py-3"
            >
              {isCancelling ? (
                <ButtonLoader label="Checking payment status..." />
              ) : (
                "Leave & Cancel Payment"
              )}
            </button>
          </div>

          <p className="mt-4 text-center text-[11px] text-stone-400">
            <Lock size={9} className="inline" /> Your payment data is secured by PayU
          </p>
        </div>
      </div>
    </div>
  );
}
