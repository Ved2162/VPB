"use client";
import { specificationRows, type ProductSpec, type ProductSpecs } from '@/lib/product-specs';

export function SpecificationEditor({ value, onChange, disabled }: { value: ProductSpecs; onChange: (rows: ProductSpec[]) => void; disabled?: boolean }) {
  // Keep unfinished rows while editing; the API ignores entirely blank rows on save.
  const rows = Array.isArray(value) ? value : specificationRows(value);
  const change = (index: number, field: 'label' | 'value', text: string) => onChange(rows.map((row, i) => i === index ? { ...row, [field]: text } : row));
  const move = (index: number, offset: number) => {
    const next = [...rows];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    onChange(next);
  };
  return <fieldset disabled={disabled} className="space-y-2 rounded-xl border border-[#ecdcb9] p-3">
    <legend className="label px-1">Public product specifications</legend>
    <p className="text-xs text-stone-500">Add Base, Coating, or other verified details. Rows appear in this order on cards and product pages. Brand and cord count form the category label. Length details appear below unless a Lengths row is supplied.</p>
    {rows.map((row, index) => <div key={index} className="space-y-2 rounded-lg border border-[#ecdcb9] p-2">
      <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
        <input aria-label={`Specification ${index + 1} label`} maxLength={60} className="input" placeholder="Base" value={row.label} onChange={e => change(index, 'label', e.target.value)} />
        <input aria-label={`Specification ${index + 1} value`} maxLength={200} className="input" placeholder="Verified product detail" value={row.value} onChange={e => change(index, 'value', e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <button type="button" aria-label={`Move specification ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)} className="btn-ghost !px-3 !py-1 disabled:opacity-40">Move up</button>
        <button type="button" aria-label={`Move specification ${index + 1} down`} disabled={index === rows.length - 1} onClick={() => move(index, 1)} className="btn-ghost !px-3 !py-1 disabled:opacity-40">Move down</button>
        <button type="button" aria-label={`Remove specification ${index + 1}`} onClick={() => onChange(rows.filter((_, i) => i !== index))} className="btn-ghost !px-3 !py-1">Remove</button>
      </div>
    </div>)}
    <button type="button" disabled={rows.length >= 12} onClick={() => onChange([...rows, { label: '', value: '' }])} className="btn-ghost !py-2 text-xs disabled:opacity-40">Add specification</button>
  </fieldset>;
}
