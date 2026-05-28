// API Configuration
// Set VITE_API_BASE_URL in your .env file to point to your Go Lambda API
// e.g. VITE_API_BASE_URL=https://shop.example.com/prod (or .../prod/api)

import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/stores/authStore';

const DEFAULT_API_BASE_URL = 'https://f3b2i8loe5.execute-api.us-east-1.amazonaws.com/prod/api';

function normalizeApiBaseUrl(rawBaseUrl: string): string {
  const baseUrl = rawBaseUrl.trim().replace(/\/+$/, '');
  if (!baseUrl) return '/api';
  return baseUrl.endsWith('/api') ? baseUrl : `${baseUrl}/api`;
}

export const API_BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL);

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

function getAuthHeaders(): Record<string, string> {
  // Try localStorage first (persisted Zustand store)
  const authData = localStorage.getItem('shopreturngifts-auth');
  if (authData) {
    try {
      const parsed = JSON.parse(authData);
      const token = parsed?.state?.token;
      if (token && typeof token === 'string' && token.trim().length > 0) {
        return { Authorization: `Bearer ${token}` };
      }
      // Debug: log why token wasn't found
      if (import.meta.env.DEV) {
        console.warn('[API] Token found in localStorage but invalid:', {
          hasToken: !!token,
          tokenType: typeof token,
          tokenLength: typeof token === 'string' ? token.length : 0,
        });
      }
    } catch (e) {
      if (import.meta.env.DEV) {
        console.warn('[API] Failed to parse shopreturngifts-auth from localStorage:', e);
      }
    }
  } else {
    if (import.meta.env.DEV) {
      console.warn('[API] No shopreturngifts-auth found in localStorage');
    }
  }
  return {};
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getAuthHeaders(),
    ...(options.headers as Record<string, string> || {}),
  };

  if (import.meta.env.DEV) {
    console.log('[API]', options.method || 'GET', endpoint, {
      hasAuthHeader: !!headers.Authorization,
      authHeaderPrefix: headers.Authorization?.substring(0, 20),
    });
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (!res.ok) {
    if (res.status === 401) {
      if (import.meta.env.DEV) {
        console.error('[API] 401 Unauthorized', {
          endpoint,
          hadAuthHeader: !!headers.Authorization,
          authData: localStorage.getItem('shopreturngifts-auth')?.substring(0, 50),
        });
      }
      // Align client with server: clear persisted auth and cached queries (matches Zustand persist).
      useAuthStore.getState().logout();
      queryClient.clear();
    }
    const body = await res.text();
    if (res.status === 401) {
      throw new ApiError(res.status, body || 'Session expired. Please sign in again.');
    }
    throw new ApiError(res.status, body || `Request failed with status ${res.status}`);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json();
}

type Product = import('@/types').Product;

const PRODUCT_PREFIX = 'PRODUCT#';

function normalizeProductId(productId: string | undefined): string {
  let normalized = productId || '';
  while (normalized.startsWith(PRODUCT_PREFIX)) {
    normalized = normalized.slice(PRODUCT_PREFIX.length);
  }
  return normalized;
}

function sanitizeProduct(product: Product): Product {
  return {
    ...product,
    productId: normalizeProductId(product.productId),
    images: (product.images || []).filter((image): image is string => Boolean(image) && !image.startsWith('blob:')),
  };
}

function productScore(product: Product): number {
  return (product.images?.length || 0) * 1000 + (product.isActive ? 100 : 0) + Math.max(product.stock || 0, 0);
}

function dedupeProducts(products: Product[]): Product[] {
  const deduped = new Map<string, Product>();

  for (const rawProduct of products) {
    const product = sanitizeProduct(rawProduct);
    const key = product.productId;
    if (!key) continue;

    const existing = deduped.get(key);
    if (!existing || productScore(product) >= productScore(existing)) {
      deduped.set(key, product);
    }
  }

  return Array.from(deduped.values());
}

type Order = import('@/types').Order;

const ORDER_PREFIX = 'ORDER#';

function normalizeOrderId(orderId: string | undefined): string {
  let normalized = orderId || '';
  while (normalized.startsWith(ORDER_PREFIX)) {
    normalized = normalized.slice(ORDER_PREFIX.length);
  }
  return normalized;
}

function sanitizeOrder(order: Order): Order {
  return {
    ...order,
    orderId: normalizeOrderId(order.orderId),
  };
}

function sanitizeOrders(orders: Order[]): Order[] {
  return orders.map(sanitizeOrder);
}

// ─── Public API ───

export const publicApi = {
  getTheme: () =>
    request<import('@/types').StoreConfig>('/config/theme'),

  getProducts: async (params?: { category?: string; search?: string; limit?: number; cursor?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.category) searchParams.set('category', params.category);
    if (params?.search) searchParams.set('search', params.search);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.cursor) searchParams.set('cursor', params.cursor);
    const qs = searchParams.toString();
    const response = await request<{ items: Product[]; nextCursor: string | null; count: number }>(
      `/products${qs ? `?${qs}` : ''}`
    );

    const items = dedupeProducts(response.items || []);
    return { ...response, items, count: items.length };
  },

  getProduct: async (productId: string) =>
    sanitizeProduct(await request<Product>(`/products/${encodeURIComponent(normalizeProductId(productId))}`)),

  getProductFeedback: (productId: string) =>
    request<import('@/types').ProductFeedbackResponse>(
      `/products/${encodeURIComponent(normalizeProductId(productId))}/feedback`
    ),

  getCategories: () =>
    request<import('@/types').Category[]>('/categories'),
};

