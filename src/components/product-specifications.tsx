import { productSpecificationRows } from '@/lib/product-specs';

export function ProductSpecifications({ product, compact = false }: { product: { specs?: unknown; length?: string | null }; compact?: boolean }) {
  const rows = productSpecificationRows(product);
  if (!rows.length) return null;
  return <dl className={compact ? 'mt-2 space-y-1 text-[12px] leading-snug text-stone-600' : 'divide-y divide-[#f3e8d0]'}>
    {rows.map(({ label, value }) => <div key={label} className={compact ? 'break-words [overflow-wrap:anywhere]' : 'flex flex-wrap justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-sm [overflow-wrap:anywhere]'}>
      <dt className={compact ? 'inline font-semibold' : 'text-stone-500'}>{label}{compact ? ': ' : ''}</dt>
      <dd className={compact ? 'inline' : 'min-w-0 font-bold'}>{value}</dd>
    </div>)}
  </dl>;
}
