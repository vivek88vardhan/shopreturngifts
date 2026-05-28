import { Page, Route } from '@playwright/test';

const now = '2026-03-26T12:00:00Z';

export const mockProducts = [
  {
    productId: 'p1',
    name: 'Organic Apples',
    description: 'Fresh and crisp apples from local farms.',
    category: 'Fresh Produce',
    price: 4.99,
    currency: 'USD',
    stock: 42,
    images: ['https://images.example.com/apples.jpg'],
    tags: ['fresh', 'fruit'],
    isActive: true,
    isTaxable: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    productId: 'p2',
    name: 'Millet Granola',
    description: 'Crunchy granola blend with roasted millets.',
    category: 'Healthy Snacks',
    price: 7.5,
    currency: 'USD',
    stock: 10,
    images: ['https://images.example.com/granola.jpg'],
    tags: ['millet', 'snacks'],
    isActive: true,
    isTaxable: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    productId: 'p3',
    name: 'Instant Idli Mix',
    description: 'Quick and easy instant idli mix.',
    category: 'Instant Mixes',
    price: 3.25,
    currency: 'USD',
    stock: 0,
    images: [],
    tags: ['instant'],
    isActive: true,
    isTaxable: true,
    createdAt: now,
    updatedAt: now,
  },
];

export const mockCategories = [
  {
    categoryId: 'c1',
    name: 'Fresh Produce',
    description: 'Seasonal fruits and vegetables.',
    imageUrl: '',
    sortOrder: 1,
    isActive: true,
  },
  {
    categoryId: 'c2',
    name: 'Healthy Snacks',
    description: 'Guilt-free snacking options.',
    imageUrl: '',
    sortOrder: 2,
    isActive: true,
  },
  {
    categoryId: 'c3',
    name: 'Instant Mixes',
    description: 'Quick meal starters.',
    imageUrl: '',
    sortOrder: 3,
    isActive: true,
  },
];

const defaultTheme = {
  storeName: 'ShopReturnGifts Phoenix',
  logoUrl: '',
  heroTagline: 'Config driven commerce',
  primaryColor: '#1f2937',
  secondaryColor: '#f3f4f6',
  accentColor: '#f59e0b',
  currency: 'USD',
  taxRate: 8.5,
  stripeAutoTaxEnabled: false,
  freeShippingMinOrderAmount: 50,
  shippingFee: 4.99,
  maxQtyPerProduct: 10,
  freebieEnabled: false,
  freebieMinOrderAmount: 50,
  freebieLabel: 'Free gift on orders $50+',
  stripePublishableKey: 'pk_test_mock',
  promoLabel: 'Limited Time Offer',
  promoHeadline: 'Up to 40% Off New Arrivals',
  promoSubtext: 'Do not miss this season deals',
};

function respondJson(route: Route, data: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(data),
  });
}

function filterProducts(url: URL) {
  const category = (url.searchParams.get('category') || '').toLowerCase();
  const search = (url.searchParams.get('search') || '').toLowerCase();

  return mockProducts.filter((product) => {
    const categoryMatches = !category || product.category.toLowerCase() === category;
    const searchMatches =
      !search ||
      product.name.toLowerCase().includes(search) ||
      product.description.toLowerCase().includes(search);

    return categoryMatches && searchMatches;
  });
}

/**
 * Playwright E2E only — intercepts /api/* in the test browser. The live storefront
 * (npm run dev / production build) does not import or use this file.
 */
export async function mockStoreApi(page: Page) {
  // Mock Nominatim to avoid real external calls during tests
  await page.route('**/nominatim.openstreetmap.org/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ address: { postcode: '85001', state: 'AZ' } }]),
    });
  });

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;

    if (pathname.endsWith('/api/config/theme')) {
      return respondJson(route, defaultTheme);
    }

    if (pathname.endsWith('/api/categories')) {
      return respondJson(route, mockCategories);
    }

    if (pathname.endsWith('/api/products')) {
      const items = filterProducts(url);
      return respondJson(route, { items, nextCursor: null, count: items.length });
    }

    if (pathname.includes('/api/products/')) {
      const productId = decodeURIComponent(pathname.split('/api/products/')[1] || '');
      const product = mockProducts.find((item) => item.productId === productId);

      if (!product) {
        return route.fulfill({ status: 404, body: 'Product not found' });
      }

      return respondJson(route, product);
    }

    if (pathname.endsWith('/api/orders')) {
      return respondJson(route, { items: [], nextCursor: null, count: 0 });
    }

    if (pathname.endsWith('/api/users/me')) {
      return route.fulfill({ status: 401, body: 'unauthorized' });
    }

    if (pathname.endsWith('/api/notifications')) {
      return respondJson(route, { items: [], unreadCount: 0 });
    }

    return route.fulfill({ status: 404, body: 'mock route not found' });
  });
}

export async function mockAuthSuccessPaths(page: Page) {
  await page.route('**/api/auth/signup', async (route) => {
    await respondJson(route, { userSub: 'user-1' }, 201);
  });

  await page.route('**/api/auth/resend-code', async (route) => {
    await respondJson(route, { ok: true });
  });

  await page.route('**/api/auth/confirm', async (route) => {
    await respondJson(route, { user: { userId: 'user-1', email: 'user@example.com' } });
  });

  await page.route('**/api/auth/login', async (route) => {
    await respondJson(route, {
      user: {
        userId: 'user-1',
        email: 'user@example.com',
        name: 'Alex User',
        phone: '',
        role: 'customer',
        userType: 'B2C',
        isActive: true,
        address: { line1: '', city: '', state: '', zip: '', country: 'US' },
        createdAt: now,
        updatedAt: now,
      },
      token: 'token-123',
    });
  });
}

export async function mockLoginNeedsVerification(page: Page) {
  await page.route('**/api/auth/login', async (route) => {
    await respondJson(route, {
      error: 'email_not_verified',
      message: 'Please verify your email before signing in.',
    }, 403);
  });

  await page.route('**/api/auth/resend-code', async (route) => {
    await respondJson(route, { ok: true });
  });
}
