"use client";

import { useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { MAX_IMAGE_BYTES } from '@/lib/product-images';

export function ProductImagePicker({ value, onChange, disabled, onUploading }: {
  value: string; onChange: (value: string) => void; disabled: boolean; onUploading: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const urls = value.split('\n').map(url => url.trim()).filter(Boolean);

  async function upload(files: File[]) {
    if (disabled || lock.current || !files.length) return;
    if (files.some(file => !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) || file.size > MAX_IMAGE_BYTES)) {
      setError('Choose JPEG, PNG, WebP or GIF images up to 4 MB each.'); return;
    }
    lock.current = true; setUploading(true); onUploading(true); setError('');
    const added: string[] = [];
    try {
      for (const file of files) {
        const response = await apiFetch('/api/admin/images', { method: 'POST', headers: { 'Content-Type': file.type }, body: file }, 60000);
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || 'Upload failed. Please retry.');
        added.push(result.url);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Upload failed. Please retry.'); }
    finally {
      if (added.length) onChange([...new Set([...urls, ...added])].join('\n'));
      lock.current = false; setUploading(false); onUploading(false);
    }
  }

  return <div>
    <p className="label">Product images</p>
    <div onDragOver={event => { event.preventDefault(); if (!disabled && !uploading) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={event => { event.preventDefault(); setDragging(false); void upload(Array.from(event.dataTransfer.files)); }}
      className={`rounded-xl border-2 border-dashed p-5 text-center ${dragging ? 'border-[#7a1f1f] bg-[#f3e6cc]' : 'border-[#dac9a5]'}`}>
      <input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" aria-label="Choose product images" className="sr-only" disabled={disabled || uploading}
        onChange={event => { void upload(Array.from(event.target.files || [])); event.target.value = ''; }} />
      <button type="button" disabled={disabled || uploading} onClick={() => input.current?.click()} className="btn-ghost !py-2 disabled:opacity-60"><Upload size={16} />{uploading ? 'Uploading images...' : 'Choose images'}</button>
      <p className="mt-2 text-sm text-stone-600">or drag and drop images here</p>
      <p className="mt-1 text-xs text-stone-500">JPEG, PNG, WebP or GIF · up to 4 MB each</p>
    </div>
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    {uploading && <p role="status" className="mt-2 text-sm">Uploading images. Please wait before saving.</p>}
    {!!urls.length && <div className="mt-3 flex flex-wrap gap-3">{urls.map((url, index) => <div key={`${index}-${url}`} className="relative">
      <img src={url} alt={`Product image ${index + 1}`} className="h-20 w-20 rounded-lg border border-[#dac9a5] object-cover" />
      <button type="button" aria-label={`Remove image ${index + 1}`} disabled={disabled || uploading} onClick={() => onChange(urls.filter((_, i) => i !== index).join('\n'))} className="absolute -right-2 -top-2 rounded-full bg-white p-1 shadow"><X size={14} /></button>
    </div>)}</div>}
    <label className="label mt-3 block" htmlFor="product-image-urls">Image URLs (one per line)</label>
    <textarea id="product-image-urls" value={value} disabled={disabled || uploading} onChange={event => onChange(event.target.value)} className="input min-h-20 font-mono text-xs" placeholder="https://..." />
  </div>;
}
