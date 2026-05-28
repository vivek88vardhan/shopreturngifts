import { expect, test } from '../playwright-fixture';
import { mockProducts, mockStoreApi } from './fixtures/mockApi';

test.describe('Guard and checkout flows', () => {
  test.beforeEach(async ({ page }) => {
    await mockStoreApi(page);
  });

  test('categories page navigates to filtered products view', async ({ page }) => {
    await page.goto('/categories');

    await expect(page.getByRole('heading', { name: 'Categories' })).toBeVisible();
    await page.getByRole('link', { name: 'Fresh Produce' }).click();

    await expect(page).toHaveURL(/\/products\?category=Fresh%20Produce/);
    await expect(page.getByRole('heading', { name: 'Fresh Produce' })).toBeVisible();
    await expect(page.getByText('Organic Apples')).toBeVisible();
  });

  test('orders and profile pages require authentication', async ({ page }) => {
    await page.goto('/orders');

    await expect(page.getByText('Please sign in to view your orders')).toBeVisible();
    await page.getByRole('link', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto('/profile');
    await expect(page.getByText('Please sign in')).toBeVisible();
  });

  test('unauthenticated checkout prompts login after cart drawer checkout action', async ({ page }) => {
    await page.goto(`/products/${mockProducts[0].productId}`);
    await page.getByRole('button', { name: /Add to Cart/i }).click();

    await page.getByRole('button', { name: 'Open cart' }).click();
    await expect(page.getByRole('heading', { name: 'Shopping Cart' })).toBeVisible();

    await page.getByRole('button', { name: 'Proceed to Checkout' }).click();

    await expect(page).toHaveURL(/\/checkout$/);
    await expect(page.getByText('Please log in to proceed with checkout.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log in to Checkout' })).toBeVisible();
  });
});
