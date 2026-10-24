// Shared by admin forms and cart persistence; the business name is never matched.
export function isKiteIdentity(item: { name?: string; slug?: string; sku?: string }) {
  if (item.sku?.startsWith('VPB-KT-')) return true;
  return /\b(kites?|patangs?)\b/i.test(item.name || '') && !/\b(manjha|saddi|charkhi)\b/i.test(item.name || '');
}
