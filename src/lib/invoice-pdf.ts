import 'server-only';
import PDFDocument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { orderInvoices, invoiceCancellations } from '@/db/schema';

const currency = (v: number) => `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (v: Date | string) => new Date(v).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });
export async function renderInvoicePdf(invoice: typeof orderInvoices.$inferSelect, cancellation?: typeof invoiceCancellations.$inferSelect) {
  const [regular, bold, logo] = await Promise.all([
    readFile(path.join(process.cwd(), 'assets/invoice/NotoSans-Regular.ttf')),
    readFile(path.join(process.cwd(), 'assets/invoice/NotoSans-Bold.ttf')),
    readFile(path.join(process.cwd(), 'public/images/vpb-logo.svg'), 'utf8'),
  ]);
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true, info: { Title: invoice.invoiceNumber, Author: invoice.snapshot.seller.name } });
  const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', chunk => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
  });
  doc.registerFont('regular', regular).registerFont('bold', bold).font('regular');
  const s = invoice.snapshot, width = 515.28;
  let y = 40;
  const text = (value: string, x: number, top: number, w: number, size = 9, strong = false, align: 'left' | 'right' = 'left') => {
    doc.font(strong ? 'bold' : 'regular').fontSize(size).fillColor('#302c28').text(value, x, top, { width: w, align, lineGap: 3 });
  };
  const space = (height: number) => {
    if (y + height > 766) { doc.addPage(); y = 46; text(`${invoice.invoiceNumber} | continued`, 40, y, width, 10, true); y += 30; }
  };
  const paragraph = (value: string, strong = false, size = 9) => {
    doc.font(strong ? 'bold' : 'regular').fontSize(size);
    const height = doc.heightOfString(value, { width, lineGap: 3 });
    space(height + 10); text(value, 40, y, width, size, strong); y += height + 10;
  };
  SVGtoPDF(doc, logo, 40, 35, { width: 198, height: 55, preserveAspectRatio: 'xMinYMin meet' });
  text('ORDER RECEIPT', 310, 40, 245, 17, true, 'right');
  text(invoice.invoiceNumber, 310, 68, 245, 10, true, 'right');
  y = 113;
  doc.moveTo(40, y).lineTo(555, y).strokeColor('#c9a24b').lineWidth(2).stroke(); y += 18;
  paragraph(s.seller.name, true, 12);
  if (s.seller.address) paragraph(s.seller.address);
  if (s.seller.phone || s.seller.email) paragraph([s.seller.phone, s.seller.email].filter(Boolean).join(' | '));
  paragraph(`Issued: ${date(invoice.issuedAt)}  |  Order: ${s.orderNumber}  |  Paid: ${date(s.paidAt)}`);
  if (cancellation) {
    paragraph(`CANCELLED - ${date(cancellation.createdAt)}`, true, 12);
    paragraph(`Reason: ${cancellation.reason}`);
  }
  paragraph('CUSTOMER & DELIVERY ADDRESS', true, 10);
  paragraph([s.customer.name, s.customer.phone, s.customer.email].filter(Boolean).join(' | '));
  paragraph([s.address.name, s.address.addressLine, s.address.landmark, s.address.city, s.address.state, s.address.pincode].filter(Boolean).join(', '));
  paragraph('Billing address: same as the checkout delivery address. Separate billing details were not collected.', false, 8);
  const cols = [40, 218, 251, 326, 391, 450], widths = [170, 28, 70, 60, 54, 105];
  const header = () => {
    space(36); doc.rect(40, y - 5, width, 27).fill('#7a1f1f');
    ['Item', 'Qty', 'Unit price', 'Discount', 'Tax', 'Line total'].forEach((v, i) => {
      doc.font('bold').fontSize(8).fillColor('#ffffff').text(v, cols[i] + 3, y, { width: widths[i] - 6, align: i === 0 ? 'left' : 'right' });
    }); y += 31;
  };
  header();
  for (const item of s.items) {
    doc.font('regular').fontSize(9);
    const height = Math.max(30, doc.heightOfString(item.name, { width: widths[0] - 6, lineGap: 3 }) + 15);
    if (y + height > 750) { space(766); header(); }
    [item.name, String(item.quantity), currency(item.unitPrice), '-', '-', currency(item.total)].forEach((v, i) => text(v, cols[i] + 3, y, widths[i] - 6, 9, false, i === 0 ? 'left' : 'right'));
    y += height; doc.moveTo(40, y - 7).lineTo(555, y - 7).strokeColor('#eadfc9').lineWidth(0.5).stroke();
  }
  y += 8;
  paragraph('Line totals are quantity × unit price, before the order-level discount. Item discounts and tax allocations are not separately recorded.', false, 8);
  space(150);
  for (const [label, value] of [['Subtotal', s.subtotal], ['Shipping', s.shipping], ['Order discount', -s.discount], ['TOTAL PAID', s.total]] as const) {
    const total = label === 'TOTAL PAID';
    if (total) doc.rect(310, y - 5, 245, 31).fill('#fff6e3');
    text(label, 310, y, 124, total ? 11 : 9, total); text(currency(value), 435, y, 117, total ? 11 : 9, total, 'right'); y += 30;
  }
  paragraph(s.taxNote, false, 8);
  paragraph(`Payment: ${s.paymentMethod.toUpperCase()} | Paid - verified by the backend at issuance.`, true);
  paragraph('Thank you for shopping with Verai Patang Bhandar.');
  if (s.seller.phone || s.seller.email) paragraph(`Need help? ${[s.seller.phone, s.seller.email].filter(Boolean).join(' | ')}`);
  const pages = doc.bufferedPageRange();
  for (let p = 0; p < pages.count; p++) {
    doc.switchToPage(p);
    // The footer sits outside the body margin; prevent PDFKit from creating
    // another page while we add buffered page numbers.
    doc.page.margins.bottom = 20;
    doc.moveTo(40, 786).lineTo(555, 786).strokeColor('#eadfc9').stroke();
    text(`${invoice.invoiceNumber} | Page ${p + 1} of ${pages.count}`, 40, 794, width, 8, false, 'right');
    doc.page.margins.bottom = 40;
  }
  doc.end(); return result;
}
