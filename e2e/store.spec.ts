import { expect, test } from '../playwright-fixture';
import { mockProducts, mockStoreApi } from './fixtures/mockApi';

test.describe('Storefront public flows', () => {
  test.beforeEach(async ({ page }) => {
    await mockStoreApi(page);
  });

  test('home page shows themed branding and featured catalog', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('ShopReturnGifts Phoenix').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /Featured Products/i })).toBeVisible();
    await expect(page.getByText('Organic Apples').first()).toBeVisible();
    await expect(page.getByText('Millet Granola').first()).toBeVisible();

    await page.getByRole('link', { name: /Shop Now/i }).click();
    await expect(page).toHaveURL(/\/products$/);
  });

  test('products page supports category and search filtering', async ({ page }) => {
    await page.goto('/products');

    await expect(page.getByRole('heading', { name: 'All Products' })).toBeVisible();
    await page.getByRole('button', { name: 'Fresh Produce' }).click();

    await expect(page.getByRole('heading', { name: 'Fresh Produce' })).toBeVisible();
    await expect(page.getByText('Organic Apples')).toBeVisible();
    await expect(page.getByText('Millet Granola')).not.toBeVisible();

    await page.getByPlaceholder('Search products...').fill('nonexistent');
    await expect(page.getByText('No products found')).toBeVisible();
  });

  test('product detail can add to cart and cart page shows line item', async ({ page }) => {
    await page.goto(`/products/${mockProducts[0].productId}`);

    await expect(page.getByRole('heading', { name: mockProducts[0].name })).toBeVisible();
    await page.getByRole('button', { name: /Add to Cart/i }).click();

    await page.goto('/cart');
    await expect(page.getByRole('heading', { name: 'Shopping Cart' })).toBeVisible();
    await expect(page.getByRole('link', { name: mockProducts[0].name })).toBeVisible();
    await expect(page.getByText('1 item')).toBeVisible();
  });

  test('unknown routes render 404 page', async ({ page }) => {
    await page.goto('/route-that-does-not-exist');

    await expect(page.getByText('Oops! Page not found')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Return to Home' })).toBeVisible();
  });
});
