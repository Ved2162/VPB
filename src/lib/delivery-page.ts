import { getSessionUser } from '@/lib/auth';
import { db } from '@/db';
import { deliveryStaff, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';

export async function requireDeliveryPage(adminOnly = false) {
  const token = await getSessionUser();
  if (!token) redirect(adminOnly ? '/admin/login' : '/delivery/login');
  const [user] = await db.select().from(users).where(eq(users.id, token.id));
  if (!user?.active || (user.role !== 'admin' && (adminOnly || user.role !== 'delivery'))) redirect('/delivery/login');
  if (user.role === 'delivery') {
    const [permission] = await db.select().from(deliveryStaff).where(eq(deliveryStaff.userId, user.id));
    if (!permission) redirect('/delivery/login');
  }
}
