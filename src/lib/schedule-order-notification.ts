import { after } from 'next/server';
import { safelyProcessOrderNotifications } from './order-notifications';

export function scheduleOrderNotification(orderId: string) {
  try { after(async () => { await safelyProcessOrderNotifications(orderId); }); }
  catch { console.error('[whatsapp]', { code: 'schedule_failed' }); }
  // The durable row remains available to the scheduled worker even if scheduling fails.
}
