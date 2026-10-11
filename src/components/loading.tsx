"use client";
import { useEffect, useRef, useState, useSyncExternalStore, type ComponentProps, type ReactNode } from 'react';
import NextLink, { useLinkStatus } from 'next/link';
import { createPortal } from 'react-dom';
import { useAuth } from '@/lib/store';
import { activityStore } from '@/lib/api-client';

function BrandMark() {
  return <div className="vpb-loader-circle" aria-hidden="true"><span className="vpb-loader-ring" /><span className="vpb-loader-wordmark">VPB</span></div>;
}
// Each blocking boundary owns a token; one host renders the overlay even when
// authentication and route suspense overlap. Unmounting releases only its token.
const blocking = new Map<symbol, string>();
const blockingListeners = new Set<() => void>();
let blockingLabel = '';
const blockingStore = {
  subscribe(listener: () => void) { blockingListeners.add(listener); return () => { blockingListeners.delete(listener); }; },
  snapshot: () => blockingLabel,
  serverSnapshot: () => '',
};
function publishBlocking() {
  blockingLabel = blocking.values().next().value || '';
  blockingListeners.forEach(listener => listener());
}
function BlockingOverlay({ label }: { label: string }) {
  const [visible, setVisible] = useState(false);
  const [stalled, setStalled] = useState(false);
  const overlay = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const appearance = setTimeout(() => setVisible(true), 180);
    const watchdog = setTimeout(() => setStalled(true), 30000);
    return () => { clearTimeout(appearance); clearTimeout(watchdog); };
  }, []);
  useEffect(() => {
    if (!visible || !overlay.current) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const background = Array.from(document.body.children).filter((el): el is HTMLElement => el instanceof HTMLElement && el !== overlay.current);
    const inert = background.map(el => el.inert);
    background.forEach(el => { el.inert = true; });
    document.body.style.overflow = 'hidden';
    overlay.current.focus({ preventScroll: true });
    return () => {
      background.forEach((el, index) => { el.inert = inert[index]; });
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [visible]);
  if (!visible) return null;
  return createPortal(<div ref={overlay} tabIndex={-1} className="vpb-global-loader" role="dialog" aria-modal="true" aria-label={stalled ? 'Loading interrupted' : label} aria-busy={!stalled} onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const buttons = Array.from(event.currentTarget.querySelectorAll('button'));
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }}>
    <div className="vpb-loader vpb-overlay-content">
      <BrandMark />
      {stalled ? <><p role="alert">This is taking longer than expected.</p><div className="flex gap-3"><button className="btn-primary" onClick={() => window.location.reload()}>Retry</button><button className="btn-ghost" onClick={() => window.history.back()}>Go back</button></div></> : <span className="vpb-overlay-label" role="status" aria-live="polite">{label}</span>}
    </div>
  </div>, document.body);
}
export function OtpAnimation({ state = 'waiting', digits = 0 }: { state?: 'waiting' | 'sending' | 'verifying' | 'verified' | 'error'; digits?: number }) {
  const label = { waiting: 'Your secure sign-in code', sending: 'Sending your secure code…', verifying: 'Checking your code…', verified: 'Code verified', error: 'Check your code and try again' }[state];
  return <div className={`vpb-otp-motion vpb-otp-${state}`} data-state={state} aria-label={label}>
    <div className="vpb-otp-picture" aria-hidden="true">
      <svg viewBox="0 0 96 72" fill="none"><rect x="27" y="4" width="42" height="64" rx="9" className="vpb-otp-phone" /><path d="M42 11h12M44 60h8" className="vpb-otp-line" /><g className="vpb-otp-envelope"><rect x="11" y="23" width="74" height="34" rx="6" className="vpb-otp-paper" /><path d="m14 27 34 21 34-21" className="vpb-otp-line" /></g><g className="vpb-otp-tick"><circle cx="48" cy="37" r="18" /><path d="m39 37 6 6 12-13" /></g></svg>
    </div>
    <div className="vpb-otp-code" aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <span key={index} className={index < digits ? 'vpb-otp-filled' : ''}><i /></span>)}</div>
    <p role={state === 'waiting' ? undefined : 'status'} aria-live="polite">{label}</p>
  </div>;
}
export function SectionLoader({ active = true, label = 'Preparing your experience…', compact = false }: { active?: boolean; label?: string; compact?: boolean }) {
  if (!active) return null;
  return <div role="status" aria-live="polite" className={`vpb-loader vpb-loader-delayed ${compact ? 'vpb-loader-compact' : ''}`}><BrandMark /><span>{label}</span></div>;
}
export function GlobalLoader({ label = 'Preparing your experience...' }: { label?: string }) {
  useEffect(() => {
    const token = Symbol('blocking loader');
    blocking.set(token, label); publishBlocking();
    return () => { blocking.delete(token); publishBlocking(); };
  }, [label]);
  return null;
}
export function ButtonLoader({ label = 'Saving…' }: { label?: string }) {
  return <span className="inline-flex items-center justify-center gap-2"><span aria-hidden="true" className="vpb-button-spinner vpb-loader-delayed" /><span>{label}</span></span>;
}
export function ProductSkeleton({ detail = false, count = 6 }: { detail?: boolean; count?: number }) {
  if (detail) return <div className="vpb-skeleton vpb-loader-delayed grid gap-8 lg:grid-cols-2" aria-hidden="true"><div className="skel aspect-square" /><div className="space-y-4"><div className="skel h-8 w-3/4" /><div className="skel h-5 w-1/2" /><div className="skel h-12" /><div className="skel h-24" /></div></div>;
  return <div className="vpb-skeleton vpb-loader-delayed grid grid-cols-2 gap-4 xl:grid-cols-3" aria-hidden="true">{Array.from({ length: count }, (_, index) => <div key={index} className="card overflow-hidden p-3"><div className="skel aspect-square" /><div className="skel mt-3 h-5 w-3/4" /><div className="skel mt-2 h-4 w-1/2" /></div>)}</div>;
}
export function TableSkeleton({ rows = 4 }: { rows?: number }) {
  return <div className="vpb-skeleton vpb-loader-delayed space-y-3 p-5" aria-hidden="true">{Array.from({ length: rows }, (_, index) => <div key={index} className="skel h-16" />)}</div>;
}
export function LoadingError({ error, retry }: { error: string; retry: () => void }) {
  return <div role="alert" className="my-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}<button type="button" className="ml-3 font-bold underline" onClick={retry}>Retry</button></div>;
}
export function RequestActivity() {
  const pending = useSyncExternalStore(activityStore.subscribe, activityStore.snapshot, activityStore.serverSnapshot);
  const label = useSyncExternalStore(blockingStore.subscribe, blockingStore.snapshot, blockingStore.serverSnapshot);
  const { loading } = useAuth();
  const [initial, setInitial] = useState(true);
  if (initial && !loading) setInitial(false);
  return <>
    {loading && initial && <GlobalLoader label="Preparing your experience..." />}
    {label && <BlockingOverlay label={label} />}
    {pending.length > 0 && <span className="sr-only vpb-request-activity" role="status" aria-live="polite">{pending.length} requests in progress: {pending[0].label}</span>}
  </>;
}
export function useApiActivity(path: string) {
  const pending = useSyncExternalStore(activityStore.subscribe, activityStore.snapshot, activityStore.serverSnapshot);
  return pending.some(activity => activity.path.startsWith(path));
}
function LinkActivity() {
  const { pending } = useLinkStatus();
  return pending ? <span className="vpb-link-pending vpb-loader-delayed" role="status"><span className="vpb-button-spinner" aria-hidden="true" /><span className="sr-only">Opening page…</span></span> : null;
}
export function BrandedLink({ children, ...props }: ComponentProps<typeof NextLink> & { children?: ReactNode }) {
  return <NextLink {...props}>{children}<LinkActivity /></NextLink>;
}
