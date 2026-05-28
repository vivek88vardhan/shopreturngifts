/**
 * Admin Coupons API contract tests.
 * Auth checks run in parallel; CRUD lifecycle runs serially.
 * Includes a cross-controller check: validates the created coupon is
 * visible via the public /api/coupons/validate endpoint.
 */

import { test, expect } from './fixtures/auth.fixture';

// ── Auth error checks ────────────────────────────────────────────────────────

test.describe('Admin Coupons — auth checks', () => {
  test('GET /api/admin/coupons without token returns 401', async ({ request }) => {
    const resp = await request.get('/api/admin/coupons');
    expect(resp.status()).toBe(401);
  });

  test('GET /api/admin/coupons with customer token returns 403', async ({
    request,
    userToken,
    authHeader,
  }) => {
    const resp = await request.get('/api/admin/coupons', { headers: authHeader(userToken) });
    expect(resp.status()).toBe(403);
  });

  test('POST /api/admin/coupons without token returns 401', async ({ request }) => {
    const resp = await request.post('/api/admin/coupons', { data: { code: 'X' } });
    expect(resp.status()).toBe(401);
  });

  test('PUT /api/admin/coupons/{id} without token returns 401', async ({ request }) => {
    const resp = await request.put('/api/admin/coupons/any-id', { data: {} });
    expect(resp.status()).toBe(401);
  });

  test('DELETE /api/admin/coupons/{id} without token returns 401', async ({ request }) => {
    const resp = await request.delete('/api/admin/coupons/any-id');
    expect(resp.status()).toBe(401);
  });
});

// ── CRUD lifecycle ───────────────────────────────────────────────────────────

test.describe.serial('Admin Coupons — CRUD lifecycle', () => {
  const couponCode = `PW-TEST-${Date.now()}`;
  let couponId: string;

  test('POST /api/admin/coupons creates a coupon (201)', async ({
    request,
    adminToken,
    authHeader,
  }) => {
    const resp = await request.post('/api/admin/coupons', {
      headers: authHeader(adminToken),
      data: {
        code: couponCode,
        description: 'Playwright test coupon — safe to delete',
        discountPercent: 10,
        isActive: true,
      },
    });

    expect(resp.status()).toBe(201);

    const body = await resp.json();
    expect(typeof body.couponId).toBe('string');
    expect(body.couponId.length).toBeGreaterThan(0);
    expect(body.code).toBe(couponCode);
    expect(body.discountPercent).toBe(10);

    couponId = body.couponId;
  });

  test('GET /api/admin/coupons returns list including new coupon', async ({
    request,
    adminToken,
    authHeader,
  }) => {
    const resp = await request.get('/api/admin/coupons', { headers: authHeader(adminToken) });

    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(Array.isArray(body)).toBe(true);
    const found = body.find((c: { code: string }) => c.code === couponCode);
    expect(found).toBeDefined();
  });

  test('GET /api/coupons/validate verifies active coupon is valid', async ({ request }) => {
    const resp = await request.get(`/api/coupons/validate?code=${couponCode}`);

    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(typeof body.discountPercent).toBe('number');
    expect(body.discountPercent).toBe(10);
  });

  test('PUT /api/admin/coupons/{id} updates discount percent', async ({
    request,
    adminToken,
    authHeader,
  }) => {
    if (!couponId) {
      test.skip(true, 'No couponId to update');
      return;
    }

    const resp = await request.put(`/api/admin/coupons/${couponId}`, {
      headers: authHeader(adminToken),
      data: {
        code: couponCode,
        description: 'Updated by Playwright test',
        discountPercent: 20,
        isActive: true,
      },
    });

    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body.discountPercent).toBe(20);
  });

  test('DELETE /api/admin/coupons/{id} removes coupon (204)', async ({
    request,
    adminToken,
    authHeader,
  }) => {
    if (!couponId) {
      test.skip(true, 'No couponId to delete');
      return;
    }

    const resp = await request.delete(`/api/admin/coupons/${couponId}`, {
      headers: authHeader(adminToken),
    });

    expect(resp.status()).toBe(204);
  });

  test('GET /api/coupons/validate after delete returns 4xx', async ({ request }) => {
    const resp = await request.get(`/api/coupons/validate?code=${couponCode}`);

    expect([400, 404]).toContain(resp.status());
  });
});