// ─── Auth API ───

export const authApi = {
  confirmSignup: (email: string, code: string) =>
    request<{ user: import('@/types').User }>('/auth/confirm', { method: 'POST', body: JSON.stringify({ email, code }) }),

  resendCode: (email: string) =>
    request<{ message: string }>('/auth/resend-code', { method: 'POST', body: JSON.stringify({ email }) }),

  getMe: () =>
    request<import('@/types').User>('/users/me'),

  updateMe: (data: Partial<import('@/types').User>) =>
    request<import('@/types').User>('/users/me', { method: 'PUT', body: JSON.stringify(data) }),

  updateAddress: (address: import('@/types').Address) =>
    request<void>('/users/me/address', { method: 'PUT', body: JSON.stringify(address) }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>('/users/me/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  getMyRewards: () =>
    request<import('@/types').RewardSummaryResponse>('/users/me/rewards'),

  postProductRating: (productId: string, stars: number) =>
    request<{ averageRating: number; ratingCount: number }>(
      `/products/${encodeURIComponent(normalizeProductId(productId))}/ratings`,
      { method: 'POST', body: JSON.stringify({ stars }) }
    ),

  postProductComment: (productId: string, text: string) =>
    request<{ commentId: string }>(
      `/products/${encodeURIComponent(normalizeProductId(productId))}/comments`,
      { method: 'POST', body: JSON.stringify({ text }) }
    ),
};

// ─── Notifications API (authenticated; scoped to current user) ───

export const notificationsApi = {
  list: () =>
    request<import('@/types').NotificationListResponse>('/notifications'),

  markRead: (notificationId: string) =>
    request<void>(`/notifications/${encodeURIComponent(notificationId)}/read`, { method: 'PATCH' }),

  markAllRead: () =>
    request<void>('/notifications/read-all', { method: 'POST' }),
};

// ─── Orders API ───

export const ordersApi = {
  getOrders: async () => {
    const response = await request<{ items: Order[]; nextCursor: string | null; count: number }>('/orders');
    return { ...response, items: sanitizeOrders(response.items || []) };
  },

  getOrder: async (orderId: string) =>
    sanitizeOrder(await request<Order>(`/orders/${normalizeOrderId(orderId)}`)),

  createOrder: (data: { items: { productId: string; qty: number }[]; shippingAddress: import('@/types').Address; couponCode?: string }) =>
    request<import('@/types').CreateOrderResponse>('/orders', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  confirmPayment: (orderId: string, paymentIntentId: string) =>
    request<{ orderId: string; status: string; message: string }>(`/orders/${normalizeOrderId(orderId)}/payment/confirm`, {
      method: 'POST',
      body: JSON.stringify({ paymentIntentId }),
    }),

  getInvoice: (orderId: string) =>
    request<{ url: string }>(`/orders/${normalizeOrderId(orderId)}/invoice`),

  cancelOrder: (orderId: string, reason?: string) =>
    request<import('@/types').Order>(`/orders/${normalizeOrderId(orderId)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason || '' }),
    }),

  validateCoupon: (code: string) =>
    request<import('@/types').Coupon>(`/coupons/validate?code=${encodeURIComponent(code)}`),

  getBestCoupon: (subtotal?: number) => {
    const qs =
      subtotal != null && subtotal > 0 ? `?subtotal=${encodeURIComponent(String(subtotal))}` : '';
    return request<import('@/types').Coupon>(`/coupons/best${qs}`);
  },
};

// ─── Admin API ───

export const adminApi = {
  // Audit Logs
  getAuditLogs: () =>
    request<import('@/types').AuditLog[]>('/admin/audit-logs'),

  // Dashboard
  getDashboard: () =>
    request<{
      todayOrders: number;
      todayRevenue: number;
      todayGrossRevenue: number;
      todayRefunds: number;
      todayNetRevenue: number;
      totalGrossRevenue: number;
      totalRefunds: number;
      totalNetRevenue: number;
      revenueTrend: { date: string; gross: number; refunds: number; net: number }[];
      activeProducts: number;
      totalUsers: number;
      recentOrders: Order[];
      lowStockProducts: Product[];
    }>('/admin/dashboard').then((response) => ({
      ...response,
      recentOrders: sanitizeOrders(response.recentOrders || []),
    })),

  // Products
  getProducts: async () => {
    const response = await request<{ items: Product[] }>('/admin/products');
    return { ...response, items: dedupeProducts(response.items || []) };
  },

  createProduct: async (data: Partial<Product>) =>
    sanitizeProduct(await request<Product>('/admin/products', { method: 'POST', body: JSON.stringify(data) })),

  updateProduct: async (productId: string, data: Partial<Product>) =>
    sanitizeProduct(await request<Product>(`/admin/products/${encodeURIComponent(normalizeProductId(productId))}`, { method: 'PUT', body: JSON.stringify(data) })),

  deleteProduct: (productId: string) =>
    request<void>(`/admin/products/${encodeURIComponent(normalizeProductId(productId))}`, { method: 'DELETE' }),

  getProductImageUploadUrl: (productId: string) =>
    request<{ uploadUrl: string; imageUrl: string }>(`/admin/products/${encodeURIComponent(normalizeProductId(productId))}/image-upload-url`, { method: 'POST' }),

  // Categories
  getCategories: () =>
    request<import('@/types').Category[]>('/admin/categories'),

  createCategory: (data: Partial<import('@/types').Category>) =>
    request<import('@/types').Category>('/admin/categories', { method: 'POST', body: JSON.stringify(data) }),

  updateCategory: (categoryId: string, data: Partial<import('@/types').Category>) =>
    request<import('@/types').Category>(`/admin/categories/${encodeURIComponent(categoryId)}`, { method: 'PUT', body: JSON.stringify(data) }),

  deleteCategory: (categoryId: string) =>
    request<void>(`/admin/categories/${encodeURIComponent(categoryId)}`, { method: 'DELETE' }),

  getCategoryImageUploadUrl: (categoryId: string) =>
    request<{ uploadUrl: string; imageUrl: string }>(`/admin/categories/${encodeURIComponent(categoryId)}/image-upload-url`, { method: 'POST' }),

  // Orders
  getOrders: (params?: { status?: string; from?: string; to?: string; cursor?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.status && params.status !== 'All') searchParams.set('status', params.status);
    if (params?.from) searchParams.set('from', params.from);
    if (params?.to) searchParams.set('to', params.to);
    if (params?.cursor) searchParams.set('cursor', params.cursor);
    const qs = searchParams.toString();
    return request<{ items: Order[]; nextCursor: string | null; count: number }>(
      `/admin/orders${qs ? `?${qs}` : ''}`
    ).then((response) => ({
      ...response,
      items: sanitizeOrders(response.items || []),
    }));
  },

  getOrderReconciliation: (params?: { from?: string; to?: string; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.from) searchParams.set('from', params.from);
    if (params?.to) searchParams.set('to', params.to);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    const qs = searchParams.toString();
    return request<import('@/types').OrderReconciliationResponse>(
      `/admin/order-reconciliation${qs ? `?${qs}` : ''}`
    );
  },

  getOrder: async (orderId: string) =>
    sanitizeOrder(await request<Order>(`/admin/orders/${normalizeOrderId(orderId)}`)),

  updateOrderStatus: async (orderId: string, status: string, cancelReason?: string) =>
    sanitizeOrder(await request<Order>(`/admin/orders/${normalizeOrderId(orderId)}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, ...(cancelReason ? { cancelReason } : {}) }),
    })),

  patchOrder: async (orderId: string, data: { assignee: string }) =>
    sanitizeOrder(await request<Order>(`/admin/orders/${normalizeOrderId(orderId)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })),

  fulfillOrder: async (orderId: string) =>
    sanitizeOrder(await request<Order>(`/admin/orders/${normalizeOrderId(orderId)}/fulfill`, { method: 'PUT' })),

  refundOrder: (
    orderId: string,
    payload: {
      refundType: 'full' | 'partial';
      amountCents: number;
      reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
      comments?: string;
    }
  ) =>
    request<{ refunded_amount_cents: number; refund_id: string; payment_status: import('@/types').PaymentStatus }>(
      `/admin/orders/${normalizeOrderId(orderId)}/refund`,
      {
        method: 'POST',
        body: JSON.stringify({
          refund_type: payload.refundType,
          amount_cents: payload.amountCents,
          reason: payload.reason,
          comments: payload.comments,
        }),
      }
    ),

  // Users
  getUsers: () =>
    request<{ items: import('@/types').User[] }>('/admin/users'),

  createUser: (data: Partial<import('@/types').User> & { password?: string }) =>
    request<import('@/types').User>('/admin/users', { method: 'POST', body: JSON.stringify(data) }),

  getUser: (userId: string) =>
    request<import('@/types').User>(`/admin/users/${userId}`),

  updateUser: (userId: string, data: Partial<import('@/types').User>) =>
    request<import('@/types').User>(`/admin/users/${userId}`, { method: 'PUT', body: JSON.stringify(data) }),

  fixCognitoEmail: (userId: string) =>
    request<{ message: string }>(`/admin/users/${userId}/fix-cognito-email`, { method: 'POST' }),

  deleteUser: (userId: string) =>
    request<void>(`/admin/users/${userId}`, { method: 'DELETE' }),

  getRewards: () =>
    request<import('@/types').AdminRewardListResponse>('/admin/rewards'),

  getUserRewards: (userId: string) =>
    request<import('@/types').RewardSummaryResponse>(`/admin/users/${encodeURIComponent(userId)}/rewards`),

  // Config
  getConfig: () =>
    request<import('@/types').StoreConfig>('/admin/config'),

  updateConfig: (data: Partial<import('@/types').StoreConfig>) =>
    request<import('@/types').StoreConfig>('/admin/config', { method: 'PUT', body: JSON.stringify(data) }),

  sendLowStockAlertEmail: () =>
    request<{ sent: number; products: number }>('/admin/notifications/low-stock-email', { method: 'POST' }),

  getLogoUploadUrl: () =>
    request<{ uploadUrl: string; logoUrl: string }>('/admin/config/logo-upload-url', { method: 'POST' }),

  getHeroImageUploadUrl: () =>
    request<{ uploadUrl: string; imageUrl: string }>('/admin/config/hero-image-upload-url', { method: 'POST' }),

  getPromoBgImageUploadUrl: () =>
    request<{ uploadUrl: string; imageUrl: string }>('/admin/config/promo-bg-image-upload-url', { method: 'POST' }),

  // Coupons
  getCoupons: () =>
    request<{ items: import('@/types').Coupon[] }>('/admin/coupons'),

  createCoupon: (data: Partial<import('@/types').Coupon>) =>
    request<import('@/types').Coupon>('/admin/coupons', { method: 'POST', body: JSON.stringify(data) }),

  updateCoupon: (couponId: string, data: Partial<import('@/types').Coupon>) =>
    request<import('@/types').Coupon>(`/admin/coupons/${encodeURIComponent(couponId)}`, { method: 'PUT', body: JSON.stringify(data) }),

  deleteCoupon: (couponId: string) =>
    request<void>(`/admin/coupons/${encodeURIComponent(couponId)}`, { method: 'DELETE' }),

  // Dealers
  getDealers: () =>
    request<{ items: import('@/types').Dealer[]; count: number }>('/admin/dealers'),

  createDealer: (data: Partial<import('@/types').Dealer>) =>
    request<import('@/types').Dealer>('/admin/dealers', { method: 'POST', body: JSON.stringify(data) }),

  updateDealer: (dealerId: string, data: Partial<import('@/types').Dealer>) =>
    request<import('@/types').Dealer>(`/admin/dealers/${encodeURIComponent(dealerId)}`, { method: 'PUT', body: JSON.stringify(data) }),

  deleteDealer: (dealerId: string) =>
    request<void>(`/admin/dealers/${encodeURIComponent(dealerId)}`, { method: 'DELETE' }),

};

export { ApiError };
