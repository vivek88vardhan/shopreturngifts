/**
 * Admin Refunds API contract tests.
 * Covers the list, detail, and update refund-record endpoints.
 *
 * Refund records are created by the backend when an admin calls
 * POST /api/admin/orders/{orderId}/refund. That endpoint is already
 * covered in admin-orders.spec.ts. These tests focus on:
 *   GET  /api/admin/refunds
 *   GET  /api/admin/refunds/{refundId}
 *   PUT  /api/admin/refunds/{refundId}
 */

import { test, expect } from './fixtures/auth.fixture';

// ── Auth error checks ────────────────────────────────────────────────────────

test.describe('Admin Refunds — auth checks', () => {
  test('GET /api/admin/refunds without token returns 401', async ({ request }) => {
    const resp = await request.get('/api/admin/refunds');
    expect(resp.status()).toBe(401);
  });

  test('GET /api/admin/refunds with customer token returns 403', async ({
    request,
    userToken,
    authHeader,
  }) => {
    const resp = await request.get('/api/admin/refunds', { headers: authHeader(userToken) });
    expect(resp.status()).toBe(403);
  });

  test('GET /api/admin/refunds/{id} without token returns 401', async ({ request }) => {
    const resp = await request.get('/api/admin/refunds/any-id');
    expect(resp.status()).toBe(401);
  });

  test('GET /api/admin/refunds/{id} with customer token returns 403', async ({
    request,
    userToken,
    authHeader,
  }) => {
    const resp = await request.get('/api/admin/refunds/any-id', {
      headers: authHeader(userToken),
    });
    expect(resp.status()).toBe(403);
  });

  test('PUT /api/admin/refunds/{id} without token returns 401', async ({ request }) => {
    const resp = await request.put('/api/admin/refunds/any-id', {
      data: { status: 'Processing' },
    });
    expect(resp.status()).toBe(401);
  });

  test('PUT /api/admin/refunds/{id} with customer token returns 403', async ({
    request,
    userToken,
    authHeader,
  }) => {
    const resp = await request.put('/api/admin/refunds/any-id', {
      headers: authHeader(userToken),
      data: { status: 'Processing' },
    });
    expect(resp.status()).toBe(403);
  });
});

// ── Admin list shape ─────────────────────────────────────────────────────────

test.describe('Admin Refunds — list', () => {
  test('GET /api/admin/refunds returns {items, count} shape', async ({
    request,
    adminToken,
    authHeader,
  }) => {
    const resp = await request.get('/api/admin/refunds', { headers: authHeader(adminToken) });

    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(typeof body.count).toBe('number');
    expect(body.count).toBe(body.items.length);
  });

  test('GET /api/admin/refunds items have expected fields when refunds exist', async ({
    request,
    adminToken,
    authHeader,
  }) => {
    const resp = await request.get('/api/admin/refunds', { headers: authHeader(adminToken) });
    expect(resp.status()).toBe(200);

    const { items } = await resp.json();

    if (items.length === 0) {
      test.skip(true, 'No refunds in the system — skipping field shape test');
      return;
    }

    const r = items[0];
    expect(typeof r.refundId).toBe('string');
    expect(typeof r.orderId).toBe('string');
    expect(typeof r.amountCents).toBe('number');
    expect(typeof r.reason).toBe('string');
    expect(typeof r.status).toBe('string');
    expect(['Initiated', 'Processing', 'Completed', 'Failed']).toContain(r.status);
    expect(typeof r.createdAt).toBe('string');
  });
});

// ── Admin detail and update (non-destructive) ────────────────────────────────

test.describe('Admin Refunds — detail and update (auth only for non-existent IDs)', () => {
  test('GET /api/admin/refunds/{non-existent} with admin token returns 404', async ({
    request,
    adminToken,
    authHeader,
  }) => {
    const resp = await request.get('/api/admin/refunds/playwright-nonexistent-refund-xyz', {
      headers: authHeader(adminToken),
    });

    expect(resp.status()).toBe(404);
  });

  test('PUT /api/admin/refunds/{non-existent} with admin token returns 404', async ({
    request,
    adminToken,
    authHeader,
  }) => {
    const resp = await request.put('/api/admin/refunds/playwright-nonexistent-refund-xyz', {
      headers: authHeader(adminToken),
      data: { status: 'Processing', adminNotes: 'Playwright test — safe to ignore' },
    });

    expect(resp.status()).toBe(404);
  });

  test('GET /api/admin/refunds/{real-id} returns refund shape when a refund exists', async ({
    request,
    adminToken,
    authHeader,
  }) => {
    // Fetch the list to find a real refund ID, if any
    const listResp = await request.get('/api/admin/refunds', { headers: authHeader(adminToken) });
    expect(listResp.status()).toBe(200);
    const { items } = await listResp.json();

    if (items.length === 0) {
      test.skip(true, 'No refunds in the system — skipping detail shape test');
      return;
    }

    const refundId: string = items[0].refundId;
    const resp = await request.get(`/api/admin/refunds/${refundId}`, {
      headers: authHeader(adminToken),
    });

    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body.refundId).toBe(refundId);
    expect(typeof body.orderId).toBe('string');
    expect(typeof body.amountCents).toBe('number');
    expect(typeof body.reason).toBe('string');
    expect(typeof body.status).toBe('string');
    expect(typeof body.createdAt).toBe('string');
  });
});
