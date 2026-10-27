export type ProductSpec = { label: string; value: string };
export type ProductSpecs = Record<string, string> | ProductSpec[];

// Legacy objects remain readable; arrays preserve administrator-defined order in JSONB.
export function specificationRows(input: unknown): ProductSpec[] {
  const rows = Array.isArray(input) ? input : input && typeof input === 'object'
    ? Object.entries(input).map(([label, value]) => ({ label, value })) : [];
  return rows.filter((row): row is ProductSpec => !!row && typeof row.label === 'string' && typeof row.value === 'string')
    .map(({ label, value }) => ({ label: label.trim(), value: value.trim() }))
    .filter(row => row.label && row.value);
}

export function validateSpecifications(input: unknown): ProductSpecs {
  if (!input || typeof input !== 'object') throw new Error('Specifications must be a list of label/value pairs.');
  const rows = Array.isArray(input) ? input : Object.entries(input).map(([label, value]) => ({ label, value }));
  if (rows.length > 12) throw new Error('Use at most 12 short specifications.');
  const labels = new Set<string>();
  const validated = rows.flatMap(row => {
    if (!row || typeof row.label !== 'string' || typeof row.value !== 'string' || Object.keys(row).some(key => !['label', 'value'].includes(key))) throw new Error('Each specification needs a label and a value.');
    const label = row.label.trim(), value = row.value.trim();
    if (!label && !value) return [];
    if (!label || !value) throw new Error('Complete both the label and value, or leave both blank to skip the specification.');
    if (!label || !value || label.length > 60 || value.length > 200) throw new Error('Specification labels require 1–60 characters and values require 1–200 characters.');
    if (labels.has(label.toLowerCase())) throw new Error('Specification labels must be unique.');
    labels.add(label.toLowerCase());
    return [{ label, value }];
  });
  return Array.isArray(input) ? validated : Object.fromEntries(validated.map(row => [row.label, row.value]));
}

export function productSpecificationRows(product: { specs?: unknown; length?: string | null }) {
  const rows = specificationRows(product.specs);
  if (product.length?.trim() && !rows.some(row => /^(lengths?|reels?)$/i.test(row.label))) rows.push({ label: 'Lengths', value: product.length.trim() });
  return rows;
}

export function productDisplayName(product: { name: string; reelCount?: string | null }) {
  const variant = product.reelCount?.trim();
  return variant && !product.name.toLowerCase().includes(variant.toLowerCase()) ? `${product.name} (${variant})` : product.name;
}
