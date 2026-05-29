import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { publicApi, authApi, ordersApi, adminApi, notificationsApi } from '@/lib/api';
import { readThemeSnapshot } from '@/lib/themeSnapshot';
import type { Product, Category, Order, User, StoreConfig, Coupon, Address, OrderStatus, Dealer, RefundStatus } from '@/types';

// ─── Public Hooks ───

export function useThemeConfig() {
  return useQuery({
    queryKey: ['theme'],
    queryFn: publicApi.getTheme,
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
    placeholderData: () => {
      const snap = readThemeSnapshot();
      return snap ? ({ ...snap } as StoreConfig) : undefined;
    },
  });
}

export function useProducts(params?: { category?: string; search?: string }) {
  return useQuery({
    queryKey: ['products', params],
    queryFn: () => publicApi.getProducts(params),
  });
}

export function useProduct(productId: string | undefined) {
  return useQuery({
    queryKey: ['product', productId],
    queryFn: () => publicApi.getProduct(productId!),
    enabled: !!productId,
  });
}

export function useProductFeedback(productId: string | undefined) {
  return useQuery({
    queryKey: ['productFeedback', productId],
    queryFn: () => publicApi.getProductFeedback(productId!),
    enabled: !!productId,
    staleTime: 60_000,
  });
}

export function usePostProductRating(productId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (stars: number) => {
      if (!productId) throw new Error('Missing product');
      return authApi.postProductRating(productId, stars);
    },
    onSuccess: () => {
      if (productId) qc.invalidateQueries({ queryKey: ['productFeedback', productId] });
    },
  });
}

export function usePostProductComment(productId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => {
      if (!productId) throw new Error('Missing product');
      return authApi.postProductComment(productId, text);
    },
    onSuccess: () => {
      if (productId) qc.invalidateQueries({ queryKey: ['productFeedback', productId] });
    },
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: publicApi.getCategories,
  });
}

// ─── Auth Hooks ───

export function useCurrentUser() {
  return useQuery({
    queryKey: ['currentUser'],
    queryFn: authApi.getMe,
    retry: false,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<User>) => authApi.updateMe(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['currentUser'] }); },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
      authApi.changePassword(currentPassword, newPassword),
  });
}

export function useUpdateAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (address: Address) => authApi.updateAddress(address),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['currentUser'] }); },
  });
}

export function useMyRewards() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  return useQuery({
    queryKey: ['myRewards'],
    queryFn: authApi.getMyRewards,
    enabled: isAuthenticated,
    staleTime: 30_000,
    retry: 1,
  });
}

// ─── Order Hooks ───

export function useOrders() {
  return useQuery({
    queryKey: ['orders'],
    queryFn: ordersApi.getOrders,
  });
}

export function useOrder(orderId: string | undefined) {
  return useQuery({
    queryKey: ['order', orderId],
    queryFn: () => ordersApi.getOrder(orderId!),
    enabled: !!orderId,
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { items: { productId: string; qty: number; engraving?: import('@/types').EngravingDetails }[]; shippingAddress: Address; couponCode?: string }) =>
      ordersApi.createOrder(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); },
  });
}

export function useCancelOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason?: string }) =>
      ordersApi.cancelOrder(orderId, reason),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['order', vars.orderId] });
    },
  });
}

// ─── Admin Hooks ───

export function useAdminAuditLogs() {
  return useQuery({
    queryKey: ['admin', 'audit-logs'],
    queryFn: adminApi.getAuditLogs,
  });
}

export function useAdminDashboard() {
  return useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: adminApi.getDashboard,
  });
}

export function useAdminProducts() {
  return useQuery({
    queryKey: ['admin', 'products'],
    queryFn: adminApi.getProducts,
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Product>) => adminApi.createProduct(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'products'] }); },
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, data }: { productId: string; data: Partial<Product> }) =>
      adminApi.updateProduct(productId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'products'] }); },
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (productId: string) => adminApi.deleteProduct(productId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'products'] }); },
  });
}

export function useAdminCategories() {
  return useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: adminApi.getCategories,
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Category>) => adminApi.createCategory(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'categories'] }); },
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ categoryId, data }: { categoryId: string; data: Partial<Category> }) =>
      adminApi.updateCategory(categoryId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'categories'] }); },
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (categoryId: string) => adminApi.deleteCategory(categoryId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'categories'] }); },
  });
}

export function useAdminOrders(params?: { status?: string; from?: string; to?: string }) {
  return useQuery({
    queryKey: ['admin', 'orders', params],
    queryFn: () => adminApi.getOrders(params),
  });
}

