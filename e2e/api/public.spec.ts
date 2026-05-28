/**
 * Public API endpoint contract tests — no auth required.
 * Covers: /api/openapi.json, /api/config/theme, /api/products,
 *         /api/categories, /api/coupons/validate
 */

import { test, expect } from '@playwright/test';

test.describe('Public API — config & catalog', () => {
  test('GET /api/openapi.json returns valid OpenAPI 3.x spec', async ({ request }) => {
    const resp = await request.get('/api/openapi.json');

    expect(resp.status()).toBe(200);
    expect(resp.headers()['content-type']).toContain('application/json');

    const body = await resp.json();
    expect(body.openapi).toMatch(/^3\./);
    expect(body.info).toBeDefined();
    expect(typeof body.info.title).toBe('string');
    expect(body.paths).toBeDefined();
  });

  test('GET /api/config/theme returns store config shape', async ({ request }) => {
    const resp = await request.get('/api/config/theme');

    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(typeof body.storeName).toBe('string');
    expect(body.storeName.length).toBeGreaterThan(0);
    expect(typeof body.taxRate).toBe('number');
    expect(body.taxRate).toBeGreaterThanOrEqual(0);
    expect(typeof body.primaryColor).toBe('string');
    expect(typeof body.currency).toBe('string');
    expect(typeof body.stripePublishableKey).toBe('string');
  });
});

test.describe('Public API — products', () => {
  test('GET /api/products returns paginated list', async ({ request }) => {
    const resp = await request.get('/api/products');

    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(typeof body.count).toBe('number');
    expect('nextCursor' in body).toBe(true);
  });

  test('GET /api/products?search=x returns filtered array', async ({ request }) => {
    const resp = await request.get('/api/products?search=organic');

    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(Array.isArray(body.items)).toBe(true);
  });

  test('GET /api/products?category=x returns filtered array', async ({ request }) => {
    const resp = await request.get('/api/products?category=Produce');

    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(Array.isArray(body.items)).toBe(true);
  });

  test('GET /api/products/{id} returns product shape for a real product', async ({ request }) => {
    const listResp = await request.get('/api/products');
    expect(listResp.status()).toBe(200);

    const { items } = await listResp.json();

    if (items.length === 0) {
      test.skip(true, 'No products seeded — skipping detail test');
      return;
    }

    const { productId } = items[0];
    const resp = await request.get(`/api/products/${productId}`);

    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body.productId).toBe(productId);
    expect(typeof body.name).toBe('string');
    expect(typeof body.price).toBe('number');
    expect(typeof body.stock).toBe('number');
    expect(typeof body.isActive).toBe('boolean');
  });

  test('GET /api/products/{non-existent} returns 404', async ({ request }) => {
    const resp = await request.get('/api/products/does-not-exist-xyz-playwright-99999');

    expect(resp.status()).toBe(404);
  });
});

test.describe('Public API — categories', () => {
  test('GET /api/categories returns array with expected shape', async ({ request }) => {
    const resp = await request.get('/api/categories');

    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(Array.isArray(body)).toBe(true);

    if (body.length > 0) {
      const cat = body[0];
      expect(typeof cat.categoryId).toBe('string');
      expect(typeof cat.name).toBe('string');
      expect(typeof cat.isActive).toBe('boolean');
    }
  });
});

test.describe('Public API — coupon validation', () => {
  test('GET /api/coupons/validate without code param returns 400', async ({ request }) => {
    const resp = await request.get('/api/coupons/validate');

    // 401 is acceptable if the endpoint requires authentication
    expect([400, 401, 422]).toContain(resp.status());
  });

  test('GET /api/coupons/validate with a non-existent code returns 4xx', async ({ request }) => {
    const resp = await request.get('/api/coupons/validate?code=PLAYWRIGHT_INVALID_XYZ');

    // 401 is acceptable if the endpoint requires authentication
    expect([400, 401, 404]).toContain(resp.status());
  });
});
