/**
 * Orders API contract tests.
 * Covers: GET /api/orders, GET /api/orders/{id},
 *         POST /api/orders, POST /api/orders/{id}/payment/confirm,
 *         GET /api/orders/{id}/invoice
 *
 * Note: POST /api/orders (full happy path) requires a real Stripe setup;
 *       only invalid-input and auth-error cases are verified here.
 */

import { test, expect } from './fixtures/auth.fixture';

test.describe('Orders API — unauthenticated', () => {
  test('GET /api/orders without token returns 401', async ({ request }) => {
    const resp = await request.get('/api/orders');

    expect(resp.status()).toBe(401);
  });

  test('POST /api/orders without token returns 401', async ({ request }) => {
    const resp = await request.post('/api/orders', {
      data: {
        items: [{ productId: 'p1', qty: 1 }],
        shippingAddress: {
          line1: '123 Main St',
          city: 'Phoenix',
          state: 'AZ',
          zip: '85001',
          country: 'US',
        },
      },
    });

    expect(resp.status()).toBe(401);
  });

  test('POST /api/orders/{id}/payment/confirm without token returns 401', async ({ request }) => {
    const resp = await request.post('/api/orders/fake-order-id/payment/confirm', {
      data: { paymentIntentId: 'pi_test_123' },
    });

    expect(resp.status()).toBe(401);
  });

  test('GET /api/orders/{id}/invoice without token returns 401', async ({ request }) => {
    const resp = await request.get('/api/orders/fake-order-id/invoice');

    expect(resp.status()).toBe(401);
  });
});

test.describe('Orders API — authenticated', () => {
  test('GET /api/orders returns paginated list', async ({ request, userToken, authHeader }) => {
    const resp = await request.get('/api/orders', {
      headers: authHeader(userToken),
    });

    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(typeof body.count).toBe('number');
    expect('nextCursor' in body).toBe(true);
  });

  test("GET /api/orders/{non-existent} returns 404 or access-denied", async ({
    request,
    userToken,
    authHeader,
  }) => {
    const resp = await request.get('/api/orders/playwright-nonexistent-order-xyz', {
      headers: authHeader(userToken),
    });

    // 404 (not found) or 403 (belongs to a different user) are both acceptable
    expect([403, 404]).toContain(resp.status());
  });

  test('POST /api/orders with missing items returns 400', async ({
    request,
    userToken,
    authHeader,
  }) => {
    const resp = await request.post('/api/orders', {
      headers: authHeader(userToken),
      data: {
        shippingAddress: {
          line1: '123 Main St',
          city: 'Phoenix',
          state: 'AZ',
          zip: '85001',
          country: 'US',
        },
      },
    });

    expect(resp.status()).toBe(400);
  });

  test('POST /api/orders with empty items array returns 400', async ({
    request,
    userToken,
    authHeader,
  }) => {
    const resp = await request.post('/api/orders', {
      headers: authHeader(userToken),
      data: {
        items: [],
        shippingAddress: {
          line1: '123 Main St',
          city: 'Phoenix',
          state: 'AZ',
          zip: '85001',
          country: 'US',
        },
      },
    });

    expect(resp.status()).toBe(400);
  });

  test('POST /api/orders with missing shippingAddress returns 400', async ({
    request,
    userToken,
    authHeader,
  }) => {
    const resp = await request.post('/api/orders', {
      headers: authHeader(userToken),
      data: {
        items: [{ productId: 'p1', qty: 1 }],
      },
    });

    expect(resp.status()).toBe(400);
  });
});
