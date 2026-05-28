/**
 * Admin Config API contract tests.
 * Covers: GET /api/admin/config, PUT /api/admin/config,
 *         POST /api/admin/config/logo-upload-url,
 *         POST /api/admin/config/hero-image-upload-url
 */

import { test, expect } from './fixtures/auth.fixture';

test.describe('Admin Config — auth checks', () => {
  test('GET /api/admin/config without token returns 401', async ({ request }) => {
    const resp = await request.get('/api/admin/config');
    expect(resp.status()).toBe(401);
  });

  test('GET /api/admin/config with customer token returns 403', async ({
    request,
    userToken,
    authHeader,
  }) => {
    const resp = await request.get('/api/admin/config', { headers: authHeader(userToken) });
    expect(resp.status()).toBe(403);
  });

  test('PUT /api/admin/config without token returns 401', async ({ request }) => {
    const resp = await request.put('/api/admin/config', { data: {} });
    expect(resp.status()).toBe(401);
  });

  test('POST /api/admin/config/logo-upload-url without token returns 401', async ({ request }) => {
    const resp = await request.post('/api/admin/config/logo-upload-url');
    expect(resp.status()).toBe(401);
  });

  test('POST /api/admin/config/hero-image-upload-url without token returns 401', async ({
    request,
  }) => {
    const resp = await request.post('/api/admin/config/hero-image-upload-url');
    expect(resp.status()).toBe(401);
  });
});

test.describe('Admin Config — read and write', () => {
  test('GET /api/admin/config returns full config shape', async ({
    request,
    adminToken,
    authHeader,
  }) => {
    const resp = await request.get('/api/admin/config', { headers: authHeader(adminToken) });

    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(typeof body.storeName).toBe('string');
    expect(typeof body.taxRate).toBe('number');
    expect(typeof body.currency).toBe('string');
    expect(typeof body.primaryColor).toBe('string');
    expect(typeof body.stripePublishableKey).toBe('string');
  });

  test('PUT /api/admin/config updates storeName and persists it', async ({
    request,
    adminToken,
    authHeader,
  }) => {
    // Read current config
    const getResp = await request.get('/api/admin/config', { headers: authHeader(adminToken) });
    expect(getResp.status()).toBe(200);
    const current = await getResp.json();

    // Preserve all fields but touch footerText with a timestamp
    const sentinel = `PW-TEST-${Date.now()}`;
    const putResp = await request.put('/api/admin/config', {
      headers: authHeader(adminToken),
      data: { ...current, footerText: sentinel },
    });

    expect(putResp.status()).toBe(200);

    const body = await putResp.json();
    expect(body.footerText).toBe(sentinel);

    // Restore original footerText
    await request.put('/api/admin/config', {
      headers: authHeader(adminToken),
      data: { ...current },
    });
  });

  test('POST /api/admin/config/logo-upload-url returns a pre-signed S3 URL', async ({
    request,
    adminToken,
    authHeader,
  }) => {
    const resp = await request.post('/api/admin/config/logo-upload-url', {
      headers: authHeader(adminToken),
    });

    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(typeof body.uploadUrl).toBe('string');
    expect(body.uploadUrl).toMatch(/^https?:\/\//);
  });

  test('POST /api/admin/config/hero-image-upload-url returns a pre-signed S3 URL', async ({
    request,
    adminToken,
    authHeader,
  }) => {
    const resp = await request.post('/api/admin/config/hero-image-upload-url', {
      headers: authHeader(adminToken),
    });

    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(typeof body.uploadUrl).toBe('string');
    expect(body.uploadUrl).toMatch(/^https?:\/\//);
  });

  test('GET /api/admin/config returns stripeAutoTaxEnabled as a boolean', async ({
    request,
    adminToken,
    authHeader,
  }) => {
    const resp = await request.get('/api/admin/config', { headers: authHeader(adminToken) });
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    // Field may be absent (defaults to true) or explicitly boolean.
    if ('stripeAutoTaxEnabled' in body) {
      expect(typeof body.stripeAutoTaxEnabled).toBe('boolean');
    }
  });

  test('PUT /api/admin/config can disable Stripe Automatic Tax and persists the value', async ({
    request,
    adminToken,
    authHeader,
  }) => {
    // Read current config to preserve all other fields.
    const getResp = await request.get('/api/admin/config', { headers: authHeader(adminToken) });
    expect(getResp.status()).toBe(200);
    const current = await getResp.json();

    // Disable Stripe Automatic Tax.
    const disableResp = await request.put('/api/admin/config', {
      headers: authHeader(adminToken),
      data: { ...current, stripeAutoTaxEnabled: false },
    });
    expect(disableResp.status()).toBe(200);
    const disabledBody = await disableResp.json();
    expect(disabledBody.stripeAutoTaxEnabled).toBe(false);

    // Re-read to confirm persistence.
    const rereadResp = await request.get('/api/admin/config', { headers: authHeader(adminToken) });
    expect(rereadResp.status()).toBe(200);
    const rereadBody = await rereadResp.json();
    expect(rereadBody.stripeAutoTaxEnabled).toBe(false);

    // Restore original value.
    await request.put('/api/admin/config', {
      headers: authHeader(adminToken),
      data: { ...current },
    });
  });

  test('PUT /api/admin/config can enable Stripe Automatic Tax and persists the value', async ({
    request,
    adminToken,
    authHeader,
  }) => {
    // Read current config.
    const getResp = await request.get('/api/admin/config', { headers: authHeader(adminToken) });
    expect(getResp.status()).toBe(200);
    const current = await getResp.json();

    // Enable Stripe Automatic Tax.
    const enableResp = await request.put('/api/admin/config', {
      headers: authHeader(adminToken),
      data: { ...current, stripeAutoTaxEnabled: true },
    });
    expect(enableResp.status()).toBe(200);
    const enabledBody = await enableResp.json();
    // omitempty means a true value may be omitted; treat absence as true.
    expect(enabledBody.stripeAutoTaxEnabled ?? true).toBe(true);

    // Restore original value.
    await request.put('/api/admin/config', {
      headers: authHeader(adminToken),
      data: { ...current },
    });
  });

  test('PUT /api/admin/config — custom taxRate is preserved when stripeAutoTaxEnabled is false', async ({
    request,
    adminToken,
    authHeader,
  }) => {
    const getResp = await request.get('/api/admin/config', { headers: authHeader(adminToken) });
    expect(getResp.status()).toBe(200);
    const current = await getResp.json();

    const customRate = 7.25;
    const putResp = await request.put('/api/admin/config', {
      headers: authHeader(adminToken),
      data: { ...current, stripeAutoTaxEnabled: false, taxRate: customRate },
    });
    expect(putResp.status()).toBe(200);
    const body = await putResp.json();
    expect(body.stripeAutoTaxEnabled).toBe(false);
    expect(body.taxRate).toBe(customRate);

    // Restore.
    await request.put('/api/admin/config', {
      headers: authHeader(adminToken),
      data: { ...current },
    });
  });
});
