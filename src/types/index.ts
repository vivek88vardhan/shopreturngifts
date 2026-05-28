export type ProductType = 'product' | 'package';

export interface ProductPackageItem {
  productId: string;
  qty: number;
}

export interface NutritionalFact {
  label: string;
  value: string;
  unit?: string;
}

export interface Product {
  productId: string;
  name: string;
  description: string;
  category: string;
  price: number; // in dollars (current / sale price)
  /** Optional list / MSRP; when greater than `price`, UI shows it struck through. */
  compareAtPrice?: number;
  currency: string;
  stock: number;
  images: string[];
  tags: string[];
  productType?: ProductType;
  packageItems?: ProductPackageItem[];
  purchasedFrom?: string;
  originalUnitPrice?: number;
  purchasePackQty?: number;
  purchasePackPrice?: number;
  isActive: boolean;
  isTaxable: boolean;
  notes?: string;
  details?: string;
  nutritionalFacts?: NutritionalFact[];
  benefits?: string;
  usage?: string;
  ingredients?: string;
  expiryDate?: string;
  priceHistory?: PriceHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  categoryId: string;
  name: string;
  description: string;
  imageUrl: string;
  sortOrder: number;
  isActive: boolean;
}

export interface CartItem {
  product: Product;
  quantity: number;
  /** Promotional free gift line (price forced to $0). */
  isFreebie?: boolean;
}

export interface FreebieOffer {
  active: boolean;
  minOrderAmount: number;
  label?: string;
  endsAt?: string;
  product?: Product;
}

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export type UserType = 'B2C' | 'B2B';

export interface User {
  userId: string;
  email: string;
  name: string;
  phone: string;
  address: Address;
  role: 'customer' | 'admin';
  userType: UserType;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** True when user can sign in with email/password (Cognito CONFIRMED + email_verified). */
  emailVerified?: boolean;
  /** Raw Cognito email_verified attribute (admin API only). */
  cognitoEmailVerified?: boolean;
  /** Cognito user status, e.g. CONFIRMED or UNCONFIRMED (admin API only). */
  cognitoStatus?: string;
  /** How the user signs in (admin API only, from Cognito). */
  authProvider?: 'password' | 'google';
}

export type OrderStatus = 'Pending' | 'Paid' | 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled' | 'Failed';

export type PaymentStatus =
  | 'pending'
  | 'authorized'
  | 'paid'
  | 'capture_failed'
  | 'cancelled'
  | 'disputed'
  | 'refunded'
  | 'partially_refunded';

export interface OrderItem {
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  isFreebie?: boolean;
}

export interface Order {
  orderId: string;
  orderNumber: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  status: OrderStatus;
  paymentStatus?: PaymentStatus;
  items: OrderItem[];
  shippingAddress: Address;
  subtotal: number;
  shippingFee?: number;
  tax: number;
  total: number;
  currency: string;
  stripePaymentIntentId?: string;
  stripeChargeId?: string;
  refundedAmountCents?: number;
  paidAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
  invoiceS3Key?: string;
  trackingNumber?: string;
  adminNotes?: string;
  assignee?: string;
  lastModifiedBy?: string;
  couponCode?: string;
  couponDiscountCents?: number;
  createdAt: string;
  updatedAt: string;
}

export type RefundStatus = 'Initiated' | 'Processing' | 'Completed' | 'Failed';

