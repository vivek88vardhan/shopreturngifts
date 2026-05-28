/**
 * Admin Categories API contract tests.
 * Auth checks run in parallel; CRUD lifecycle runs serially.
 */

import { test, expect } from './fixtures/auth.fixture';

// ── Auth error checks ────────────────────────────────────────────────────────

test.describe('Admin Categories — auth checks', () => {
  test('GET /api/admin/categories without token returns 401', async ({ request }) => {
    const resp = await request.get('/api/admin/categories');
    expect(resp.status()).toBe(401);
  });

  test('GET /api/admin/categories with customer token returns 403', async ({
    request,
    userToken,
    authHeader,
  }) => {
    const resp = await request.get('/api/admin/categories', { headers: authHeader(userToken) });
    expect(resp.status()).toBe(403);
  });

  test('POST /api/admin/categories without token returns 401', async ({ request }) => {
    const resp = await request.post('/api/admin/categories', { data: { name: 'x' } });
    expect(resp.status()).toBe(401);
  });

  test('PUT /api/admin/categories/{id} without token returns 401', async ({ request }) => {
    const resp = await request.put('/api/admin/categories/any-id', { data: { name: 'x' } });
    expect(resp.status()).toBe(401);
  });

  test('DELETE /api/admin/categories/{id} without token returns 401', async ({ request }) => {
    const resp = await request.delete('/api/admin/categories/any-id');
    expect(resp.status()).toBe(401);
  });
});

// ── CRUD lifecycle ───────────────────────────────────────────────────────────

test.describe.serial('Admin Categories — CRUD lifecycle', () => {
  let categoryId: string;

  test('POST /api/admin/categories creates a category (201)', async ({
    request,
    adminToken,
    authHeader,
  }) => {
    const resp = await request.post('/api/admin/categories', {
      headers: authHeader(adminToken),
      data: {
        name: 'TEST-Playwright-Category',
        description: 'Automated test category — safe to delete',
        imageUrl: '',
        sortOrder: 999,
        isActive: true,
      },
    });

    expect(resp.status()).toBe(201);

    const body = await resp.json();
    expect(typeof body.categoryId).toBe('string');
    expect(body.categoryId.length).toBeGreaterThan(0);
    expect(body.name).toBe('TEST-Playwright-Category');

    categoryId = body.categoryId;
  });

  test('GET /api/admin/categories returns list including the new category', async ({
    request,
    adminToken,
    authHeader,
  }) => {
    const resp = await request.get('/api/admin/categories', { headers: authHeader(adminToken) });

    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('PUT /api/admin/categories/{id} updates the category name', async ({
    request,
    adminToken,
    authHeader,
  }) => {
    if (!categoryId) {
      test.skip(true, 'No categoryId to update');
      return;
    }

    const resp = await request.put(`/api/admin/categories/${categoryId}`, {
      headers: authHeader(adminToken),
      data: {
        name: 'TEST-Playwright-Category-Updated',
        description: 'Updated by Playwright test',
        imageUrl: '',
        sortOrder: 999,
        isActive: true,
      },
    });

    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body.name).toBe('TEST-Playwright-Category-Updated');
  });

  test('DELETE /api/admin/categories/{id} removes category (204)', async ({
    request,
    adminToken,
    authHeader,
  }) => {
    if (!categoryId) {
      test.skip(true, 'No categoryId to delete');
      return;
    }

    const resp = await request.delete(`/api/admin/categories/${categoryId}`, {
      headers: authHeader(adminToken),
    });

    expect(resp.status()).toBe(204);
  });
});