export function useAdminOrderReconciliation(params?: { from?: string; to?: string; limit?: number }) {
  return useQuery({
    queryKey: ['admin', 'order-reconciliation', params],
    queryFn: () => adminApi.getOrderReconciliation(params),
  });
}

export function useUpdateOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      orderId,
      status,
      cancelReason,
    }: {
      orderId: string;
      status: OrderStatus;
      cancelReason?: string;
    }) => adminApi.updateOrderStatus(orderId, status, cancelReason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
      qc.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
    },
  });
}

export function usePatchOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, assignee }: { orderId: string; assignee: string }) =>
      adminApi.patchOrder(orderId, { assignee }),
    onSuccess: (updated) => {
      qc.setQueriesData<{ items: import('@/types').Order[]; nextCursor: string | null; count: number }>(
        { queryKey: ['admin', 'orders'] },
        old => {
          if (!old?.items) return old;
          return {
            ...old,
            items: old.items.map(o => (o.orderId === updated.orderId ? { ...o, ...updated } : o)),
          };
        },
      );
      qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
      qc.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
    },
  });
}

export function useRefundOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      orderId,
      refundType,
      amountCents,
      reason,
      comments,
    }: {
      orderId: string;
      refundType: 'full' | 'partial';
      amountCents: number;
      reason: 'duplicate' | 'fraudulent' | 'requested_by_customer';
      comments?: string;
    }) => adminApi.refundOrder(orderId, { refundType, amountCents, reason, comments }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
      qc.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
    },
  });
}

export function useAdminUsers() {
  return useQuery({
    queryKey: ['admin', 'users'],
    queryFn: adminApi.getUsers,
  });
}

export function useAdminRewards() {
  return useQuery({
    queryKey: ['admin', 'rewards'],
    queryFn: adminApi.getRewards,
  });
}

export function useAdminUserRewards(userId: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'rewards', userId],
    queryFn: () => adminApi.getUserRewards(userId!),
    enabled: !!userId,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<User> & { password?: string }) => adminApi.createUser(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'users'] }); },
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: Partial<User> }) =>
      adminApi.updateUser(userId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'users'] }); },
  });
}

export function useAdminConfig() {
  return useQuery({
    queryKey: ['admin', 'config'],
    queryFn: adminApi.getConfig,
  });
}

export function useUpdateConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<StoreConfig>) => adminApi.updateConfig(data),
    onSuccess: (updated) => {
      qc.setQueryData(['admin', 'config'], updated);
      qc.invalidateQueries({ queryKey: ['admin', 'config'] });
      qc.invalidateQueries({ queryKey: ['theme'] });
    },
  });
}

// ─── Coupon Hooks ───

export function useAdminCoupons() {
  return useQuery({
    queryKey: ['admin', 'coupons'],
    queryFn: adminApi.getCoupons,
  });
}

export function useCreateCoupon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Coupon>) => adminApi.createCoupon(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'coupons'] }); },
  });
}

export function useUpdateCoupon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ couponId, data }: { couponId: string; data: Partial<Coupon> }) =>
      adminApi.updateCoupon(couponId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'coupons'] }); },
  });
}

export function useDeleteCoupon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (couponId: string) => adminApi.deleteCoupon(couponId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'coupons'] }); },
  });
}

export function useValidateCoupon() {
  return useMutation({
    mutationFn: (code: string) => ordersApi.validateCoupon(code),
  });
}

export function useBestCoupon(subtotal: number, enabled = true) {
  return useQuery({
    queryKey: ['coupons', 'best', subtotal],
    queryFn: () => ordersApi.getBestCoupon(subtotal),
    enabled,
    retry: false,
    staleTime: 60 * 1000,
  });
}

// ─── Dealer Hooks ───

export function useAdminDealers() {
  return useQuery({
    queryKey: ['admin', 'dealers'],
    queryFn: adminApi.getDealers,
  });
}

export function useCreateDealer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Dealer>) => adminApi.createDealer(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'dealers'] }); },
  });
}

export function useUpdateDealer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dealerId, data }: { dealerId: string; data: Partial<Dealer> }) =>
      adminApi.updateDealer(dealerId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'dealers'] }); },
  });
}

export function useDeleteDealer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dealerId: string) => adminApi.deleteDealer(dealerId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'dealers'] }); },
  });
}

// ─── Notifications ───

/** @deprecated Prefer useNotificationInboxQuery — inbox lives in the bell only (no toast popups). */
export function useNotifications(enabled = true) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  return useQuery({
    queryKey: ['notifications'],
    queryFn: notificationsApi.list,
    enabled: enabled && isAuthenticated,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) => notificationsApi.markRead(notificationId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notifications'] }); },
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notifications'] }); },
  });
}
