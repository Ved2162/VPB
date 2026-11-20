import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST } from '@/app/api/payment/cancel-session/route';
import { db } from '@/db';
import { orders, payuAttempts, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import * as payu from '@/lib/payu';
import * as payuPayments from '@/lib/payu-payments';
import { testAuth } from './test-helpers';

vi.mock('@/lib/payu', async () => {
  const actual = await vi.importActual('@/lib/payu');
  return {
    ...actual,
    verifyPayuTransaction: vi.fn(),
  };
});

vi.mock('@/lib/payu-payments', async () => {
  const actual = await vi.importActual('@/lib/payu-payments');
  return {
    ...actual,
    reconcilePayu: vi.fn(),
  };
});

describe('PayU Payment Session Cancellation', () => {
  let testUser: any;
  let testOrder: any;
  let testAttempt: any;

  beforeEach(async () => {
    // Create test user
    const [user] = await db.insert(users).values({
      phone: '+919876543210',
      name: 'Test User',
      active: true,
      role: 'customer',
    }).returning();
    testUser = user;

    // Create test order
    const [order] = await db.insert(orders).values({
      userId: testUser.id,
      orderNumber: 'TEST-001',
      subtotal: 1000,
      discount: 50,
      shippingCharge: 0,
      total: 950,
      paymentStatus: 'pending',
      orderStatus: 'placed',
      paymentMethod: 'payu',
      customerName: 'Test User',
      customerEmail: 'test@example.com',
      customerPhone: '+919876543210',
      shippingAddress: {
        name: 'Test User',
        phone: '+919876543210',
        addressLine: '123 Test St',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
      },
      cartSnapshot: [{ id: 'prod-1', qty: 1, price: 1000, name: 'Test Product', image: '' }],
    }).returning();
    testOrder = order;

    // Create test PayU attempt
    const [attempt] = await db.insert(payuAttempts).values({
      txnId: 'test-txn-123',
      orderId: testOrder.id,
      environment: 'test',
      merchantKey: 'test-key',
      amount: 95000, // paise
      firstname: 'Test User',
      email: 'test@example.com',
      status: 'pending',
    }).returning();
    testAttempt = attempt;

    // Link attempt to order
    await db.update(orders)
      .set({ payuTxnId: attempt.txnId })
      .where(eq(orders.id, testOrder.id));
  });

  describe('Test Case 1: Customer Returns and Clicks Stay', () => {
    it('should not modify payment state when user chooses to stay', async () => {
      // This is handled in frontend - no API call made
      // Just verify order remains unchanged
      const [order] = await db.select().from(orders).where(eq(orders.id, testOrder.id));
      expect(order.paymentStatus).toBe('pending');
      expect(order.payuTxnId).toBe(testAttempt.txnId);
    });
  });

  describe('Test Case 2: Customer Returns and Clicks Leave', () => {
    it('should verify payment status when user clicks leave', async () => {
      // Mock PayU verification to return failed status
      vi.mocked(payuPayments.reconcilePayu).mockResolvedValueOnce({
        ...testOrder,
        paymentStatus: 'failed',
      });

      const req = new Request('http://localhost/api/payment/cancel-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'http://localhost',
        },
        body: JSON.stringify({ orderId: testOrder.id }),
      });

      const { authReq } = testAuth(req, testUser);
      const response = await POST(authReq);
      const result = await response.json();

      expect(result.ok).toBe(true);
      expect(result.status).toBe('verified_failed');
      expect(result.paymentStatus).toBe('failed');
      expect(payuPayments.reconcilePayu).toHaveBeenCalledWith(testAttempt.txnId);
    });
  });

  describe('Test Case 3: PayU Confirms Cancellation', () => {
    it('should mark order as failed when PayU confirms cancellation', async () => {
      // Mock PayU verification returning failed/usercancelled
      vi.mocked(payu.verifyPayuTransaction).mockResolvedValueOnce({
        txnid: testAttempt.txnId,
        status: 'failure',
        unmappedstatus: 'usercancelled',
        amt: '950.00',
        productinfo: 'Cotton Manjha',
        udf1: testOrder.id,
        currency: 'INR',
      });

      vi.mocked(payuPayments.reconcilePayu).mockImplementationOnce(async (txnid) => {
        // Simulate reconciliation marking as failed
        await db.update(orders)
          .set({ paymentStatus: 'failed' })
          .where(eq(orders.payuTxnId, txnid));

        await db.update(payuAttempts)
          .set({ status: 'failed', verifiedAt: new Date() })
          .where(eq(payuAttempts.txnId, txnid));

        const [updated] = await db.select().from(orders).where(eq(orders.id, testOrder.id));
        return updated;
      });

      const req = new Request('http://localhost/api/payment/cancel-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'http://localhost',
        },
        body: JSON.stringify({ orderId: testOrder.id }),
      });

      const { authReq } = testAuth(req, testUser);
      const response = await POST(authReq);
      const result = await response.json();

      expect(result.ok).toBe(true);
      expect(result.status).toBe('verified_failed');
      expect(result.paymentStatus).toBe('failed');

      // Verify database was updated
      const [updatedOrder] = await db.select().from(orders).where(eq(orders.id, testOrder.id));
      expect(updatedOrder.paymentStatus).toBe('failed');

      const [updatedAttempt] = await db.select().from(payuAttempts).where(eq(payuAttempts.txnId, testAttempt.txnId));
      expect(updatedAttempt.status).toBe('failed');
      expect(updatedAttempt.verifiedAt).toBeTruthy();
    });
  });

  describe('Test Case 4: PayU Confirms Success', () => {
    it('should finalize payment when PayU confirms success despite cancel request', async () => {
      // Mock PayU verification returning success/captured
      vi.mocked(payuPayments.reconcilePayu).mockImplementationOnce(async (txnid) => {
        // Simulate reconciliation finalizing as paid
        await db.update(orders)
          .set({ paymentStatus: 'paid', orderStatus: 'confirmed' })
          .where(eq(orders.payuTxnId, txnid));

        await db.update(payuAttempts)
          .set({ status: 'paid', paymentId: 'payu-12345', verifiedAt: new Date() })
          .where(eq(payuAttempts.txnId, txnid));

        const [updated] = await db.select().from(orders).where(eq(orders.id, testOrder.id));
        return updated;
      });

      const req = new Request('http://localhost/api/payment/cancel-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'http://localhost',
        },
        body: JSON.stringify({ orderId: testOrder.id }),
      });

      const { authReq } = testAuth(req, testUser);
      const response = await POST(authReq);
      const result = await response.json();

      expect(result.ok).toBe(true);
      expect(result.status).toBe('verified_paid');
      expect(result.paymentStatus).toBe('paid');

      // Verify database was updated
      const [updatedOrder] = await db.select().from(orders).where(eq(orders.id, testOrder.id));
      expect(updatedOrder.paymentStatus).toBe('paid');

      const [updatedAttempt] = await db.select().from(payuAttempts).where(eq(payuAttempts.txnId, testAttempt.txnId));
      expect(updatedAttempt.status).toBe('paid');
      expect(updatedAttempt.paymentId).toBe('payu-12345');
    });
  });

  describe('Test Case 5: Payment Still Pending', () => {
    it('should return still_pending when PayU has not finalized', async () => {
      // Mock PayU verification returning pending status
      vi.mocked(payuPayments.reconcilePayu).mockImplementationOnce(async (txnid) => {
        // Reconciliation keeps status as pending
        await db.update(payuAttempts)
          .set({ verifiedAt: new Date() })
          .where(eq(payuAttempts.txnId, txnid));

        const [updated] = await db.select().from(orders).where(eq(orders.id, testOrder.id));
        return updated;
      });

      const req = new Request('http://localhost/api/payment/cancel-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'http://localhost',
        },
        body: JSON.stringify({ orderId: testOrder.id }),
      });

      const { authReq } = testAuth(req, testUser);
      const response = await POST(authReq);
      const result = await response.json();

      expect(result.ok).toBe(true);
      expect(result.status).toBe('still_pending');
      expect(result.paymentStatus).toBe('pending');
      expect(result.canRetry).toBe(false);
    });
  });

  describe('Test Case 6: Already Paid Order', () => {
    it('should return already_paid when order was previously finalized', async () => {
      // Update order to paid status
      await db.update(orders)
        .set({ paymentStatus: 'paid', orderStatus: 'confirmed' })
        .where(eq(orders.id, testOrder.id));

      const req = new Request('http://localhost/api/payment/cancel-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'http://localhost',
        },
        body: JSON.stringify({ orderId: testOrder.id }),
      });

      const { authReq } = testAuth(req, testUser);
      const response = await POST(authReq);
      const result = await response.json();

      expect(result.ok).toBe(true);
      expect(result.status).toBe('already_paid');
      expect(result.paymentStatus).toBe('paid');
      // Should not call PayU verification for already paid orders
      expect(payuPayments.reconcilePayu).not.toHaveBeenCalled();
    });
  });

  describe('Test Case 7: PayU Verification Failure', () => {
    it('should return verification_unavailable when PayU API fails', async () => {
      // Mock PayU verification throwing error
      vi.mocked(payuPayments.reconcilePayu).mockRejectedValueOnce(
        new Error('PayU service temporarily unavailable')
      );

      const req = new Request('http://localhost/api/payment/cancel-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'http://localhost',
        },
        body: JSON.stringify({ orderId: testOrder.id }),
      });

      const { authReq } = testAuth(req, testUser);
      const response = await POST(authReq);
      const result = await response.json();

      expect(result.ok).toBe(true);
      expect(result.status).toBe('verification_unavailable');
      expect(result.canRetry).toBe(true);
      expect(result.message).toContain('Unable to verify payment status');
    });
  });

  describe('Test Case 8: Unauthorized Access', () => {
    it('should reject cancel request from different user', async () => {
      // Create different user
      const [otherUser] = await db.insert(users).values({
        phone: '+919999999999',
        name: 'Other User',
        active: true,
        role: 'customer',
      }).returning();

      const req = new Request('http://localhost/api/payment/cancel-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'http://localhost',
        },
        body: JSON.stringify({ orderId: testOrder.id }),
      });

      const { authReq } = testAuth(req, otherUser);
      const response = await POST(authReq);

      expect(response.status).toBe(404);
      const result = await response.json();
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Order not found');
    });
  });

  describe('Test Case 9: Rate Limiting', () => {
    it('should enforce rate limit on cancellation requests', async () => {
      const requests = [];
      
      // Make 11 requests (limit is 10 per 60 seconds)
      for (let i = 0; i < 11; i++) {
        const req = new Request('http://localhost/api/payment/cancel-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'http://localhost',
          },
          body: JSON.stringify({ orderId: testOrder.id }),
        });

        const { authReq } = testAuth(req, testUser);
        requests.push(POST(authReq));
      }

      const responses = await Promise.all(requests);
      const lastResponse = responses[10];

      expect(lastResponse.status).toBe(429);
      const result = await lastResponse.json();
      expect(result.ok).toBe(false);
      expect(result.error).toContain('rate limit');
    });
  });

  describe('Test Case 10: Invalid Order ID', () => {
    it('should reject request with invalid order ID format', async () => {
      const req = new Request('http://localhost/api/payment/cancel-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'http://localhost',
        },
        body: JSON.stringify({ orderId: 'invalid-id-123' }),
      });

      const { authReq } = testAuth(req, testUser);
      const response = await POST(authReq);

      expect(response.status).toBe(400);
      const result = await response.json();
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Invalid order ID');
    });
  });
});
