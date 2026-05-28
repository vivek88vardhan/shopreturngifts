import { expect, test } from '../playwright-fixture';
import { mockStoreApi } from './fixtures/mockApi';
import { seedSession } from './fixtures/session';

const now = '2026-03-26T12:00:00Z';

const baseUser = {
  userId: 'customer-user-1',
  email: 'customer@shopreturngifts.test',
  name: 'Customer User',
  phone: '+14805550100',
  role: 'customer',
  userType: 'B2C',
  isActive: true,
  address: {
    line1: '123 Main St',
    line2: '',
    city: 'Phoenix',
    state: 'AZ',
    zip: '85001',
    country: 'US',
  },
  createdAt: now,
  updatedAt: now,
};

async function mockProfileApi(page: import('@playwright/test').Page, overrides: Partial<typeof baseUser> = {}) {
  const user = { ...baseUser, ...overrides };
  await page.route('**/api/users/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(user),
    });
  });
  await page.route('**/api/users/me/address', async (route) => {
    await route.fulfill({ status: 204 });
  });
}

test.describe('Profile update', () => {
  test('updates name and phone successfully', async ({ page }) => {
    await seedSession(page, { role: 'customer' });
    await mockStoreApi(page);
    await mockProfileApi(page, { name: 'Casey Phoenix', phone: '+14805559999' });

    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: 'My Profile' })).toBeVisible();

    await page.locator('label:has-text("Full Name") + input').fill('Casey Phoenix');
    await page.locator('label:has-text("Phone") + input').fill('+14805559999');
    await page.getByRole('button', { name: 'Save Changes' }).click();

    await page.getByRole('button', { name: /notifications/i }).click();
    await expect(page.getByText('Profile updated')).toBeVisible();
  });

  test('updates address successfully', async ({ page }) => {
    await seedSession(page, { role: 'customer' });
    await mockStoreApi(page);
    const addressPutRequest = page.waitForRequest(
      (req) => req.url().includes('/api/users/me/address') && req.method() === 'PUT',
    );
    await mockProfileApi(page);

    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: 'My Profile' })).toBeVisible();

    await page.locator('label:has-text("City") + input').fill('Scottsdale');
    await page.locator('label:has-text("ZIP Code") + input').fill('85251');
    await page.getByRole('button', { name: 'Save Changes' }).click();

    await page.getByRole('button', { name: /notifications/i }).click();
    await expect(page.getByText('Profile updated')).toBeVisible();
    const req = await addressPutRequest;
    const body = JSON.parse(req.postData() || '{}');
    expect(body.city).toBe('Scottsdale');
    expect(body.zip).toBe('85251');
  });

  test('saves name and address together in one click', async ({ page }) => {
    await seedSession(page, { role: 'customer' });
    await mockStoreApi(page);

    const profilePutRequest = page.waitForRequest(
      (req) => req.url().includes('/api/users/me') && !req.url().includes('/address') && req.method() === 'PUT',
    );
    const addressPutRequest = page.waitForRequest(
      (req) => req.url().includes('/api/users/me/address') && req.method() === 'PUT',
    );
    await mockProfileApi(page, { name: 'Jordan Phoenix' });

    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: 'My Profile' })).toBeVisible();

    await page.locator('label:has-text("Full Name") + input').fill('Jordan Phoenix');
    await page.locator('label:has-text("City") + input').fill('Tempe');
    await page.locator('label:has-text("ZIP Code") + input').fill('85281');
    await page.getByRole('button', { name: 'Save Changes' }).click();

    await page.getByRole('button', { name: /notifications/i }).click();
    await expect(page.getByText('Profile updated')).toBeVisible();

    const profileBody = JSON.parse((await profilePutRequest).postData() || '{}');
    expect(profileBody.name).toBe('Jordan Phoenix');

    const addressBody = JSON.parse((await addressPutRequest).postData() || '{}');
    expect(addressBody.city).toBe('Tempe');
    expect(addressBody.zip).toBe('85281');
  });

  test('shows error toast when profile API fails', async ({ page }) => {
    await seedSession(page, { role: 'customer' });
    await mockStoreApi(page);

    await page.route('**/api/users/me', async (route) => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({ status: 500, body: 'internal server error' });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(baseUser),
        });
      }
    });
    await page.route('**/api/users/me/address', async (route) => {
      await route.fulfill({ status: 204 });
    });

    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: 'My Profile' })).toBeVisible();

    await page.locator('label:has-text("Full Name") + input').fill('Fail User');
    await page.getByRole('button', { name: 'Save Changes' }).click();

    await page.getByRole('button', { name: /notifications/i }).click();
    await expect(page.getByText('Failed to update profile')).toBeVisible();
  });
});
