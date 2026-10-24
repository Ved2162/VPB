"use client";
import { apiFetch } from "@/lib/api-client";
import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef, useSyncExternalStore } from "react";

import { isKiteIdentity } from './catalog-identity';
import { localStore } from "./browser-state";

export type CartLine = { id: string; slug: string; name: string; price: number; comparePrice?: number | null; image: string; qty: number; stock: number };
export type Me = { id: string; name: string; phone: string; role: string } | null;

const cartStore = localStore<CartLine[]>("vpb_cart", [], (value): value is CartLine[] => Array.isArray(value) && value.every(line => line && typeof line.id === "string" && typeof line.slug === "string" && typeof line.name === "string" && Number.isFinite(line.price) && Number.isInteger(line.qty) && line.qty > 0 && line.qty <= 99));
const CartCtx = createContext<{
  lines: CartLine[]; add: (p: Omit<CartLine, "qty">, qty?: number) => void;
  setQty: (id: string, qty: number) => void; remove: (id: string) => void; clear: () => void;
  open: boolean; setOpen: (v: boolean) => void; count: number; subtotal: number; lastAdded: number;
  ready: boolean;
}>({ lines: [], add: () => {}, setQty: () => {}, remove: () => {}, clear: () => {}, open: false, setOpen: () => {}, count: 0, subtotal: 0, lastAdded: 0, ready: false });

const AuthCtx = createContext<{
  me: Me; loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  setUser: (u: Me) => void;
}>({ me: null, loading: true, refresh: async () => {}, logout: async () => {}, setUser: () => {} });

const ToastCtx = createContext<{ toast: (msg: string) => void }>({ toast: () => {} });

export function useCart() { return useContext(CartCtx); }
export function useAuth() { return useContext(AuthCtx); }
export function useToast() { return useContext(ToastCtx); }

async function fetchMe(): Promise<Me> {
  try {
    const r = await apiFetch("/api/auth", { credentials: "include", cache: "no-store", signal: AbortSignal.timeout(8000) });
    const j = await r.json();
    return j.user || null;
  } catch {
    return null;
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  const lines = useSyncExternalStore(cartStore.subscribe, cartStore.snapshot, cartStore.serverSnapshot);
  const setLines = cartStore.update;
  useEffect(() => { if (cartStore.snapshot().some(isKiteIdentity)) cartStore.update(previous => previous.filter(line => !isKiteIdentity(line))); }, []);
  const cartReady = useSyncExternalStore(cartStore.subscribe, () => true, () => false);
  const [open, setOpen] = useState(false);
  const [lastAdded, setLastAdded] = useState(0);
  const [me, setMe] = useState<Me>(null);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const authRequest = useRef(0);

  const toast = useCallback((msg: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  const refresh = useCallback(async () => {
    const sequence = ++authRequest.current;
    setLoading(true);
    const user = await fetchMe();
    if (sequence === authRequest.current) { setMe(user); setLoading(false); }
  }, []);

  useEffect(() => {
    const sequence = ++authRequest.current;
    let cancelled = false;
    fetchMe().then(user => { if (!cancelled && sequence === authRequest.current) { setMe(user); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const logout = useCallback(async () => {
    ++authRequest.current;
    // Clear cookie on server first
    await apiFetch("/api/auth", { method: "DELETE", credentials: "include" });
    // Then clear local state
    setMe(null);
    setLoading(false);
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
  }, [setLines]);

  const setQty = useCallback((id: string, qty: number) => {
    setLines((prev) => qty <= 0 ? prev.filter((l) => l.id !== id) : prev.map((l) => (l.id === id ? { ...l, qty: Math.min(qty, l.stock || 99) } : l)));
  }, [setLines]);

  const remove = useCallback((id: string) => setLines((p) => p.filter((l) => l.id !== id)), [setLines]);
  const clear = useCallback(() => setLines([]), [setLines]);

  // setUser: called after OTP verify — sets me immediately AND marks loading done
  const setUser = useCallback((u: Me) => {
    ++authRequest.current;
    setMe(u);
    setLoading(false);
  }, []);

  const { count, subtotal } = useMemo(() => ({
    count: lines.reduce((a, l) => a + l.qty, 0),
    subtotal: lines.reduce((a, l) => a + l.qty * l.price, 0),
  }), [lines]);

  return (
    <AuthCtx.Provider value={{ me, loading, refresh, logout, setUser }}>
      <CartCtx.Provider value={{ lines, add, setQty, remove, clear, open, setOpen, count, subtotal, lastAdded, ready: cartReady }}>
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
