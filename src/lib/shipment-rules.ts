import { COURIERS, officialTrackingUrl } from './couriers';

export const SHIPMENT_STATUSES = ['NOT_ASSIGNED', 'ASSIGNED', 'PICKUP_PENDING', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'DELIVERY_FAILED', 'RETURN_TO_ORIGIN', 'CANCELLED'] as const;
export type ShipmentStatus = typeof SHIPMENT_STATUSES[number];
export const TRANSITIONS: Record<ShipmentStatus, readonly ShipmentStatus[]> = {
  NOT_ASSIGNED: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['PICKUP_PENDING', 'PICKED_UP', 'CANCELLED'],
  PICKUP_PENDING: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['IN_TRANSIT', 'RETURN_TO_ORIGIN'],
  IN_TRANSIT: ['OUT_FOR_DELIVERY', 'DELIVERY_FAILED', 'RETURN_TO_ORIGIN'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'DELIVERY_FAILED', 'RETURN_TO_ORIGIN'],
  DELIVERY_FAILED: ['OUT_FOR_DELIVERY', 'IN_TRANSIT', 'RETURN_TO_ORIGIN'],
  DELIVERED: [], RETURN_TO_ORIGIN: [], CANCELLED: [],
};
export const statusLabel = (value: string) => value.toLowerCase().replaceAll('_', ' ').replace(/^./, s => s.toUpperCase());
export class DeliveryError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new DeliveryError('Invalid identifier');
  return value;
}
export function textField(value: unknown, name: string, max: number, required = false): string {
  if (typeof value !== 'string') throw new DeliveryError(`${name} must be text`);
  const clean = value.trim();
  if (clean.length > max || (required && !clean) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(clean)) throw new DeliveryError(`Enter a valid ${name} (maximum ${max} characters)`);
  return clean;
}
export function trackingUrl(value: unknown, providerUrl?: string): string {
  const raw = textField(value, 'tracking URL', 2048);
  if (!raw) return '';
  const allowed = COURIERS.some(c => {
    if (providerUrl && providerUrl !== c.baseUrl) return false;
    if (raw === c.baseUrl) return true;
    try {
      const url = new URL(raw);
      const docket = url.searchParams.get('awb');
      return !!docket && raw === officialTrackingUrl(c.name, docket);
    } catch { return false; }
  });
  if (!allowed) throw new DeliveryError('Choose an official Shree Anjani or Shree Maruti tracking link');
  return raw;
}
export function validateTransition(before: string, after: unknown): asserts after is ShipmentStatus {
  if (typeof after !== 'string' || !SHIPMENT_STATUSES.includes(after as ShipmentStatus)) throw new DeliveryError('Invalid shipment status');
  if (before !== after && !TRANSITIONS[before as ShipmentStatus]?.includes(after as ShipmentStatus)) throw new DeliveryError(`Cannot change ${statusLabel(before)} to ${statusLabel(after)}`);
}
export function exactKeys(body: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(body).some(k => !allowed.includes(k))) throw new DeliveryError('Unsupported field in request');
}
export function sameOrigin(req: Request) {
  if (req.headers.get('sec-fetch-site') === 'cross-site') throw new DeliveryError('Cross-origin request rejected', 403);
  const origin = req.headers.get('origin');
  const expected = new URL(req.url);
  // Next can normalize request.url to localhost; Host retains the browser-facing authority.
  if (req.headers.get('host')) expected.host = req.headers.get('host')!;
  const forwardedProto = req.headers.get('x-forwarded-proto');
  if (forwardedProto === 'https' || forwardedProto === 'http') expected.protocol = forwardedProto + ':';
  if (origin && origin !== expected.origin) throw new DeliveryError('Cross-origin request rejected', 403);
}
