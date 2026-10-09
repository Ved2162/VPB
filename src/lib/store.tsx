"use client";
import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";

export type CartLine = { id: string; slug: string; name: string; price: number; comparePrice?: number | null; image: string; qty: number; stock: number };
export type Me = { id: string; name: string; phone: string; role: string } | null;

const CartCtx = createContext<{
  lines: CartLine[]; add: (p: Omit<CartLine, "qty">, qty?: number) => void;
  setQty: (id: string, qty: number) => void; remove: (id: string) => void; clear: () => void;
  open: boolean; setOpen: (v: boolean) => void; count: number; subtotal: number; lastAdded: number;
}>({ lines: [], add: () => {}, setQty: () => {}, remove: () => {}, clear: () => {}, open: false, setOpen: () => {}, count: 0, subtotal: 0, lastAdded: 0 });

const AuthCtx = createContext<{ me: Me; loading: boolean; refresh: () => Promise<void>; logout: () => Promise<void>; setUser: (u: Me) => void }>({ me: null, loading: true, refresh: async () => {}, logout: async () => {}, setUser: () => {} });
const ToastCtx = createContext<{ toast: (msg: string) => void }>({ toast: () => {} });

export function useCart() { return useContext(CartCtx); }
export function useAuth() { return useContext(AuthCtx); }
export function useToast() { return useContext(ToastCtx); }

export function Providers({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [open, setOpen] = useState(false);
  const [lastAdded, setLastAdded] = useState(0);
  const [me, setMe] = useState<Me>(null);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);

  const toast = useCallback((msg: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("vpb_cart");
      if (raw) setLines(JSON.parse(raw));
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem("vpb_cart", JSON.stringify(lines)); } catch {}
  }, [lines]);

  const refresh = useCallback(async () => {
    try {
      const r = await Promise.race([
        fetch("/api/auth", { credentials: "include" }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000)),
      ]);
      const j = await r.json();
      setMe(j.user || null);
    } catch { setMe(null); }
    setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const logout = useCallback(async () => {
    await fetch("/api/auth", { method: "DELETE", credentials: "include" });
    setMe(null);
    toast("Logged out");
  }, [toast]);

  const add = useCallback((p: Omit<CartLine, "qty">, qty = 1) => {
    setLines((prev) => {
      const f = prev.find((l) => l.id === p.id);
      if (f) return prev.map((l) => (l.id === p.id ? { ...l, qty: Math.min(l.qty + qty, l.stock || 99) } : l));
      return [...prev, { ...p, qty: Math.min(qty, p.stock || 99) }];
    });
    setLastAdded(Date.now());
    setOpen(true);
  }, []);
  const setQty = useCallback((id: string, qty: number) => {
    setLines((prev) => qty <= 0 ? prev.filter((l) => l.id !== id) : prev.map((l) => (l.id === id ? { ...l, qty: Math.min(qty, l.stock || 99) } : l)));
  }, []);
  const remove = useCallback((id: string) => setLines((p) => p.filter((l) => l.id !== id)), []);
  const clear = useCallback(() => setLines([]), []);

  const { count, subtotal } = useMemo(() => ({
    count: lines.reduce((a, l) => a + l.qty, 0),
    subtotal: lines.reduce((a, l) => a + l.qty * l.price, 0),
  }), [lines]);

  return (
    <AuthCtx.Provider value={{ me, loading, refresh, logout, setUser: (u) => { setMe(u); setLoading(false); } }}>
      <CartCtx.Provider value={{ lines, add, setQty, remove, clear, open, setOpen, count, subtotal, lastAdded }}>
        <ToastCtx.Provider value={{ toast }}>
          {children}
          <div className="pointer-events-none fixed bottom-6 left-1/2 z-[120] flex -translate-x-1/2 flex-col items-center gap-2">
            {toasts.map((t) => (
              <div key={t.id} className="toast-in pointer-events-auto flex items-center gap-2 rounded-full bg-[#1c0f0a] px-5 py-2.5 text-sm font-medium text-[#f7ead7] shadow-2xl">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#c9a24b]" />
                {t.msg}
              </div>
            ))}
          </div>
        </ToastCtx.Provider>
      </CartCtx.Provider>
    </AuthCtx.Provider>
  );
}
