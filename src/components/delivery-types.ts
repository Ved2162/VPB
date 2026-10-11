import { apiFetch } from '@/lib/api-client';
export type Provider = { id: string; name: string; trackingUrl: string; active: boolean };
export type Staff = { id: string; name: string; phone: string; active: boolean; allOrders: boolean };
export type Settings = { providers: Provider[]; staff: Staff[]; me: { id: string; role: string; name: string; allOrders: boolean } };
export type ShipmentRow = {
  id: string; orderNumber: string; createdAt: string; customerName: string | null; customerPhone: string | null;
  shippingAddress: Record<string, string>; paymentStatus: string; paymentMethod: string; orderStatus: string;
  courier: string | null; docketNumber: string; trackingUrl: string; status: string; providerId: string | null;
  assignedTo: string | null; internalNotes: string; version: number; updatedAt: string;
  items: { id: string; productName: string; quantity: number }[];
};
export class DeliveryRequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function deliveryRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init);
  const result = await response.json();
  if (!response.ok) throw new DeliveryRequestError(result.error || 'Unable to complete request', response.status);
  return result;
}
