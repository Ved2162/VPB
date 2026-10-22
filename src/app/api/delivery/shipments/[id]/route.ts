import { courierByName, officialTrackingUrl } from '@/lib/couriers';
import { db } from '@/db';
import { deliveryProviders, deliveryStaff, orders, shipmentHistory, shipments, users, type ShipmentSnapshot } from '@/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { deliveryFailure, deliveryUser, jsonBody, mutation } from '@/lib/delivery-server';
import { DeliveryError, exactKeys, textField, trackingUrl, uuid, validateTransition } from '@/lib/shipment-rules';

type Context = { params: Promise<{ id: string }> };
export async function GET(req: Request, { params }: Context) {
  try {
    const me = await deliveryUser(req);
    const id = uuid((await params).id);
    const [row] = await db.select({ id: orders.id }).from(orders).leftJoin(shipments, eq(shipments.orderId, orders.id)).where(and(eq(orders.id, id), me.allOrders ? undefined : eq(shipments.assignedTo, me.id)));
    if (!row) throw new DeliveryError('Shipment not found', 404);
    const history = await db.select().from(shipmentHistory).where(eq(shipmentHistory.orderId, id)).orderBy(desc(shipmentHistory.createdAt), desc(shipmentHistory.id)).limit(200);
    return Response.json({ ok: true, history });
  } catch (error) { return deliveryFailure(error); }
}

export async function PATCH(req: Request, { params }: Context) {
  try {
    const me = await mutation(req);
    const id = uuid((await params).id);
    const body = await jsonBody(req);
    exactKeys(body, ['providerId', 'trackingUrl', 'docketNumber', 'status', 'internalNotes', 'assignedTo', 'version']);
    if (!Number.isInteger(body.version) || Number(body.version) < 0) throw new DeliveryError('Shipment version required');
    if ('assignedTo' in body && me.role !== 'admin') throw new DeliveryError('Only the main admin can assign shipments', 403);
    const result = await db.transaction(async tx => {
      // Lock the parent even for a first assignment: serializes concurrent inserts and history.
      const [order] = await tx.select().from(orders).where(eq(orders.id, id)).for('update');
      if (!order) throw new DeliveryError('Shipment not found', 404);
      const [existing] = await tx.select().from(shipments).where(eq(shipments.orderId, id));
      // Check account and permissions again inside the save transaction.
      const [currentUser] = await tx.select().from(users).where(eq(users.id, me.id)).for('share');
      const [permission] = await tx.select().from(deliveryStaff).where(eq(deliveryStaff.userId, me.id)).for('share');
      if (!currentUser?.active || !['admin', 'delivery'].includes(currentUser.role)) throw new DeliveryError('Not permitted', 403);
      if (currentUser.role !== 'admin' && (!permission || (!permission.allOrders && existing?.assignedTo !== me.id))) throw new DeliveryError('Shipment not found', 404);
      if ('assignedTo' in body && currentUser.role !== 'admin') throw new DeliveryError('Only the main admin can assign shipments', 403);
      const before: ShipmentSnapshot = {
        providerId: existing?.providerId || null, courierName: existing?.courierName ?? order.courier,
        trackingUrl: existing?.trackingUrl || '', docketNumber: existing?.docketNumber ?? order.trackingNumber ?? '',
        status: existing?.status || 'NOT_ASSIGNED', internalNotes: existing?.internalNotes || '', assignedTo: existing?.assignedTo || null,
      };
      const after: ShipmentSnapshot = { ...before };
      if ('assignedTo' in body) {
        after.assignedTo = body.assignedTo === null ? null : uuid(body.assignedTo);
        if (after.assignedTo) {
          const [staff] = await tx.select({ active: users.active }).from(users).innerJoin(deliveryStaff, eq(deliveryStaff.userId, users.id)).where(and(eq(users.id, after.assignedTo), eq(users.role, 'delivery')));
          if (!staff?.active) throw new DeliveryError('Choose an active delivery staff member');
        }
      }
      if ('providerId' in body) after.providerId = body.providerId === null ? null : uuid(body.providerId);
      if ('docketNumber' in body) after.docketNumber = textField(body.docketNumber, 'docket number', 80);
      if (after.docketNumber && !/^[A-Za-z0-9][A-Za-z0-9 /_-]*$/.test(after.docketNumber)) throw new DeliveryError('Docket number may contain letters, numbers, spaces, /, - and _');
      if ('internalNotes' in body) after.internalNotes = textField(body.internalNotes, 'internal notes', 2000);
      if ('status' in body) {
        if (typeof body.status !== 'string') throw new DeliveryError('Invalid shipment status');
        after.status = body.status;
      }
      if ('trackingUrl' in body) after.trackingUrl = trackingUrl(body.trackingUrl);
      if (after.providerId) {
        const [provider] = await tx.select().from(deliveryProviders).where(eq(deliveryProviders.id, after.providerId));
        if (!provider || (!provider.active && after.providerId !== before.providerId)) throw new DeliveryError('Choose an active courier provider');
        after.courierName = provider.name;
        if (!courierByName(provider.name) && (after.providerId !== before.providerId || after.docketNumber !== before.docketNumber)) throw new DeliveryError('Choose Shree Anjani or Shree Maruti');
        after.trackingUrl = officialTrackingUrl(provider.name, after.docketNumber);
        if ('trackingUrl' in body && body.trackingUrl && body.trackingUrl !== after.trackingUrl && body.trackingUrl !== courierByName(provider.name)?.baseUrl) throw new DeliveryError('Tracking link does not match the selected courier and docket');
      } else if ('providerId' in body) {
        after.courierName = null;
        after.trackingUrl = '';
      }
      if (after.docketNumber && !after.providerId) throw new DeliveryError('Select a courier before adding a docket number');
      if (after.providerId && !after.docketNumber && ('providerId' in body || 'docketNumber' in body)) throw new DeliveryError('Docket number is required for the selected courier');
      if (after.trackingUrl && !after.providerId) throw new DeliveryError('Select a courier before adding a tracking URL');
      if (JSON.stringify(before) === JSON.stringify(after)) return { changed: false, version: existing?.version || 0 };
      if (body.version !== (existing?.version || 0)) throw new DeliveryError('Another staff member changed this shipment. Refresh and try again.', 409);
      validateTransition(before.status, after.status);
      if (!['NOT_ASSIGNED', 'CANCELLED'].includes(after.status) && (!after.providerId || !after.docketNumber)) throw new DeliveryError('Courier and docket number are required before assigning shipment status');
      const version = (existing?.version || 0) + 1;
      const updatedAt = new Date();
      await tx.insert(shipments).values({ orderId: id, ...after, version, updatedAt }).onConflictDoUpdate({ target: shipments.orderId, set: { ...after, version, updatedAt } });
      // Keep existing order views compatible; never change order or payment status here.
      await tx.update(orders).set({ courier: after.courierName, trackingNumber: after.docketNumber || null }).where(eq(orders.id, id));
      await tx.insert(shipmentHistory).values({ orderId: id, actorId: me.id, actorName: currentUser.name, before, after });
      return { changed: true, version };
    });
    return Response.json({ ok: true, ...result });
  } catch (error) { return deliveryFailure(error); }
}
