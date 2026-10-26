// Retired gateway endpoint: cannot create, verify, fail, or refund any payment.
export async function POST() {
  return Response.json({ ok: false, error: 'This payment endpoint is retired. Use PayU checkout.' }, { status: 410, headers: { 'Cache-Control': 'no-store' } });
}
