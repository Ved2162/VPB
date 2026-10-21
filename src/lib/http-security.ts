import { DeliveryError } from './shipment-rules';

export const MAX_BODY_BYTES = 64 * 1024;
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalJson((value as Record<string, unknown>)[key])).join(',') + '}';
  return JSON.stringify(value);
}
export async function readBytes(req: Request, limit = MAX_BODY_BYTES) {
  if (Number(req.headers.get('content-length') || 0) > limit) throw new DeliveryError('Request too large', 413);
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new DeliveryError('Request too large', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
export async function readBody(req: Request, limit = MAX_BODY_BYTES) {
  return new TextDecoder().decode(await readBytes(req, limit));
}
export async function readJson(req: Request): Promise<Record<string, any>> {
  const raw = await readBody(req);
  try {
    const body = JSON.parse(raw);
    if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error();
    return body;
  } catch { throw new DeliveryError('Invalid JSON request', 400); }
}
export function safeReturnPath(value: string | null, fallback = '/account') {
  return value && /^\/(?!\/)/.test(value) && !/[\\\u0000-\u0020]/.test(value) ? value : fallback;
}
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
export function phoneNumber(value: unknown) {
  if (typeof value !== 'string') throw new DeliveryError('Enter a valid mobile number');
  const digits = value.replace(/[\s+().-]/g, '');
  const phone = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  if (!/^[6-9]\d{9}$/.test(phone)) throw new DeliveryError('Enter a valid 10-digit Indian mobile number');
  return phone;
}
