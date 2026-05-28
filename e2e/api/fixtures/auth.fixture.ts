/**
 * Playwright fixture that supplies pre-authenticated JWT tokens for the
 * user (customer) and admin roles.
 *
 * Tokens are cached per worker process — each worker logs in once and
 * reuses the token for all tests that run in that worker.
 *
 * Required env vars (set in .env.api-test or CI secrets):
 *   API_BASE_URL          Backend base URL (default: http://localhost:9000)
 *   TEST_USER_EMAIL       Email of a seeded customer account
 *   TEST_USER_PASSWORD    Password of the customer account
 *   TEST_ADMIN_EMAIL      Email of a seeded admin account
 *   TEST_ADMIN_PASSWORD   Password of the admin account
 */

import { test as base, expect, type APIRequestContext } from '@playwright/test';

// ── Per-worker token cache ───────────────────────────────────────────────────
let cachedUserToken: string | null = null;
let cachedAdminToken: string | null = null;

/**
 * Fetch a JWT by logging in, with exponential-backoff retry on HTTP 429.
 * Cognito rate-limits concurrent login requests when multiple workers run
 * in parallel; retrying with backoff (1 s → 2 s → 4 s → 8 s) ensures each
 * worker eventually gets a token without flaking the test suite.
 */
async function fetchToken(
  request: APIRequestContext,
  email: string,
  password: string,
  maxAttempts = 5,
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const resp = await request.post('/api/auth/login', {
      data: { email, password },
    });

    if (resp.status() === 429 && attempt < maxAttempts - 1) {
      const waitMs = 1000 * Math.pow(2, attempt); // 1 s, 2 s, 4 s, 8 s
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }

    if (!resp.ok()) {
      const text = await resp.text();
      throw new Error(
        `Token fetch failed — status ${resp.status()}: ${text}\n` +
          `Check TEST_USER_EMAIL / TEST_USER_PASSWORD / TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD env vars.`,
      );
    }

    const body = await resp.json();

    if (typeof body.token !== 'string' || body.token.length === 0) {
      throw new Error(`Login response did not contain a token: ${JSON.stringify(body)}`);
    }

    return body.token as string;
  }

  throw new Error('Token fetch failed: max retry attempts exceeded (persistent 429 rate limit)');
}

// ── Fixture types ────────────────────────────────────────────────────────────
interface ApiFixtures {
  /** JWT for a regular customer account (TEST_USER_EMAIL). */
  userToken: string;
  /** JWT for an admin account (TEST_ADMIN_EMAIL). */
  adminToken: string;
  /** Convenience helper: returns Authorization header object for a given token. */
  authHeader: (token: string) => { Authorization: string };
}

// ── Extended test ────────────────────────────────────────────────────────────
export const test = base.extend<ApiFixtures>({
  userToken: async ({ request }, use) => {
    if (!cachedUserToken) {
      cachedUserToken = await fetchToken(
        request,
        process.env.TEST_USER_EMAIL ?? '',
        process.env.TEST_USER_PASSWORD ?? '',
      );
    }
    await use(cachedUserToken);
  },

  adminToken: async ({ request }, use) => {
    if (!cachedAdminToken) {
      cachedAdminToken = await fetchToken(
        request,
        process.env.TEST_ADMIN_EMAIL ?? '',
        process.env.TEST_ADMIN_PASSWORD ?? '',
      );
    }
    await use(cachedAdminToken);
  },

  // eslint-disable-next-line no-empty-pattern
  authHeader: async ({}, use) => {
    await use((token: string) => ({ Authorization: `Bearer ${token}` }));
  },
});

export { expect };
