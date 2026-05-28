import { expect, test } from '../playwright-fixture';
import { mockProducts, mockStoreApi } from './fixtures/mockApi';
import { seedSession } from './fixtures/session';

test.describe('Checkout Stripe test card outcomes', () => {
  test('4242 4242 4242 4242 succeeds (happy path)', async ({ page }) => {
    await seedSession(page, { role: 'customer' });
    await mockStoreApi(page);

    await page.route('**/api/orders', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            orderId: 'ord-happy',
            orderNumber: 'PHX-2026-01001',
            clientSecret: 'pi_mock_secret',
            amountCents: 541,
            currency: 'usd',
          }),
        });
        return;
      }

      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], nextCursor: null, count: 0 }) });
    });

    await page.route('**/api/orders/ord-happy/payment/confirm', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ orderId: 'ord-happy', status: 'authorized', message: 'ok' }) });
    });

    await page.route('**/api/orders/ord-happy', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          orderId: 'ORDER#ord-happy',
          orderNumber: 'PHX-2026-01001',
          userId: 'customer-1',
          status: 'Paid',
          invoiceS3Key: 'receipts/ord-happy.pdf',
          items: [{ productId: 'p1', name: 'Organic Apples', qty: 1, unitPrice: 4.99, lineTotal: 4.99 }],
          shippingAddress: { line1: '123 Main St', city: 'Phoenix', state: 'AZ', zip: '85001', country: 'US' },
          subtotal: 4.99,
          tax: 0.42,
          total: 5.41,
          currency: 'USD',
          createdAt: '2026-03-26T12:00:00Z',
          updatedAt: '2026-03-26T12:00:00Z',
        }),
      });
    });

    await page.goto(`/products/${mockProducts[0].productId}`);
    await page.getByRole('button', { name: /Add to Cart/i }).click();
    await page.goto('/checkout');

    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Skip & Continue' }).click();
    await page.getByRole('button', { name: 'Continue to Payment' }).click();

    await page.goto('/checkout/success?orderId=ord-happy&payment_intent=pi_happy_4242');
    await expect(page.getByRole('heading', { name: 'Payment authorized' })).toBeVisible();
    await expect(page.getByTestId('order-id')).toContainText('PHX-2026-01001');
  });

  test('after payment customer can track order, view receipt, and continue shopping', async ({ page }) => {
    await page.addInitScript(() => {
      const openedUrls: string[] = [];
      (window as Window & { __openedUrls?: string[] }).__openedUrls = openedUrls;
      window.open = ((url?: string | URL) => {
        openedUrls.push(String(url ?? ''));
        return null;
      }) as typeof window.open;
    });

    await seedSession(page, { role: 'customer' });
    await mockStoreApi(page);

    await page.route('**/api/orders', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            orderId: 'ord-post-payment',
            orderNumber: 'PHX-2026-01002',
            clientSecret: 'pi_post_payment_secret',
            amountCents: 541,
            currency: 'usd',
          }),
        });
        return;
      }

      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], nextCursor: null, count: 0 }) });
    });

    await page.route('**/api/orders/ord-post-payment/payment/confirm', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ orderId: 'ord-post-payment', status: 'authorized', message: 'ok' }),
      });
    });

    await page.route('**/api/orders/ord-post-payment/invoice', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: 'https://receipts.shopreturngifts.test/ord-post-payment.pdf' }),
      });
    });

    await page.route('**/api/orders/ord-post-payment', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          orderId: 'ORDER#ord-post-payment',
          orderNumber: 'PHX-2026-01002',
          userId: 'customer-1',
          status: 'Paid',
          invoiceS3Key: 'receipts/ord-post-payment.pdf',
          trackingNumber: '1Z-TRACK-0001',
          items: [{ productId: 'p1', name: 'Organic Apples', qty: 1, unitPrice: 4.99, lineTotal: 4.99 }],
          shippingAddress: { line1: '123 Main St', city: 'Phoenix', state: 'AZ', zip: '85001', country: 'US' },
          subtotal: 4.99,
          tax: 0.42,
          total: 5.41,
          currency: 'USD',
          createdAt: '2026-03-26T12:00:00Z',
          updatedAt: '2026-03-26T12:00:00Z',
        }),
      });
    });

    await page.goto(`/products/${mockProducts[0].productId}`);
    await page.getByRole('button', { name: /Add to Cart/i }).click();
    await page.goto('/checkout');

    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Skip & Continue' }).click();
    await page.getByRole('button', { name: 'Continue to Payment' }).click();

    await page.goto('/checkout/success?orderId=ord-post-payment&payment_intent=pi_post_payment');
    await expect(page.getByRole('heading', { name: 'Payment authorized' })).toBeVisible();
    await expect(page.getByTestId('order-id')).toContainText('PHX-2026-01002');
    await expect(page.getByTestId('track-order-btn')).toHaveAttribute('href', '/orders/ord-post-payment');

    await page.getByTestId('receipt-download-btn').click();
    await expect.poll(async () => page.evaluate(() => {
      return (window as Window & { __openedUrls?: string[] }).__openedUrls ?? [];
    })).toContain('https://receipts.shopreturngifts.test/ord-post-payment.pdf');

    await page.getByTestId('track-order-btn').click();
    await expect(page).toHaveURL(/\/orders\/ord-post-payment$/);
    await expect(page.getByRole('heading', { name: 'PHX-2026-01002' })).toBeVisible();
    await expect(page.getByText('Tracking Number')).toBeVisible();
    await expect(page.getByText('1Z-TRACK-0001')).toBeVisible();

    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Payment authorized' })).toBeVisible();

    await page.getByTestId('continue-shopping-btn').click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: /Featured Products/i })).toBeVisible();
  });

  const failedCards = [
    {
      number: '4000 0000 0000 0002',
      expected: 'Card declined',
    },
    {
      number: '4000 0025 0000 3155',
      expected: '3D Secure authentication required',
    },
    {
      number: '4000 0000 0000 9995',
      expected: 'Insufficient funds',
    },
  ];

  for (const card of failedCards) {
    test(`${card.number} shows failure handling`, async ({ page }) => {
      await mockStoreApi(page);
      await page.goto(`/checkout/failure?orderId=ord-fail&message=${encodeURIComponent(`${card.expected} (${card.number})`)}`);

      await expect(page.getByRole('heading', { name: 'Payment failed' })).toBeVisible();
      await expect(page.getByTestId('payment-error')).toContainText(card.expected);
      await expect(page.getByText(card.number)).toBeVisible();
    });
  }
});
