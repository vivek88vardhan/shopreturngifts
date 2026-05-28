/**
 * Admin Orders API contract tests.
 * Tests list, detail, status update, fulfill, and refund endpoints.
 *
 * Destructive mutations (status update, fulfill, refund) only verify auth
 * rules — no real order records are modified to avoid contaminating data.
 */

import { test, expect } from './fixtures/auth.fixture';

test.describe('Admin Orders — auth checks', () => {
  test('GET /api/admin/orders without token returns 401', async ({ request }) => {
    const resp = await request.get('/api/admin/orders');
    expect(resp.status()).toBe(401);
  });

  test('GET /api/admin/orders with customer token returns 403', async ({
    request,
    userToken,
    authHeader,
  }) => {
    const resp = await request.get('/api/admin/orders', { headers: authHeader(userToken) });
    expect(resp.status()).toBe(403);
  });

  test('PUT /api/admin/orders/{id}/status without token returns 401', async ({ request }) => {
    const resp = await request.put('/api/admin/orders/fake-id/status', {
      data: { status: 'Processing' },
    });
    expect(resp.status()).toBe(401);
  });

  test('PUT /api/admin/orders/{id}/fulfill without token returns 401', async ({ request }) => {
    const resp = await request.put('/api/admin/orders/fake-id/fulfill');
    expect(resp.status()).toBe(401);
  });

  test('POST /api/admin/orders/{id}/refund without token returns 401', async ({ request }) => {
    const resp = await request.post('/api/admin/orders/fake-id/refund', {
      data: { amountCents: 100, reason: 'test' },
    });
    expect(resp.status()).toBe(401);
  });

  test('PUT /api/admin/orders/{id}/status with customer token returns 403', async ({
    request,
    userToken,
    authHeader,
  }) => {
    const resp = await request.put('/api/admin/orders/fake-id/status', {
      headers: authHeader(userToken),
      data: { status: 'Processing' },
    });
    expect(resp.status()).toBe(403);
  });
});

test.describe('Admin Orders — list and detail', () => {
  test('GET /api/admin/orders returns paginated orders', async ({
    request,
    adminToken,
    authHeader,
  }) => {
    const resp = await request.get('/api/admin/orders', { headers: authHeader(adminToken) });

    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(typeof body.count).toBe('number');
    expect('nextCursor' in body).toBe(true);
  });

  test('GET /api/admin/orders?status=Paid returns filtered results', async ({
    request,
    adminToken,
    authHeader,
  }) => {
    const resp = await request.get('/api/admin/orders?status=Paid', {
      headers: authHeader(adminToken),
    });

    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(Array.isArray(body.items)).toBe(true);

    // All returned orders (if any) should match the filter
    for (const order of body.items) {
      expect(order.status).toBe('Paid');
    }
  });

  test('GET /api/admin/orders/{non-existent} returns 404', async ({
    request,
    adminToken,
    authHeader,
  }) => {
    const resp = await request.get('/api/admin/orders/playwright-nonexistent-order-xyz', {
      headers: authHeader(adminToken),
    });

    expect(resp.status()).toBe(404);
  });

  test('GET /api/admin/orders/{real-id}/detail returns order shape when order exists', async ({
    request,
    adminToken,
    authHeader,
  }) => {
    // Get the first order from the list (if any) and verify its shape
    const listResp = await request.get('/api/admin/orders', { headers: authHeader(adminToken) });
    expect(listResp.status()).toBe(200);
    const { items } = await listResp.json();

    if (items.length === 0) {
      test.skip(true, 'No orders in the system — skipping detail shape test');
      return;
    }

    const rawId: string = items[0].orderId;
    // Strip "ORDER#" prefix that DynamoDB may return
    const orderId = rawId.replace(/^ORDER#/, '');

    const resp = await request.get(`/api/admin/orders/${orderId}`, {
      headers: authHeader(adminToken),
    });

    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(typeof body.orderId).toBe('string');
    expect(typeof body.status).toBe('string');
    expect(Array.isArray(body.items)).toBe(true);
    expect(typeof body.total).toBe('number');
  });
});

test.describe('Admin Orders — status update (auth only, non-destructive)', () => {
  test('PUT /api/admin/orders/fake-id/status with admin token returns 400 or 404', async ({
    request,
    adminToken,
    authHeader,
  }) => {
    // Fake ID should not pass validation
    const resp = await request.put('/api/admin/orders/playwright-fake-order/status', {
      headers: authHeader(adminToken),
      data: { status: 'Processing' },
    });

    expect([400, 404]).toContain(resp.status());
  });

  test('POST /api/admin/orders/fake-id/refund with admin token returns 400 or 404', async ({
    request,
    adminToken,
    authHeader,
  }) => {
    const resp = await request.post('/api/admin/orders/playwright-fake-order/refund', {
      headers: authHeader(adminToken),
      data: { amountCents: 100, reason: 'Playwright test' },
    });

    expect([400, 404]).toContain(resp.status());
  });
});
