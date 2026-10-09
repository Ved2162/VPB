"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/store";

// Registration is now handled via OTP flow on the login page.
// This page simply redirects to /login so existing links don't break.
export default function RegisterPage() {
  const { me, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && me) {
      router.replace(me.role === "admin" ? "/admin" : "/account");
    } else if (!loading) {
      router.replace("/login");
    }
  }, [me, loading, router]);

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="skel h-64 rounded-[22px]" />
    </div>
  );
}