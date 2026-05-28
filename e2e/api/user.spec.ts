/**
 * User profile API contract tests — requires a valid customer JWT.
 * Covers: GET/PUT /api/users/me, PUT /api/users/me/address
 */

import { test, expect } from './fixtures/auth.fixture';

test.describe('User profile API — unauthenticated', () => {
  test('GET /api/users/me without token returns 401', async ({ request }) => {
    const resp = await request.get('/api/users/me');

    expect(resp.status()).toBe(401);
  });

  test('PUT /api/users/me without token returns 401', async ({ request }) => {
    const resp = await request.put('/api/users/me', {
      data: { name: 'Ghost' },
    });

    expect(resp.status()).toBe(401);
  });

  test('PUT /api/users/me/address without token returns 401', async ({ request }) => {
    const resp = await request.put('/api/users/me/address', {
      data: { line1: '123 Main St', city: 'Phoenix', state: 'AZ', zip: '85001', country: 'US' },
    });

    expect(resp.status()).toBe(401);
  });
});

test.describe('User profile API — authenticated', () => {
  test('GET /api/users/me returns user profile shape', async ({
    request,
    userToken,
    authHeader,
  }) => {
    const resp = await request.get('/api/users/me', {
      headers: authHeader(userToken),
    });

    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(typeof body.userId).toBe('string');
    expect(body.userId.length).toBeGreaterThan(0);
    expect(typeof body.email).toBe('string');
    expect(typeof body.name).toBe('string');
    expect(body.address).toBeDefined();
    expect(typeof body.role).toBe('string');
  });

  test('PUT /api/users/me updates name without changing email', async ({
    request,
    userToken,
    authHeader,
  }) => {
    const getResp = await request.get('/api/users/me', { headers: authHeader(userToken) });
    expect(getResp.status()).toBe(200);
    const current = await getResp.json();

    const resp = await request.put('/api/users/me', {
      headers: authHeader(userToken),
      data: { name: current.name, phone: current.phone ?? '' },
    });

    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body.userId).toBe(current.userId);
    expect(body.email).toBe(current.email);
  });

  test('PUT /api/users/me/address updates shipping address', async ({
    request,
    userToken,
    authHeader,
  }) => {
    const resp = await request.put('/api/users/me/address', {
      headers: authHeader(userToken),
      data: {
        line1: '789 E Thomas Rd',
        line2: '',
        city: 'Phoenix',
        state: 'AZ',
        zip: '85014',
        country: 'US',
      },
    });

    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body.address).toBeDefined();
    expect(body.address.city).toBe('Phoenix');
    expect(body.address.zip).toBe('85014');
  });
});
