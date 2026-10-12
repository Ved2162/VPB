import 'server-only';

// Preserve provider error structure while stripping echoed credentials/customer data.
export function sanitizeMsg91(value: unknown, secrets: string[] = []): unknown {
  const scrub = (text: string) => {
    let result = text;
    for (const secret of secrets.filter(Boolean).sort((a, b) => b.length - a.length)) result = result.split(secret).join('[redacted]');
    return result.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
      .replace(/(?<![\w])\+?\d[\d ().-]{6,}\d(?![\w])/g, '[redacted-number]');
  };
  if (typeof value === 'string') return scrub(value);
  if (Array.isArray(value)) return value.map(item => sanitizeMsg91(item, secrets));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    /auth|api.?key|token|secret|password|signature|cookie|customer|recipient|address|email|phone|number|^to$|^content$|^value$|^name$/i.test(key)
      ? '[redacted]' : sanitizeMsg91(item, secrets),
  ]));
  return value;
}

export async function providerBody(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (raw.length > 65536) return { error: 'provider_response_too_large', bytes: raw.length };
  try { return JSON.parse(raw); } catch { return { nonJsonResponse: raw }; }
}
