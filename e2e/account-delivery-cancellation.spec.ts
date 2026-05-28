import { expect, test } from '../playwright-fixture';
import { mockProducts, mockStoreApi } from './fixtures/mockApi';
import { seedSession } from './fixtures/session';

test.describe('Account, delivery, and cancellation policy flows', () => {
  test('account page allows authenticated profile updates', async ({ page }) => {
    await seedSession(page, { role: 'customer' });
    await mockStoreApi(page);

    const updatedUser = {
      userId: 'customer-user-1',
      email: 'customer@shopreturngifts.test',
      name: 'Casey Phoenix',
      phone: '+14805550100',
      role: 'customer',
      userType: 'B2C',
      isActive: true,
      address: { line1: '123 Main St', line2: '', city: 'Phoenix', state: 'AZ', zip: '85001', country: 'US' },
      createdAt: '2026-03-26T12:00:00Z',
      updatedAt: '2026-04-08T00:00:00Z',
    };
    await page.route('**/api/users/me', async (route) => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updatedUser) });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updatedUser) });
      }
    });
    await page.route('**/api/users/me/address', async (route) => {
      await route.fulfill({ status: 204 });
    });

    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: 'My Profile' })).toBeVisible();

    await page.locator('label:has-text("Full Name") + input').fill('Casey Phoenix');
    await page.getByRole('button', { name: 'Save Changes' }).click();

    await page.getByRole('button', { name: /notifications/i }).click();
    await expect(page.getByText('Profile updated')).toBeVisible();
  });

  test('delivery flow accepts ZIP and proceeds to review', async ({ page }) => {
    await seedSession(page, { role: 'customer' });
    await mockStoreApi(page);

    await page.goto(`/products/${mockProducts[0].productId}`);
    await page.getByRole('button', { name: /Add to Cart/i }).click();
    await page.goto('/checkout');

    await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Shipping Address' })).toBeVisible();

    await page.locator('label:has-text("Full Name") + input').fill('Casey Phoenix');
    await page
      .locator('label:has-text("Address Line 1")')
      .locator('xpath=following-sibling::*[1]//input')
      .fill('500 Market St');
    await page.locator('label:has-text("City") + input').fill('Scottsdale');
    await page.locator('label:has-text("State") + select').selectOption('AZ');
    await page.locator('label:has-text("ZIP Code") + input').fill('85251');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('heading', { name: 'Coupon / Rewards' })).toBeVisible();
    await page.getByRole('button', { name: 'Skip & Continue' }).click();

    await expect(page.getByRole('heading', { name: 'Order Review' })).toBeVisible();
    await expect(page.getByText(/Scottsdale, AZ 85251/)).toBeVisible();
  });

  test('cancellation action is available for cancellable statuses only', async ({ page }) => {
    await seedSession(page, { role: 'admin' });
    await mockStoreApi(page);

    const orders = [
      {
        orderId: 'ord-paid',
        orderNumber: 'PHX-2026-00021',
        userId: 'customer-1',
        userName: 'Jordan Customer',
        userEmail: 'jordan@example.com',
        status: 'Paid',
        items: [{ productId: 'p1', name: 'Organic Apples', qty: 1, unitPrice: 4.99, lineTotal: 4.99 }],
        shippingAddress: { line1: '123 Main St', city: 'Phoenix', state: 'AZ', zip: '85001', country: 'US' },
        subtotal: 4.99,
        tax: 0.42,
        total: 5.41,
        currency: 'USD',
        createdAt: '2026-03-26T12:00:00Z',
        updatedAt: '2026-03-26T12:00:00Z',
      },
      {
        orderId: 'ord-delivered',
        orderNumber: 'PHX-2026-00022',
        userId: 'customer-2',
        userName: 'Taylor Delivered',
        userEmail: 'taylor@example.com',
        status: 'Delivered',
        items: [{ productId: 'p2', name: 'Millet Granola', qty: 1, unitPrice: 7.5, lineTotal: 7.5 }],
        shippingAddress: { line1: '789 Desert Rd', city: 'Phoenix', state: 'AZ', zip: '85002', country: 'US' },
        subtotal: 7.5,
        tax: 0.64,
        total: 8.14,
        currency: 'USD',
        createdAt: '2026-03-25T12:00:00Z',
        updatedAt: '2026-03-26T12:00:00Z',
      },
    ];

    await page.route('**/api/admin/orders**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: orders, nextCursor: null, count: orders.length }),
      });
    });

    await page.route('**/api/admin/orders/*/status', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });

    await page.goto('/admin/orders');
    await page.getByText('PHX-2026-00021').click();
    await expect(page.getByText('Update Status')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByText('PHX-2026-00022').click();
    await expect(page.getByText('Update Status')).not.toBeVisible();
  });
});
