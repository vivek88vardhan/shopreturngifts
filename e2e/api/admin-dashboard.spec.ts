/**
 * Admin Dashboard API contract tests.
 * Covers: GET /api/admin/dashboard
 */

import { test, expect } from './fixtures/auth.fixture';

test.describe('Admin Dashboard — auth checks', () => {
  test('GET /api/admin/dashboard without token returns 401', async ({ request }) => {
    const resp = await request.get('/api/admin/dashboard');
    expect(resp.status()).toBe(401);
  });

  test('GET /api/admin/dashboard with customer token returns 403', async ({
    request,
    userToken,
    authHeader,
  }) => {
    const resp = await request.get('/api/admin/dashboard', { headers: authHeader(userToken) });
    expect(resp.status()).toBe(403);
  });
});

test.describe('Admin Dashboard — metrics', () => {
  test('GET /api/admin/dashboard returns KPI shape', async ({
    request,
    adminToken,
    authHeader,
  }) => {
    const resp = await request.get('/api/admin/dashboard', { headers: authHeader(adminToken) });

    expect(resp.status()).toBe(200);

    const body = await resp.json();

    // Core metrics
    expect(typeof body.totalOrders).toBe('number');
    expect(typeof body.revenue).toBe('number');
    expect(typeof body.avgOrderValue).toBe('number');

    // Values must be non-negative
    expect(body.totalOrders).toBeGreaterThanOrEqual(0);
    expect(body.revenue).toBeGreaterThanOrEqual(0);
    expect(body.avgOrderValue).toBeGreaterThanOrEqual(0);
  });
});
