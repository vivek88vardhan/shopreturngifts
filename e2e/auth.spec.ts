import { expect, test } from '../playwright-fixture';
import { mockAuthSuccessPaths, mockLoginNeedsVerification, mockStoreApi } from './fixtures/mockApi';

test.describe('Auth journeys', () => {
  test.beforeEach(async ({ page }) => {
    await mockStoreApi(page);
  });

  test('login redirects to verification step when account is unconfirmed', async ({ page }) => {
    await mockLoginNeedsVerification(page);
    await page.goto('/login');

    await page.locator('input[type="email"]').fill('new.user@example.com');
    await page.locator('input[type="password"]').fill('password123');
    await page.getByRole('main').getByRole('button', { name: 'Sign In', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Verify Your Email' })).toBeVisible();
    await expect(page.getByText('new.user@example.com')).toBeVisible();
  });

  test('signup moves to verification state and allows resending code', async ({ page }) => {
    await mockAuthSuccessPaths(page);
    await page.goto('/signup');

    await page.locator('input').first().fill('Alex User');
    await page.locator('input[type="email"]').fill('alex.user@example.com');
    await page.locator('input[type="password"]').fill('Password123');
    await page.getByRole('button', { name: 'Create Account' }).click();

    await expect(page.getByRole('heading', { name: 'Verify Your Email' })).toBeVisible();
    const [resendResponse] = await Promise.all([
      page.waitForResponse('**/api/auth/resend-code'),
      page.getByRole('button', { name: 'Resend code' }).click(),
    ]);
    expect(resendResponse.ok()).toBeTruthy();
  });
});
