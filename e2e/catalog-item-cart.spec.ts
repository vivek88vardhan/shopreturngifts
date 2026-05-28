import { expect, test } from '../playwright-fixture';
import { mockProducts, mockStoreApi } from './fixtures/mockApi';

test.describe('Catalog and product interaction flows', () => {
  test.beforeEach(async ({ page }) => {
    await mockStoreApi(page);
  });

  test('catalog search returns matching products', async ({ page }) => {
    await page.goto('/products');

    await page.getByPlaceholder('Search products...').fill('millet');
    await expect(page.getByText('Millet Granola')).toBeVisible();
    await expect(page.getByText('Organic Apples')).not.toBeVisible();
  });

  test('item detail shows extended content tabs when present', async ({ page }) => {
    await page.route(`**/api/products/${mockProducts[0].productId}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...mockProducts[0],
          nutritionalFacts: [
            { label: 'Calories', value: '95', unit: 'kcal' },
            { label: 'Fiber', value: '4.4', unit: 'g' },
          ],
          benefits: 'Supports gut health',
          usage: 'Wash and serve',
          ingredients: 'Apples',
        }),
      });
    });

    await page.goto(`/products/${mockProducts[0].productId}`);

    await expect(page.getByRole('tab', { name: 'Nutritional Facts' })).toBeVisible();
    await page.getByRole('tab', { name: 'Benefits' }).click();
    await expect(page.getByText('Supports gut health')).toBeVisible();
    await page.getByRole('tab', { name: 'Ingredients' }).click();
    await expect(page.getByText('Apples', { exact: true })).toBeVisible();
  });

  test('cart supports quantity updates and item removal', async ({ page }) => {
    await page.goto(`/products/${mockProducts[0].productId}`);
    await page.getByRole('button', { name: /Add to Cart/i }).click();

    await page.goto('/cart');
    await expect(page.getByRole('heading', { name: 'Shopping Cart' })).toBeVisible();

    const cartRow = page.locator('div.flex.gap-4.p-4').first();
    await cartRow.locator('button').nth(2).click();
    await expect(cartRow.getByText('$9.98')).toBeVisible();

    await cartRow.getByRole('button', { name: 'Remove Organic Apples from cart' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByRole('heading', { name: 'Your cart is empty' })).toBeVisible();
  });
});
