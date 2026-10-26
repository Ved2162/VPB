// Browser-only hosted checkout transport. A submitted form is not evidence that
// navigation succeeded, or that a payment failed if the browser stays here.
export function submitPayuForm(action: string, fields: Record<string, string>) {
  if (!['https://test.payu.in/_payment', 'https://secure.payu.in/_payment'].includes(action))
    throw new Error('Invalid checkout destination');
  if (!fields || typeof fields !== 'object' || Array.isArray(fields) ||
    Object.values(fields).some(value => typeof value !== 'string')) throw new Error('Invalid checkout request');
  return new Promise<void>((resolve, reject) => {
    const form = document.createElement('form');
    form.method = 'POST'; form.action = action; form.hidden = true;
    for (const [name, value] of Object.entries(fields)) {
      const input = document.createElement('input'); input.type = 'hidden'; input.name = name; input.value = value; form.appendChild(input);
    }
    const cleanup = () => {
      window.clearTimeout(timer);
      window.removeEventListener('pagehide', departed);
      document.removeEventListener('securitypolicyviolation', blocked);
      form.remove();
    };
    const failed = () => {
      // Cancel a blocked/stalled document load so the current page remains
      // usable. This says nothing about the provider's transaction outcome.
      window.stop();
      cleanup();
      reject(new Error('The browser could not open PayU. Your payment result is still unknown. Check payment status below; retry only after PayU confirms this attempt has ended. If it stays pending, contact support with your order reference.'));
    };
    const departed = () => { cleanup(); resolve(); };
    const blocked = (event: SecurityPolicyViolationEvent) => {
      if (event.effectiveDirective === 'form-action' && event.disposition === 'enforce') failed();
    };
    const timer = window.setTimeout(failed, 12000);
    window.addEventListener('pagehide', departed, { once: true });
    document.addEventListener('securitypolicyviolation', blocked);
    document.body.appendChild(form);
    try { HTMLFormElement.prototype.submit.call(form); }
    catch { failed(); }
  });
}
