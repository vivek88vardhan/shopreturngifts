/**
 * Admin Products API contract tests.
 *
 * Auth checks run in parallel. CRUD lifecycle runs serially (create → read →
 * update → delete) using a shared closure variable so test data is cleaned up
 * even when individual steps optionally skip.
 */

import { test, expect } from './fixtures/auth.fixture';

// ── Auth error checks ────────────────────────────────────────────────────────

test.describe('Admin Products — auth checks', () => {
  test('GET /api/admin/products without token returns 401', async ({ request }) => {
    const resp = await request.get('/api/admin/products');
    expect(resp.status()).toBe(401);
  });

  test('GET /api/admin/products with customer token returns 403', async ({
    request,
    userToken,
    authHeader,
  }) => {
    const resp = await request.get('/api/admin/products', { headers: authHeader(userToken) });
    expect(resp.status()).toBe(403);
  });

  test('POST /api/admin/products without token returns 401', async ({ request }) => {
    const resp = await request.post('/api/admin/products', { data: { name: 'x' } });
    expect(resp.status()).toBe(401);
  });

  test('POST /api/admin/products with customer token returns 403', async ({
    request,
    userToken,
    authHeader,
  }) => {
    const resp = await request.post('/api/admin/products', {
      headers: authHeader(userToken),
      data: { name: 'x' },
    });
    expect(resp.status()).toBe(403);
  });

  test('PUT /api/admin/products/{id} without token returns 401', async ({ request }) => {
    const resp = await request.put('/api/admin/products/any-id', { data: { name: 'x' } });
    expect(resp.status()).toBe(401);
  });

  test('DELETE /api/admin/products/{id} without token returns 401', async ({ request }) => {
    const resp = await request.delete('/api/admin/products/any-id');
    expect(resp.status()).toBe(401);
  });
});

// ── CRUD lifecycle ───────────────────────────────────────────────────────────

test.describe.serial('Admin Products — CRUD lifecycle', () => {
  let productId: string;

  test('POST /api/admin/products creates a product (201)', async ({
    request,
    adminToken,
    authHeader,
  }) => {
    const resp = await request.post('/api/admin/products', {
      headers: authHeader(adminToken),
      data: {
        name: 'TEST-Playwright-Product',
        description: 'Automated test product — safe to delete',
        category: 'Fresh Produce',
        price: 9.99,
        currency: 'USD',
        stock: 5,
        isActive: true,
        isTaxable: true,
        tags: ['playwright-test'],
        images: [],
      },
    });

    expect(resp.status()).toBe(201);

    const body = await resp.json();
    expect(typeof body.productId).toBe('string');
    expect(body.productId.length).toBeGreaterThan(0);
    expect(body.name).toBe('TEST-Playwright-Product');
    expect(body.price).toBe(9.99);

    productId = body.productId;
  });

  test('GET /api/admin/products returns list (admin)', async ({
    request,
    adminToken,
    authHeader,
  }) => {
    const resp = await request.get('/api/admin/products', { headers: authHeader(adminToken) });

    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('PUT /api/admin/products/{id} updates price', async ({
    request,
    adminToken,
    authHeader,
  }) => {
    if (!productId) {
      test.skip(true, 'Create step did not produce a productId — skipping update');
      return;
    }

    const resp = await request.put(`/api/admin/products/${productId}`, {
      headers: authHeader(adminToken),
      data: {
        name: 'TEST-Playwright-Product',
        description: 'Updated by Playwright test',
        category: 'Fresh Produce',
        price: 14.99,
        currency: 'USD',
        stock: 5,
        isActive: true,
        isTaxable: true,
        tags: ['playwright-test'],
        images: [],
      },
    });

    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body.price).toBe(14.99);
    expect(body.description).toBe('Updated by Playwright test');
  });

  test('POST /api/admin/products/{id}/image-upload-url returns S3 URL', async ({
    request,
    adminToken,
    authHeader,
  }) => {
    if (!productId) {
      test.skip(true, 'No productId — skipping upload-url test');
      return;
    }

    const resp = await request.post(`/api/admin/products/${productId}/image-upload-url`, {
      headers: authHeader(adminToken),
    });

    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(typeof body.uploadUrl).toBe('string');
    expect(body.uploadUrl).toMatch(/^https?:\/\//);
  });

  test('DELETE /api/admin/products/{id} removes product (204)', async ({
    request,
    adminToken,
    authHeader,
  }) => {
    if (!productId) {
      test.skip(true, 'No productId to delete');
      return;
    }

    const resp = await request.delete(`/api/admin/products/${productId}`, {
      headers: authHeader(adminToken),
    });

    expect(resp.status()).toBe(204);
  });
});
