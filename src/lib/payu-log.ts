import 'server-only';

// Deliberately exclude provider payloads, credentials and customer details.
export function payuLog(stage: string, metadata: {
  orderId?: string; txnid?: string; status?: string; state?: string;
  httpStatus?: number; code?: string; amountPaise?: number;
}) {
  console.info('[payu]', { stage, ...metadata });
}
