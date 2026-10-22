"use client";
import { useState } from 'react';
import { officialTrackingUrl } from '@/lib/couriers';

export function CourierTracking({ courier, docket }: { courier: string | null; docket: string }) {
  const [message, setMessage] = useState('');
  const url = officialTrackingUrl(courier, docket);
  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(docket);
      setMessage('Tracking ID copied');
    } catch {
      const focused = document.activeElement;
      const input = document.createElement('textarea');
      input.value = docket;
      input.setAttribute('readonly', '');
      input.style.position = 'fixed';
      input.style.opacity = '0';
      // Keep the fallback inside a modal when called from the shipment editor.
      (document.querySelector('dialog[open]') || document.body).appendChild(input);
      input.select(); input.setSelectionRange(0, docket.length);
      try { setMessage(document.execCommand('copy') ? 'Tracking ID copied' : 'Select and copy the tracking ID shown above.'); }
      catch { setMessage('Select and copy the tracking ID shown above.'); }
      finally { input.remove(); if (focused instanceof HTMLElement) focused.focus(); }
    }
  }
  if (!url) return <p className="mt-4 text-sm">Tracking details will be available after dispatch.</p>;
  return <div className="mt-4 text-sm">
    <p className="font-bold">{courier}</p><p className="mt-1 break-all font-mono">{docket}</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" className="btn-ghost" onClick={copy}>Copy Tracking ID</button>
      <a className="btn-primary" href={url} target="_blank" rel="noopener noreferrer">Track Shipment</a>
    </div>
    <p className="mt-2 text-xs text-stone-500">Opens the official courier website. If needed, paste your tracking ID there.</p>
    <p role="status" className="mt-1 text-xs">{message}</p>
  </div>;
}
