import { expect, test } from '../playwright-fixture';
import { mockProducts, mockStoreApi } from './fixtures/mockApi';
import { seedSession } from './fixtures/session';

test.describe('Discount code admin, promotions, and tax flows', () => {
  test('discount code admin can create and toggle a coupon', async ({ page }) => {
    await seedSession(page, { role: 'admin' });
    await mockStoreApi(page);

    let coupons = [
      {
        couponId: 'coupon-1',
        code: 'WELCOME10',
        description: 'Welcome discount',
        discountPercent: 10,
        isActive: true,
        createdAt: '2026-03-26T12:00:00Z',
        updatedAt: '2026-03-26T12:00:00Z',
      },
    ];

    await page.route('**/api/admin/coupons', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: coupons }) });
        return;
      }

      if (route.request().method() === 'POST') {
        const body = JSON.parse(route.request().postData() || '{}');
        const created = {
          couponId: 'coupon-2',
          code: body.code,
          description: body.description,
          discountPercent: body.discountPercent,
          isActive: body.isActive,
          createdAt: '2026-03-26T12:00:00Z',
          updatedAt: '2026-03-26T12:00:00Z',
        };
        coupons = [...coupons, created];
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) });
        return;
      }

      await route.fallback();
    });

    await page.route('**/api/admin/coupons/*', async (route) => {
      const couponId = route.request().url().split('/').pop() || '';
      const body = JSON.parse(route.request().postData() || '{}');
      coupons = coupons.map((coupon) =>
        coupon.couponId === couponId ? { ...coupon, ...body, updatedAt: '2026-03-26T12:05:00Z' } : coupon
      );
      const updated = coupons.find((coupon) => coupon.couponId === couponId);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updated) });
    });

    await page.goto('/admin/coupons');
    await expect(page.getByRole('heading', { name: 'Coupons' })).toBeVisible();

    await page.getByRole('button', { name: 'Add Coupon' }).dispatchEvent('click');
    const dialog = page.getByRole('dialog', { name: 'Create Coupon' });
    await dialog.getByPlaceholder('e.g. SAVE20').fill('PHX20');
    await dialog.getByPlaceholder('Optional description').fill('Phoenix weekend coupon');
    await dialog.locator('input[type="number"]').fill('20');
    await dialog.getByRole('button', { name: 'Create' }).click();

    await page.getByRole('button', { name: /notifications/i }).dispatchEvent('pointerdown', { button: 0, bubbles: true, cancelable: true });
    await expect(page.getByText('Coupon created')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByText('PHX20')).toBeVisible();

    await page.getByRole('row', { name: /WELCOME10/i }).getByRole('switch').dispatchEvent('click');
    await page.getByRole('button', { name: /notifications/i }).dispatchEvent('pointerdown', { button: 0, bubbles: true, cancelable: true });
    await expect(page.getByText('Coupon disabled')).toBeVisible();
  });

  test('promotions settings can be updated from admin configuration', async ({ page }) => {
    await seedSession(page, { role: 'admin' });
    await mockStoreApi(page);

    let config = {
      storeName: 'ShopReturnGifts Phoenix',
      logoUrl: '',
      primaryColor: '#1f2937',
      secondaryColor: '#f3f4f6',
      accentColor: '#f59e0b',
      currency: 'USD',
      taxRate: 8.5,
      stripePublishableKey: 'pk_test_mock',
      promoLabel: 'Limited Time Offer',
      promoHeadline: 'Up to 40% Off New Arrivals',
      promoSubtext: 'Do not miss this season deals',
      promoBgImageUrl: '',
    };

    await page.route('**/api/admin/config', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(config) });
        return;
      }

      if (route.request().method() === 'PUT') {
        const body = JSON.parse(route.request().postData() || '{}');
        config = { ...config, ...body };
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(config) });
        return;
      }

      await route.fallback();
    });

    await page.goto('/admin/config');
    await expect(page.getByRole('heading', { name: 'Store Configuration' })).toBeVisible();

    await page.locator('input[value="Limited Time Offer"]').fill('Flash Sale');
    await page.locator('input[value="Up to 40% Off New Arrivals"]').fill('Weekend Fresh Deals');
    await page.locator('input[value="Do not miss this season deals"]').fill('Auto-expiry promos are active');
    await page.getByRole('button', { name: 'Save Configuration' }).dispatchEvent('click');

    await page.getByRole('button', { name: /notifications/i }).dispatchEvent('pointerdown', { button: 0, bubbles: true, cancelable: true });
    await expect(page.getByText('Store configuration saved and theme applied')).toBeVisible();
  });

  test('tax summary recalculates after coupon on checkout', async ({ page }) => {
    await seedSession(page, { role: 'customer' });
    await mockStoreApi(page);

    await page.route('**/api/coupons/validate**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          couponId: 'coupon-10',
          code: 'SAVE10',
          description: '10% off',
          discountPercent: 10,
          isActive: true,
          createdAt: '2026-03-26T12:00:00Z',
          updatedAt: '2026-03-26T12:00:00Z',
        }),
      });
    });

    await page.goto(`/products/${mockProducts[0].productId}`);
    await page.getByRole('button', { name: /Add to Cart/i }).click();
    await page.goto('/checkout');

    await expect(page.getByText(/Est\. 8\.5%/)).toBeVisible();
    await expect(page.getByText('$0.42')).toBeVisible();

    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByPlaceholder('Enter coupon code').fill('save10');
    await page.getByRole('button', { name: 'Apply' }).click();

    await page.getByRole('button', { name: /notifications/i }).click();
    await expect(page.getByText('Applied SAVE10')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByText('Discount (10% off)')).toBeVisible();
    await expect(page.getByText('$0.38')).toBeVisible();
  });

  test('tax mode toggle: custom tax rate input is disabled when Stripe Automatic Tax is ON', async ({ page }) => {
    await seedSession(page, { role: 'admin' });
    await mockStoreApi(page);

    const config = {
      storeName: 'ShopReturnGifts Phoenix',
      logoUrl: '',
      primaryColor: '#1f2937',
      secondaryColor: '#f3f4f6',
      accentColor: '#f59e0b',
      currency: 'USD',
      taxRate: 8.5,
      stripePublishableKey: 'pk_test_mock',
      stripeAutoTaxEnabled: true,
      enableRatings: false,
      enableComments: false,
      lowStockThreshold: 10,
    };

    await page.route('**/api/admin/config', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(config) });
        return;
      }
      await route.fallback();
    });

    await page.goto('/admin/config');
    await expect(page.getByRole('heading', { name: 'Store Configuration' })).toBeVisible();

    // When Stripe Auto Tax is ON, the custom tax rate input must be disabled.
    const taxRateInput = page.locator('#custom-tax-rate');
    await expect(taxRateInput).toBeDisabled();

    // Helper text confirms Stripe is managing tax.
    await expect(page.getByText('Custom rate is inactive — tax is managed automatically by Stripe.')).toBeVisible();
  });

  test('tax mode toggle: custom tax rate input is enabled when Stripe Automatic Tax is OFF', async ({ page }) => {
    await seedSession(page, { role: 'admin' });
    await mockStoreApi(page);

    const config = {
      storeName: 'ShopReturnGifts Phoenix',
      logoUrl: '',
      primaryColor: '#1f2937',
      secondaryColor: '#f3f4f6',
      accentColor: '#f59e0b',
      currency: 'USD',
      taxRate: 8.5,
      stripePublishableKey: 'pk_test_mock',
      stripeAutoTaxEnabled: false,
      enableRatings: false,
      enableComments: false,
      lowStockThreshold: 10,
    };

    await page.route('**/api/admin/config', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(config) });
        return;
      }
      await route.fallback();
    });

    await page.goto('/admin/config');
    await expect(page.getByRole('heading', { name: 'Store Configuration' })).toBeVisible();

    // When Stripe Auto Tax is OFF, the custom tax rate input must be enabled.
    const taxRateInput = page.locator('#custom-tax-rate');
    await expect(taxRateInput).toBeEnabled();

    // Helper text confirms the custom rate applies.
    await expect(page.getByText('Applied to all taxable order items at checkout.')).toBeVisible();
  });

  test('tax mode toggle: toggling Stripe Automatic Tax switches the custom rate input state', async ({ page }) => {
    await seedSession(page, { role: 'admin' });
    await mockStoreApi(page);

    let savedConfig = {
      storeName: 'ShopReturnGifts Phoenix',
      logoUrl: '',
      primaryColor: '#1f2937',
      secondaryColor: '#f3f4f6',
      accentColor: '#f59e0b',
      currency: 'USD',
      taxRate: 8.5,
      stripePublishableKey: 'pk_test_mock',
      stripeAutoTaxEnabled: true,
      enableRatings: false,
      enableComments: false,
      lowStockThreshold: 10,
    };

    await page.route('**/api/admin/config', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(savedConfig) });
        return;
      }
      if (route.request().method() === 'PUT') {
        const body = JSON.parse(route.request().postData() || '{}');
        savedConfig = { ...savedConfig, ...body };
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(savedConfig) });
        return;
      }
      await route.fallback();
    });

    await page.goto('/admin/config');
    await expect(page.getByRole('heading', { name: 'Store Configuration' })).toBeVisible();

    const taxRateInput = page.locator('#custom-tax-rate');

    // Initially Stripe Auto Tax is ON → custom rate is disabled.
    await expect(taxRateInput).toBeDisabled();

    // Find and click the Stripe Automatic Tax toggle to turn it OFF.
    const stripeAutoTaxSwitch = page.getByText('Stripe Automatic Tax', { exact: true }).locator('xpath=../../button');
    await stripeAutoTaxSwitch.dispatchEvent('click');

    // Now custom rate should be enabled.
    await expect(taxRateInput).toBeEnabled();
    await expect(page.getByText('Applied to all taxable order items at checkout.')).toBeVisible();

    // Toggle it back ON.
    await stripeAutoTaxSwitch.dispatchEvent('click');
    await expect(taxRateInput).toBeDisabled();
    await expect(page.getByText('Custom rate is inactive — tax is managed automatically by Stripe.')).toBeVisible();
  });
});
