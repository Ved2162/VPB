import { requireDeliveryPage } from '@/lib/delivery-page';
import DeliveryDashboard from '@/components/delivery-dashboard';
export const dynamic = 'force-dynamic';
export default async function DeliveryPage() {
  await requireDeliveryPage();
  return <DeliveryDashboard />;
}
