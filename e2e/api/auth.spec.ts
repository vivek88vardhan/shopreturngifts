/**
 * Auth API endpoint contract tests.
 * Covers: POST /api/auth/login, signup, confirm, resend-code
 *
 * Happy-path login relies on TEST_USER_EMAIL / TEST_USER_PASSWORD env vars.
 * All other tests verify that the API rejects invalid/incomplete input.
 */

import { test, expect } from '@playwright/test';

test.describe('Auth API — login', () => {
  const userEmail = process.env.TEST_USER_EMAIL ?? '';
  const userPassword = process.env.TEST_USER_PASSWORD ?? '';

  test('POST /api/auth/login with valid credentials returns user and token', async ({
    request,
  }) => {
    test.skip(!userEmail || !userPassword, 'TEST_USER_EMAIL / TEST_USER_PASSWORD not set');

    const resp = await request.post('/api/auth/login', {
      data: { email: userEmail, password: userPassword },
    });

    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(typeof body.token).toBe('string');
    expect(body.token.length).toBeGreaterThan(10);
    expect(body.user).toBeDefined();
    expect(typeof body.user.userId).toBe('string');
    expect(body.user.email).toBe(userEmail);
    expect(['customer', 'admin']).toContain(body.user.role);
  });

  test('POST /api/auth/login with wrong password returns 400 or 401', async ({ request }) => {
    test.skip(!userEmail, 'TEST_USER_EMAIL not set');

    const resp = await request.post('/api/auth/login', {
      data: { email: userEmail, password: 'definitely-wrong-password-xyz-123' },
    });

    expect([400, 401]).toContain(resp.status());
  });

  test('POST /api/auth/login with missing email returns 400', async ({ request }) => {
    const resp = await request.post('/api/auth/login', {
      data: { password: 'Password123!' },
    });

    expect(resp.status()).toBe(400);
  });

  test('POST /api/auth/login with missing password returns 400', async ({ request }) => {
    const resp = await request.post('/api/auth/login', {
      data: { email: 'anyone@example.com' },
    });

    expect(resp.status()).toBe(400);
  });

  test('POST /api/auth/login with empty body returns 400', async ({ request }) => {
    const resp = await request.post('/api/auth/login', { data: {} });

    expect(resp.status()).toBe(400);
  });
});

test.describe('Auth API — signup', () => {
  test('POST /api/auth/signup with missing name returns 400', async ({ request }) => {
    const resp = await request.post('/api/auth/signup', {
      data: { email: 'x@example.com', password: 'Password123!' },
    });

    expect(resp.status()).toBe(400);
  });

  test('POST /api/auth/signup with missing password returns 400', async ({ request }) => {
    const resp = await request.post('/api/auth/signup', {
      data: { name: 'Test User', email: 'x@example.com' },
    });

    expect(resp.status()).toBe(400);
  });

  test('POST /api/auth/signup with missing email returns 400', async ({ request }) => {
    const resp = await request.post('/api/auth/signup', {
      data: { name: 'Test User', password: 'Password123!' },
    });

    expect(resp.status()).toBe(400);
  });
});

test.describe('Auth API — confirm & resend', () => {
  test('POST /api/auth/confirm with missing code returns 400', async ({ request }) => {
    const resp = await request.post('/api/auth/confirm', {
      data: { email: 'x@example.com' },
    });

    expect(resp.status()).toBe(400);
  });

  test('POST /api/auth/confirm with missing email returns 400', async ({ request }) => {
    const resp = await request.post('/api/auth/confirm', {
      data: { code: '123456' },
    });

    expect(resp.status()).toBe(400);
  });

  test('POST /api/auth/resend-code with missing email returns 400', async ({ request }) => {
    const resp = await request.post('/api/auth/resend-code', { data: {} });

    expect(resp.status()).toBe(400);
  });
});
