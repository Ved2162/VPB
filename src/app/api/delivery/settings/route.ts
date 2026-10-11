import { db } from '@/db';
import { deliveryAudit, deliveryProviders, deliveryStaff, users, shipments, shipmentHistory, type ShipmentSnapshot } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { hashPassword } from '@/lib/auth';
import { deliveryFailure, deliveryUser, jsonBody, mutation } from '@/lib/delivery-server';
import { DeliveryError, exactKeys, textField, trackingUrl, uuid } from '@/lib/shipment-rules';

export async function GET(req: Request) {
  try {
    const me = await deliveryUser(req);
    const [providers, staff] = await Promise.all([
      db.select().from(deliveryProviders).orderBy(deliveryProviders.name),
      me.role === 'admin' ? db.select({ id: users.id, name: users.name, phone: users.phone, active: users.active, allOrders: deliveryStaff.allOrders }).from(users).innerJoin(deliveryStaff, eq(deliveryStaff.userId, users.id)).where(eq(users.role, 'delivery')).orderBy(users.name) : Promise.resolve([]),
    ]);
    return Response.json({ ok: true, providers, staff, me: { id: me.id, role: me.role, name: me.name, allOrders: me.allOrders } });
  } catch (error) { return deliveryFailure(error); }
}

export async function DELETE(req: Request) {
  try {
    const me = await mutation(req, true);
    const body = await jsonBody(req);
    exactKeys(body, ['id']);
    const id = uuid(body.id);
    await db.transaction(async tx => {
      const [staff] = await tx.select().from(users).where(eq(users.id, id)).for('update');
      if (!staff || staff.role !== 'delivery') throw new DeliveryError('Delivery staff account not found', 404);
      const assigned = await tx.select().from(shipments).where(eq(shipments.assignedTo, id)).for('update');
      const events = assigned.map(shipment => {
        const before: ShipmentSnapshot = { providerId: shipment.providerId, courierName: shipment.courierName, trackingUrl: shipment.trackingUrl, docketNumber: shipment.docketNumber, status: shipment.status, internalNotes: shipment.internalNotes, assignedTo: id };
        const after = { ...before, assignedTo: null };
        return { orderId: shipment.orderId, actorId: me.id, actorName: me.name, before, after };
      });
      if (events.length) {
        await tx.update(shipments).set({ assignedTo: null, version: sql`${shipments.version} + 1`, updatedAt: new Date() }).where(eq(shipments.assignedTo, id));
        await tx.insert(shipmentHistory).values(events);
      }
      await tx.insert(deliveryAudit).values({ actorId: me.id, resource: 'staff', resourceId: id, changes: { deleted: true, name: staff.name, phone: staff.phone, assignmentsReleased: assigned.length } });
      await tx.delete(users).where(eq(users.id, id));
    });
    return Response.json({ ok: true });
  } catch (error) { return deliveryFailure(error); }
}

export async function POST(req: Request) {
  try {
    const me = await mutation(req, true);
    const body = await jsonBody(req);
    if (body.resource === 'provider') {
      exactKeys(body, ['resource', 'id', 'name', 'trackingUrl', 'active']);
      const name = textField(body.name, 'courier name', 80, true);
      const url = trackingUrl(body.trackingUrl);
      if (!url) throw new DeliveryError('Courier tracking website is required');
      if (typeof body.active !== 'boolean') throw new DeliveryError('Active must be true or false');
      const id = body.id ? uuid(body.id) : undefined;
      const active = body.active;
      const provider = await db.transaction(async tx => {
        const [before] = id ? await tx.select().from(deliveryProviders).where(eq(deliveryProviders.id, id)).for('update') : [];
        if (id && !before) throw new DeliveryError('Courier not found', 404);
        const payload = { name, trackingUrl: url, active, updatedAt: new Date() };
        const [after] = id ? await tx.update(deliveryProviders).set(payload).where(eq(deliveryProviders.id, id)).returning() : await tx.insert(deliveryProviders).values(payload).returning();
        await tx.insert(deliveryAudit).values({ actorId: me.id, resource: 'provider', resourceId: after.id, changes: { before: before || null, after } });
        return after;
      });
      return Response.json({ ok: true, provider });
    }
    if (body.resource === 'staff') {
      exactKeys(body, ['resource', 'id', 'name', 'phone', 'password', 'active', 'allOrders']);
      const name = textField(body.name, 'staff name', 120, true);
      const phone = textField(body.phone, 'phone', 20, true).replace(/[\s\-().]/g, '');
      if (!/^\+?[0-9]{7,15}$/.test(phone)) throw new DeliveryError('Enter a valid phone number');
      if (typeof body.active !== 'boolean' || typeof body.allOrders !== 'boolean') throw new DeliveryError('Permissions must be true or false');
      const id = body.id ? uuid(body.id) : undefined;
      const password = body.password === undefined ? '' : textField(body.password, 'password', 72);
      if ((!id || password) && (password.length < 12 || Buffer.byteLength(password) > 72)) throw new DeliveryError('Staff passwords must be 12–72 bytes');
      const passwordHash = password ? await hashPassword(password) : undefined;
      const active = body.active, allOrders = body.allOrders;
      const staff = await db.transaction(async tx => {
        const [before] = id ? await tx.select().from(users).where(eq(users.id, id)).for('update') : [];
        if (id && before?.role !== 'delivery') throw new DeliveryError('Delivery staff account not found', 404);
        const [permissions] = id ? await tx.select().from(deliveryStaff).where(eq(deliveryStaff.userId, id)) : [];
        const data = { name, phone, active, ...(passwordHash ? { passwordHash } : {}) };
        const [after] = id ? await tx.update(users).set(data).where(eq(users.id, id)).returning() : await tx.insert(users).values({ ...data, passwordHash: passwordHash!, role: 'delivery' }).returning();
        await tx.insert(deliveryStaff).values({ userId: after.id, allOrders }).onConflictDoUpdate({ target: deliveryStaff.userId, set: { allOrders } });
        const safe = { id: after.id, name, phone, active, allOrders };
        await tx.insert(deliveryAudit).values({ actorId: me.id, resource: 'staff', resourceId: after.id, changes: { before: before ? { name: before.name, phone: before.phone, active: before.active, allOrders: permissions?.allOrders } : null, after: safe, passwordChanged: !!passwordHash } });
        return safe;
      });
      return Response.json({ ok: true, staff });
    }
    throw new DeliveryError('Unknown resource');
  } catch (error) { return deliveryFailure(error); }
}
