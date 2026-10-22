// Verified against the official forms on 2026-10-22. Both accept ?awb=.
// Never derive a destination from a staff-entered or historical tracking URL.
export const COURIERS = [
  { name: 'Shree Anjani', baseUrl: 'https://shreeanjani.co.in/tracking/' },
  { name: 'Shree Maruti', baseUrl: 'https://shreemaruti.com/track-shipment/' },
] as const;

export function courierByName(name: unknown) {
  return COURIERS.find(c => c.name === name);
}

export function validDocket(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 80 && /^[A-Za-z0-9][A-Za-z0-9 /_-]*$/.test(value);
}

export function officialTrackingUrl(name: unknown, docket: unknown): string {
  const courier = courierByName(name);
  return courier && validDocket(docket) ? `${courier.baseUrl}?awb=${encodeURIComponent(docket)}` : '';
}
