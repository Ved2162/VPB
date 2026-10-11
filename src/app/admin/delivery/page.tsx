import { requireDeliveryPage } from '@/lib/delivery-page';
import DeliveryAdmin from '@/components/delivery-admin';
export const dynamic = 'force-dynamic';
export default async function AdminDeliveryPage() {
  await requireDeliveryPage(true);
  return <DeliveryAdmin />;
}
