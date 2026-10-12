export type InvoiceSnapshot = {
  version: 1; orderNumber: string; paidAt: string; paymentMethod: string;
  seller: { name: string; address: string; phone: string; email: string };
  customer: { name: string; phone: string; email: string };
  address: Record<string, string>; billingSameAsDelivery: true;
  items: { name: string; quantity: number; unitPrice: number; total: number }[];
  subtotal: number; shipping: number; discount: number; total: number;
  kind: 'order_receipt'; taxNote: string;
};
