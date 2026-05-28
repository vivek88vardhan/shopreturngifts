/**
 * Admin Users API contract tests.
 * Covers: GET /api/admin/users, GET /api/admin/users/{id},
 *         PUT /api/admin/users/{id}, DELETE /api/admin/users/{id}
 *
 * DELETE on a real admin account is skipped to avoid breaking the test
 * environment. The test only verifies that the endpoint exists and
 * rejects unauthenticated / unauthorized callers.
 */

import { test, expect } from './fixtures/auth.fixture';

test.describe('Admin Users — auth checks', () => {
  test('GET /api/admin/users without token returns 401', async ({ request }) => {
    const resp = await request.get('/api/admin/users');
    expect(resp.status()).toBe(401);
  });

  test('GET /api/admin/users with customer token returns 403', async ({
    request,
    userToken,
    authHeader,
  }) => {
    const resp = await request.get('/api/admin/users', { headers: authHeader(userToken) });
    expect(resp.status()).toBe(403);
  });

  test('GET /api/admin/users/{id} without token returns 401', async ({ request }) => {
    const resp = await request.get('/api/admin/users/any-id');
    expect(resp.status()).toBe(401);
  });

  test('PUT /api/admin/users/{id} without token returns 401', async ({ request }) => {
    const resp = await request.put('/api/admin/users/any-id', { data: {} });
    expect(resp.status()).toBe(401);
  });

  test('PUT /api/admin/users/{id} with customer token returns 403', async ({
    request,
    userToken,
    authHeader,
  }) => {
    const resp = await request.put('/api/admin/users/any-id', {
      headers: authHeader(userToken),
      data: {},
    });
    expect(resp.status()).toBe(403);
  });

  test('DELETE /api/admin/users/{id} without token returns 401', async ({ request }) => {
    const resp = await request.delete('/api/admin/users/any-id');
    expect(resp.status()).toBe(401);
  });

  test('DELETE /api/admin/users/{id} with customer token returns 403', async ({
    request,
    userToken,
    authHeader,
  }) => {
    const resp = await request.delete('/api/admin/users/any-id', {
      headers: authHeader(userToken),
    });
    expect(resp.status()).toBe(403);
  });
});

test.describe('Admin Users — list and detail', () => {
  test('GET /api/admin/users returns user list', async ({
    request,
    adminToken,
    authHeader,
  }) => {
    const resp = await request.get('/api/admin/users', { headers: authHeader(adminToken) });

    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('GET /api/admin/users/{non-existent} returns 404', async ({
    request,
    adminToken,
    authHeader,
  }) => {
    const resp = await request.get('/api/admin/users/playwright-nonexistent-user-xyz', {
      headers: authHeader(adminToken),
    });

    expect(resp.status()).toBe(404);
  });

  test('GET /api/admin/users/{real-id} returns user shape', async ({
    request,
    adminToken,
    authHeader,
  }) => {
    const listResp = await request.get('/api/admin/users', { headers: authHeader(adminToken) });
    expect(listResp.status()).toBe(200);
    const users: Array<{ userId: string }> = await listResp.json();

    if (users.length === 0) {
      test.skip(true, 'No users in the system — skipping detail shape test');
      return;
    }

    const userId = users[0].userId;
    const resp = await request.get(`/api/admin/users/${userId}`, {
      headers: authHeader(adminToken),
    });

    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(typeof body.userId).toBe('string');
    expect(typeof body.email).toBe('string');
    expect(typeof body.role).toBe('string');
    expect(body.address).toBeDefined();
  });

  test('PUT /api/admin/users/{id} with invalid payload returns 400 or 404', async ({
    request,
    adminToken,
    authHeader,
  }) => {
    // Non-existent user with empty body — should return 400 (validation) or 404 (not found)
    const resp = await request.put('/api/admin/users/playwright-nonexistent-user-xyz', {
      headers: authHeader(adminToken),
      data: {},
    });

    expect([400, 404]).toContain(resp.status());
  });
});
