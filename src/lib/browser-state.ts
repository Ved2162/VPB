"use client";

// Stable snapshots let React hydrate browser persistence without a second effect-driven render.
export function localStore<T>(key: string, initial: T, valid: (value: unknown) => value is T) {
  let raw: string | null | undefined; let value = initial;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(listener => listener());
  const snapshot = () => {
    if (typeof window === 'undefined') return initial;
    try {
      const current = localStorage.getItem(key);
      if (current !== raw) {
        raw = current;
        const parsed: unknown = current ? JSON.parse(current) : initial;
        value = valid(parsed) ? parsed : initial;
      }
    } catch { /* Keep the usable in-memory snapshot when browser storage is unavailable. */ }
    return value;
  };
  return {
    snapshot, serverSnapshot: () => initial,
    subscribe(listener: () => void) {
      listeners.add(listener);
      const storage = (event: StorageEvent) => { if (event.key === key || event.key === null) notify(); };
      window.addEventListener('storage', storage);
      return () => { listeners.delete(listener); window.removeEventListener('storage', storage); };
    },
    update(next: T | ((previous: T) => T)) {
      const previous = snapshot(); value = typeof next === 'function' ? (next as (previous: T) => T)(previous) : next;
      try { const saved = JSON.stringify(value); localStorage.setItem(key, saved); raw = saved; } catch { /* Memory state remains available. */ }
      notify();
    },
  };
}
