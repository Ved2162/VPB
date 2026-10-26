export type ApiActivity = { id: number; path: string; label: string };
let nextId = 0;
let activities: readonly ApiActivity[] = [];
const listeners = new Set<() => void>();
const empty: readonly ApiActivity[] = [];
export const activityStore = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  snapshot: () => activities,
  serverSnapshot: () => empty,
};
function publish(value: readonly ApiActivity[]) { activities = value; listeners.forEach(listener => listener()); }
function labelFor(path: string, method: string) {
  if (path.includes('/payment/payu/verify')) return 'Confirming your payment…';
  if (path.includes('/payment')) return 'Preparing secure checkout…';
  if (path.includes('/otp/send')) return 'Sending your secure code...';
  if (path.includes('/otp')) return 'Verifying your account…';
  if (path.includes('/login') || path.includes('/auth')) return 'Checking your account…';
  if (method !== 'GET') return 'Saving your changes…';
  if (path.includes('/products')) return 'Loading products…';
  if (path.includes('/shipments')) return 'Updating shipment information…';
  if (path.includes('/orders')) return 'Loading your orders…';
  if (path.includes('/admin')) return 'Loading dashboard data…';
  return 'Preparing your experience…';
}

// Existing callers consume JSON responses even on failure. Normalize transport failures
// to the same shape, so their busy flags settle instead of hanging on a rejected fetch.
export async function apiFetch(input: string, init?: RequestInit, timeoutMs = 20000): Promise<Response> {
  const path = new URL(input, 'http://localhost').pathname;
  const id = ++nextId;
  publish([...activities, { id, path, label: labelFor(path, init?.method || 'GET') }]);
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  try {
    const response = await fetch(input, { credentials: 'include', cache: 'no-store', ...init, signal });
    const text = await response.text();
    if (!text && response.status === 204) return response;
    try { JSON.parse(text); } catch { return Response.json({ ok: false, error: 'Unable to load this information. Please retry.' }, { status: 502 }); }
    return new Response(text, { status: response.status, statusText: response.statusText, headers: response.headers });
  } catch (error) {
    if (init?.signal?.aborted) throw error;
    return Response.json({ ok: false, error: timeout.aborted ? 'This request took too long. Please retry.' : 'Connection interrupted. Check your connection and retry.' }, { status: timeout.aborted ? 504 : 503 });
  } finally { publish(activities.filter(activity => activity.id !== id)); }
}
