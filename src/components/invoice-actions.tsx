'use client';
import { useState } from 'react';
import { Download, Share2, ExternalLink } from 'lucide-react';

export function InvoiceActions({ orderId, admin = false }: { orderId: string; admin?: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [fallback, setFallback] = useState(false);
  const endpoint = `/api/orders/${encodeURIComponent(orderId)}/invoice`;
  async function getPdf() {
    const response = await fetch(endpoint, { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || 'Invoice unavailable. Please retry.'); }
    if (!response.headers.get('content-type')?.includes('application/pdf')) throw new Error('Invoice unavailable. Please retry.');
    const name = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] || 'VPB-invoice.pdf';
    const result = new File([await response.blob()], name, { type: 'application/pdf' }); setFile(result); return result;
  }
  const save = (pdf: File) => {
    const url = URL.createObjectURL(pdf), link = document.createElement('a');
    link.href = url; link.download = pdf.name; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  async function download() {
    setBusy(true); setMessage('');
    try { save(await getPdf()); } catch (e) { setMessage(e instanceof Error ? e.message : 'Unable to download. Please retry.'); }
    finally { setBusy(false); }
  }
  async function share() {
    setMessage('');
    // Fetching can consume mobile browsers' user activation. Prepare on the first click,
    // then offer a second, synchronous gesture for navigator.share.
    if (!file) {
      setBusy(true);
      try { await getPdf(); setMessage('PDF ready. Tap Share Invoice again to choose where to share.'); }
      catch (e) { setMessage(e instanceof Error ? e.message : 'Unable to prepare invoice. Please retry.'); }
      finally { setBusy(false); } return;
    }
    if (navigator.canShare?.({ files: [file] }) && navigator.share) {
      try { await navigator.share({ files: [file], title: 'VPB order invoice' }); setMessage('Invoice shared.'); }
      catch (e) { if (!(e instanceof DOMException && e.name === 'AbortError')) { setFallback(true); setMessage('File sharing unavailable. Download the PDF or copy the protected link.'); } }
    } else { setFallback(true); setMessage('Download the PDF to share it, or copy the link. The link requires the order owner or admin to log in.'); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(new URL(endpoint + '?view=true', location.origin).href); setMessage('Protected link copied. Login as the order owner or admin is required.'); }
    catch { setMessage('Copy unavailable. Use Open Invoice or download the PDF.'); }
  }
  async function cancel() {
    const reason = window.prompt('Cancel this receipt with an audit record. Enter a reason (10-500 characters). This does not cancel or refund the order.');
    if (!reason) return;
    setBusy(true);
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel', reason }) });
      const body = await response.json(); if (!body.ok) throw new Error(body.error);
      setFile(null); setMessage('Receipt cancelled with an audit record. Download to view the cancellation.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Unable to cancel receipt'); }
    finally { setBusy(false); }
  }
  return <div className="mt-4">
    <div className="flex flex-wrap justify-start gap-2">
      <button type="button" disabled={busy} onClick={download} className="btn-ghost text-xs disabled:opacity-50"><Download size={15} />{busy ? 'Preparing invoice…' : 'Download Invoice (PDF)'}</button>
      <button type="button" disabled={busy} onClick={share} className="btn-ghost text-xs disabled:opacity-50"><Share2 size={15} />Share Invoice</button>
      <a href={endpoint + '?view=true'} target="_blank" rel="noopener noreferrer" className="btn-ghost text-xs"><ExternalLink size={15} />Open Invoice</a>
      {fallback && <button type="button" onClick={copy} className="btn-ghost text-xs">Copy secure link</button>}
      {admin && <button type="button" disabled={busy} onClick={cancel} className="btn-ghost text-xs">Cancel receipt</button>}
    </div>
    {message && <p role="status" className="mt-2 text-xs text-stone-600">{message} {message.includes('retry') && <button type="button" disabled={busy} onClick={download} className="underline">Retry invoice</button>}</p>}
  </div>;
}