export interface Refund {
  refundId: string;
  orderId: string;
  orderNumber: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  amountCents: number;
  currency: string;
  reason: string;
  stripeRefundId?: string;
  status: RefundStatus;
  adminNotes?: string;
  initiatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderReconciliationRow {
  orderId: string;
  orderNumber: string;
  customerName?: string;
  customerEmail?: string;
  status: OrderStatus;
  paymentStatus?: PaymentStatus;
  createdAt: string;
  paidAt?: string;
  currency: string;
  orderSubtotalCents: number;
  orderShippingCents: number;
  orderTaxCents: number;
  orderTotalCents: number;
  orderRefundedCents: number;
  stripePaymentIntentId?: string;
  stripeChargeId?: string;
  stripeChargeStatus?: string;
  stripeAmountCents?: number;
  stripeCapturedCents?: number;
  stripeRefundedCents?: number;
  stripeFeeCents?: number;
  stripeNetCents?: number;
  stripeBalanceTransactionId?: string;
  stripeBalanceTransactionStatus?: string;
  stripeBalanceTransactionType?: string;
  stripeAvailableOn?: string;
  discrepancyCents: number;
  estimatedNetAfterRefundsCents: number;
  notes?: string;
}

export interface OrderReconciliationResponse {
  items: OrderReconciliationRow[];
  count: number;
  limit: number;
}

export interface StoreConfig {
  storeName: string;
  logoUrl: string;
  heroImageUrl?: string;
  heroTagline?: string;
  footerText?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  currency: string;
  taxRate: number;
  stripePublishableKey: string;
  enableRatings?: boolean;
  enableComments?: boolean;
  lowStockThreshold?: number;
  /** Comma-separated emails for low-stock alert digests (SES). */
  lowStockAlertEmails?: string;
  /** Verified SES From address for contact form and stock alerts; falls back to CONTACT_FROM_EMAIL env. */
  contactFromEmail?: string;
  /** Store inbox that receives contact form submissions; falls back to CONTACT_TO_EMAIL env. Not the visitor's email. */
  contactToEmail?: string;
  promoLabel?: string;
  promoHeadline?: string;
  promoSubtext?: string;
  promoBgImageUrl?: string;
  whatsappUrl?: string;
  instagramUrl?: string;
  facebookUrl?: string;
  googleAnalyticsId?: string;
  // Rewards program (points are earned on Delivered orders, become
  // available after `rewardEligibilityDays`, and redeemable at checkout)
  rewardsEnabled?: boolean;
  rewardSpendThresholdCents?: number; // e.g. 10000 = $100 spent earns N points
  rewardPointsPerThreshold?: number;  // points granted per threshold
  rewardPointValueCents?: number;     // $ value of one point at redemption
  rewardEligibilityDays?: number;     // delay before earned points become available
  // Delivery zone restrictions
  deliveryZipCodesEnabled?: boolean;
  deliveryZipCodes?: string[];
  // Stripe Automatic Tax
  // When true, Stripe computes tax automatically; when false, use custom backend tax
  // Default: true (Stripe Tax enabled)
  stripeAutoTaxEnabled?: boolean;
  /** Merchandise subtotal at or above this amount ships free (default $50). */
  freeShippingMinOrderAmount?: number;
  /** Flat shipping fee when below free-shipping threshold (default $4.99). */
  shippingFee?: number;
  /** Max units of the same product per order (default 10). */
  maxQtyPerProduct?: number;
  /** $50+ free gift promotion (admin). */
  freebieEnabled?: boolean;
  freebieMinOrderAmount?: number;
  freebieProductId?: string;
  freebieStartsAt?: string;
  freebieEndsAt?: string;
  freebieLabel?: string;
  freebieOffer?: FreebieOffer;
}

export interface PriceHistoryEntry {
  price: number;
  changedBy: string;
  changedAt: string;
}

export interface AuditLog {
  auditId: string;
  action: string;
  entityType: string;
  entityId: string;
  adminId: string;
  adminName: string;
  adminEmail: string;
  details: string;
  createdAt: string;
}

export interface CreateOrderResponse {
  orderId: string;
  orderNumber: string;
  clientSecret?: string;
  amountCents: number;
  currency: string;
  /** True when total is $0 and Stripe payment is not required. */
  noPaymentRequired?: boolean;
  // Breakdown computed by the backend (including real Stripe Tax amounts)
  subtotal?: number;
  discount?: number;
  shippingFee?: number;
  tax?: number;
  total?: number;
  /** Flat coupon value not applied on this order (forfeited). */
  couponUnusedAmount?: number;
}

export interface Coupon {
  couponId: string;
  code: string;
  description: string;
  /** "percent" (default) or "flat" */
  discountType?: 'percent' | 'flat';
  discountPercent: number;
  /** Fixed dollar off when discountType is "flat" */
  discountAmount?: number;
  isActive: boolean;
  oneTimePerUser?: boolean;
  allowedUserIds?: string[];
  /** RFC3339 UTC; coupon invalid at and after this instant. Omit or empty = no expiry. */
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductFeedbackCommentPublic {
  commentId: string;
  userName: string;
  body: string;
  createdAt: string;
}

export interface ProductFeedbackResponse {
  ratingsEnabled: boolean;
  commentsEnabled: boolean;
  averageRating: number;
  ratingCount: number;
  comments: ProductFeedbackCommentPublic[];
}

export interface DealerContact {
  name: string;
  email?: string;
  phone?: string;
  role?: string;
}

export interface DealerProductPrice {
  productId: string;
  price: number;
}

export interface Dealer {
  dealerId: string;
  name: string;
  companyName?: string;
  email?: string;
  phone?: string;
  address: Address;
  notes?: string;
  isActive: boolean;
  contacts?: DealerContact[];
  productPrices?: DealerProductPrice[];
  createdAt: string;
  updatedAt: string;
}

/** Per-user reward balances (matches GET /users/me/rewards). */
export interface RewardSummary {
  userId?: string;
  lifetimeSpendCents: number;
  lifetimePointsEarned: number;
  pendingPoints: number;
  availablePoints: number;
  redeemedPoints: number;
  reversedPoints: number;
  updatedAt?: string;
}

export interface RewardLedgerEntry {
  entryId: string;
  userId?: string;
  type: 'earn' | 'redeem' | 'reverse' | string;
  status: 'pending' | 'available' | 'redeemed' | 'reversed' | string;
  points: number;
  orderId?: string;
  orderTotalCents?: number;
  eligibleAt?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

/** Live program rules returned with /users/me/rewards. */
export interface RewardConfig {
  enabled: boolean;
  spendThresholdCents: number;
  pointsPerThreshold: number;
  pointValueCents: number;
  eligibilityDays: number;
}

export interface RewardSummaryResponse {
  summary: RewardSummary;
  config: RewardConfig;
  history: RewardLedgerEntry[];
}

/** One row on GET /admin/rewards. */
export interface AdminRewardListItem {
  userId: string;
  userName?: string;
  userEmail?: string;
  userRole?: 'admin' | 'customer' | string;
  /** True when reward data exists but the user profile was deleted or not found. */
  profileMissing?: boolean;
  summary: RewardSummary;
}

export interface AdminRewardListResponse {
  items: AdminRewardListItem[];
  config: RewardConfig;
}

export interface AppNotification {
  notificationId: string;
  userId: string;
  title: string;
  body: string;
  type: 'order' | 'system' | 'contact' | string;
  link?: string;
  readAt?: string;
  createdAt: string;
}

export interface NotificationListResponse {
  items: AppNotification[];
  unreadCount: number;
}
