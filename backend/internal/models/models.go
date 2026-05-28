package models

type ProductPackageItem struct {
	ProductID string `json:"productId" dynamodbav:"ProductID"`
	Qty       int    `json:"qty" dynamodbav:"Qty"`
}

// Product represents a product in the store.
type Product struct {
	ProductID   string  `json:"productId" dynamodbav:"PK"`
	Name        string  `json:"name" dynamodbav:"Name"`
	Description string  `json:"description" dynamodbav:"Description"`
	Category    string  `json:"category" dynamodbav:"Category"`
	Price       float64 `json:"price" dynamodbav:"Price"`
	// CompareAtPrice is optional list / MSRP shown struck through when greater than Price (sale).
	CompareAtPrice float64  `json:"compareAtPrice,omitempty" dynamodbav:"CompareAtPrice,omitempty"`
	Currency       string   `json:"currency" dynamodbav:"Currency"`
	Stock          int      `json:"stock" dynamodbav:"Stock"`
	Images         []string `json:"images" dynamodbav:"Images"`
	Tags           []string `json:"tags" dynamodbav:"Tags"`
	// ProductType can be "product" (single SKU) or "package" (group of products).
	ProductType string `json:"productType,omitempty" dynamodbav:"ProductType,omitempty"`
	// PackageItems is used only when ProductType is "package".
	PackageItems []ProductPackageItem `json:"packageItems,omitempty" dynamodbav:"PackageItems,omitempty"`
	// PurchasedFrom stores supplier/source details for P&L tracking.
	PurchasedFrom string `json:"purchasedFrom,omitempty" dynamodbav:"PurchasedFrom,omitempty"`
	// OriginalUnitPrice is your actual cost per single unit.
	OriginalUnitPrice float64 `json:"originalUnitPrice,omitempty" dynamodbav:"OriginalUnitPrice,omitempty"`
	// PurchasePackQty and PurchasePackPrice capture bulk procurement info (e.g. 12 pack at $6).
	PurchasePackQty   int                 `json:"purchasePackQty,omitempty" dynamodbav:"PurchasePackQty,omitempty"`
	PurchasePackPrice float64             `json:"purchasePackPrice,omitempty" dynamodbav:"PurchasePackPrice,omitempty"`
	IsActive          bool                `json:"isActive" dynamodbav:"IsActive"`
	IsTaxable         bool                `json:"isTaxable" dynamodbav:"IsTaxable"`
	Notes             string              `json:"notes,omitempty" dynamodbav:"Notes,omitempty"`
	Details           string              `json:"details,omitempty" dynamodbav:"Details,omitempty"`
	PriceHistory      []PriceHistoryEntry `json:"priceHistory,omitempty" dynamodbav:"PriceHistory,omitempty"`
	CreatedAt         string              `json:"createdAt" dynamodbav:"CreatedAt"`
	UpdatedAt         string              `json:"updatedAt" dynamodbav:"UpdatedAt"`
}

// ProductFeedbackRatingRow is an internal aggregate row (not exposed as API verbatim).
type ProductFeedbackRatingRow struct {
	UserID    string `json:"userId"`
	UserName  string `json:"userName,omitempty"`
	Stars     int    `json:"stars"`
	UpdatedAt string `json:"updatedAt,omitempty"`
}

// ProductFeedbackCommentRow is loaded from Dynamo for a product.
type ProductFeedbackCommentRow struct {
	CommentID string `json:"commentId"`
	UserID    string `json:"userId"`
	UserName  string `json:"userName,omitempty"`
	Body      string `json:"body"`
	CreatedAt string `json:"createdAt"`
}

// ProductFeedbackCommentPublic is returned on GET /products/{id}/feedback.
type ProductFeedbackCommentPublic struct {
	CommentID string `json:"commentId"`
	UserName  string `json:"userName"`
	Body      string `json:"body"`
	CreatedAt string `json:"createdAt"`
}

// ProductFeedbackResponse is the public read model for product ratings/comments.
type ProductFeedbackResponse struct {
	RatingsEnabled  bool                           `json:"ratingsEnabled"`
	CommentsEnabled bool                           `json:"commentsEnabled"`
	AverageRating   float64                        `json:"averageRating"`
	RatingCount     int                            `json:"ratingCount"`
	Comments        []ProductFeedbackCommentPublic `json:"comments"`
}

// Category represents a product category.
type Category struct {
	CategoryID  string `json:"categoryId" dynamodbav:"PK"`
	Name        string `json:"name" dynamodbav:"Name"`
	Description string `json:"description" dynamodbav:"Description"`
	ImageURL    string `json:"imageUrl" dynamodbav:"ImageUrl"`
	SortOrder   int    `json:"sortOrder" dynamodbav:"SortOrder"`
	IsActive    bool   `json:"isActive" dynamodbav:"IsActive"`
}

// Address represents a shipping/billing address.
type Address struct {
	Line1   string `json:"line1" dynamodbav:"Line1"`
	Line2   string `json:"line2,omitempty" dynamodbav:"Line2,omitempty"`
	City    string `json:"city" dynamodbav:"City"`
	State   string `json:"state" dynamodbav:"State"`
	Zip     string `json:"zip" dynamodbav:"Zip"`
	Country string `json:"country" dynamodbav:"Country"`
}

// User represents a user account.
type User struct {
	UserID    string  `json:"userId" dynamodbav:"PK"`
	Email     string  `json:"email" dynamodbav:"Email"`
	Name      string  `json:"name" dynamodbav:"Name"`
	Phone     string  `json:"phone" dynamodbav:"Phone"`
	Address   Address `json:"address" dynamodbav:"Address"`
	Role      string  `json:"role" dynamodbav:"Role"`
	UserType  string  `json:"userType" dynamodbav:"UserType"` // B2C or B2B
	IsActive  bool    `json:"isActive" dynamodbav:"IsActive"`
	CreatedAt string  `json:"createdAt" dynamodbav:"CreatedAt"`
	UpdatedAt string  `json:"updatedAt" dynamodbav:"UpdatedAt"`
	// Cognito-only (not stored in DynamoDB); set on admin reads.
	// EmailVerified: true when user can sign in with password (CONFIRMED + email_verified in Cognito).
	EmailVerified *bool `json:"emailVerified,omitempty" dynamodbav:"-"`
	// CognitoEmailVerified: raw email_verified attribute (may be false while status is CONFIRMED).
	CognitoEmailVerified *bool  `json:"cognitoEmailVerified,omitempty" dynamodbav:"-"`
	CognitoStatus        string `json:"cognitoStatus,omitempty" dynamodbav:"-"`
	// AuthProvider is how the user signs in: "password" or "google" (admin reads from Cognito).
	AuthProvider string `json:"authProvider,omitempty" dynamodbav:"-"`
}

// OrderItem represents an item within an order.
type OrderItem struct {
	ProductID string  `json:"productId" dynamodbav:"ProductId"`
	Name      string  `json:"name" dynamodbav:"Name"`
	Qty       int     `json:"qty" dynamodbav:"Qty"`
	UnitPrice float64 `json:"unitPrice" dynamodbav:"UnitPrice"`
	LineTotal float64 `json:"lineTotal" dynamodbav:"LineTotal"`
	IsFreebie bool    `json:"isFreebie,omitempty" dynamodbav:"IsFreebie,omitempty"`
}

// Order represents a customer order.
type Order struct {
	OrderID               string      `json:"orderId" dynamodbav:"PK"`
	OrderNumber           string      `json:"orderNumber" dynamodbav:"OrderNumber"`
	UserID                string      `json:"userId" dynamodbav:"UserId"`
	UserName              string      `json:"userName,omitempty" dynamodbav:"UserName,omitempty"`
	UserEmail             string      `json:"userEmail,omitempty" dynamodbav:"UserEmail,omitempty"`
	Status                string      `json:"status" dynamodbav:"Status"`
	PaymentStatus         string      `json:"paymentStatus,omitempty" dynamodbav:"PaymentStatus,omitempty"`
	Items                 []OrderItem `json:"items" dynamodbav:"Items"`
	ShippingAddress       Address     `json:"shippingAddress" dynamodbav:"ShippingAddress"`
	Subtotal              float64     `json:"subtotal" dynamodbav:"Subtotal"`
	ShippingFee           float64     `json:"shippingFee,omitempty" dynamodbav:"ShippingFee,omitempty"`
	Tax                   float64     `json:"tax" dynamodbav:"Tax"`
	Total                 float64     `json:"total" dynamodbav:"Total"`
	Currency              string      `json:"currency" dynamodbav:"Currency"`
	StripePaymentIntentID string      `json:"stripePaymentIntentId,omitempty" dynamodbav:"StripePaymentIntentId,omitempty"`
	StripeChargeID        string      `json:"stripeChargeId,omitempty" dynamodbav:"StripeChargeId,omitempty"`
	RefundedAmountCents   int64       `json:"refundedAmountCents,omitempty" dynamodbav:"RefundedAmountCents,omitempty"`
	PaidAt                string      `json:"paidAt,omitempty" dynamodbav:"PaidAt,omitempty"`
	DeliveredAt           string      `json:"deliveredAt,omitempty" dynamodbav:"DeliveredAt,omitempty"`
	CancelledAt           string      `json:"cancelledAt,omitempty" dynamodbav:"CancelledAt,omitempty"`
	CancelReason          string      `json:"cancelReason,omitempty" dynamodbav:"CancelReason,omitempty"`
	InvoiceS3Key          string      `json:"invoiceS3Key,omitempty" dynamodbav:"InvoiceS3Key,omitempty"`
	TrackingNumber        string      `json:"trackingNumber,omitempty" dynamodbav:"TrackingNumber,omitempty"`
	AdminNotes            string      `json:"adminNotes,omitempty" dynamodbav:"AdminNotes,omitempty"`
	Assignee              string      `json:"assignee,omitempty" dynamodbav:"Assignee,omitempty"`
	LastModifiedBy        string      `json:"lastModifiedBy,omitempty" dynamodbav:"LastModifiedBy,omitempty"`
	// Coupon applied at checkout (for invoices and order history).
	CouponCode          string `json:"couponCode,omitempty" dynamodbav:"CouponCode,omitempty"`
	CouponDiscountCents int64  `json:"couponDiscountCents,omitempty" dynamodbav:"CouponDiscountCents,omitempty"`
	// Rewards integration
	RewardPointsRedeemed int64  `json:"rewardPointsRedeemed,omitempty" dynamodbav:"RewardPointsRedeemed,omitempty"`
	RewardDiscountCents  int64  `json:"rewardDiscountCents,omitempty" dynamodbav:"RewardDiscountCents,omitempty"`
	RewardPointsEarned   int64  `json:"rewardPointsEarned,omitempty" dynamodbav:"RewardPointsEarned,omitempty"`
	RewardEarnEntryID    string `json:"rewardEarnEntryId,omitempty" dynamodbav:"RewardEarnEntryId,omitempty"`
	RewardRedeemEntryID  string `json:"rewardRedeemEntryId,omitempty" dynamodbav:"RewardRedeemEntryId,omitempty"`
	// InventoryDebitedAt is set once line-item quantities have been subtracted from product stock after payment succeeds.
	InventoryDebitedAt string `json:"inventoryDebitedAt,omitempty" dynamodbav:"InventoryDebitedAt,omitempty"`
	CreatedAt          string `json:"createdAt" dynamodbav:"CreatedAt"`
	UpdatedAt          string `json:"updatedAt" dynamodbav:"UpdatedAt"`
}

// Refund represents an admin-initiated refund record (one per refund operation).
type Refund struct {
	RefundID       string `json:"refundId" dynamodbav:"PK"`
	OrderID        string `json:"orderId" dynamodbav:"OrderId"`
	OrderNumber    string `json:"orderNumber" dynamodbav:"OrderNumber"`
	UserID         string `json:"userId,omitempty" dynamodbav:"UserId,omitempty"`
	UserEmail      string `json:"userEmail,omitempty" dynamodbav:"UserEmail,omitempty"`
	UserName       string `json:"userName,omitempty" dynamodbav:"UserName,omitempty"`
	AmountCents    int64  `json:"amountCents" dynamodbav:"AmountCents"`
	Currency       string `json:"currency" dynamodbav:"Currency"`
	Reason         string `json:"reason" dynamodbav:"Reason"`
	StripeRefundID string `json:"stripeRefundId,omitempty" dynamodbav:"StripeRefundId,omitempty"`
	// Status: Initiated | Processing | Completed | Failed
	Status      string `json:"status" dynamodbav:"Status"`
	AdminNotes  string `json:"adminNotes,omitempty" dynamodbav:"AdminNotes,omitempty"`
	Comments    string `json:"comments,omitempty" dynamodbav:"Comments,omitempty"`
	InitiatedBy string `json:"initiatedBy,omitempty" dynamodbav:"InitiatedBy,omitempty"`
	CreatedAt   string `json:"createdAt" dynamodbav:"CreatedAt"`
	UpdatedAt   string `json:"updatedAt" dynamodbav:"UpdatedAt"`
}

// StoreConfig represents store-wide configuration.
type StoreConfig struct {
	StoreName            string  `json:"storeName" dynamodbav:"StoreName"`
	LogoURL              string  `json:"logoUrl" dynamodbav:"LogoUrl"`
	HeroImageURL         string  `json:"heroImageUrl,omitempty" dynamodbav:"HeroImageUrl,omitempty"`
	HeroTagline          string  `json:"heroTagline,omitempty" dynamodbav:"HeroTagline,omitempty"`
	FooterText           string  `json:"footerText,omitempty" dynamodbav:"FooterText,omitempty"`
	PrimaryColor         string  `json:"primaryColor" dynamodbav:"PrimaryColor"`
	SecondaryColor       string  `json:"secondaryColor" dynamodbav:"SecondaryColor"`
	AccentColor          string  `json:"accentColor" dynamodbav:"AccentColor"`
	Currency             string  `json:"currency" dynamodbav:"Currency"`
	TaxRate              float64 `json:"taxRate" dynamodbav:"TaxRate"`
	StripePublishableKey string  `json:"stripePublishableKey" dynamodbav:"StripePublishableKey"`
	EnableRatings        bool    `json:"enableRatings" dynamodbav:"EnableRatings"`
	EnableComments       bool    `json:"enableComments" dynamodbav:"EnableComments"`
	LowStockThreshold    int     `json:"lowStockThreshold" dynamodbav:"LowStockThreshold"`
	// LowStockAlertEmails is a comma-separated list of addresses for low-stock notifications (SES).
	LowStockAlertEmails string `json:"lowStockAlertEmails,omitempty" dynamodbav:"LowStockAlertEmails,omitempty"`
	// ContactFromEmail is the SES-verified From address for outbound mail (contact form, stock alerts).
	// When empty, CONTACT_FROM_EMAIL in the deployment environment is used.
	ContactFromEmail string `json:"contactFromEmail,omitempty" dynamodbav:"ContactFromEmail,omitempty"`
	// ContactToEmail is the store inbox that receives public contact form submissions (not the visitor's address).
	// When empty, CONTACT_TO_EMAIL in the deployment environment is used.
	ContactToEmail  string `json:"contactToEmail,omitempty" dynamodbav:"ContactToEmail,omitempty"`
	PromoLabel      string `json:"promoLabel,omitempty" dynamodbav:"PromoLabel,omitempty"`
	PromoHeadline   string `json:"promoHeadline,omitempty" dynamodbav:"PromoHeadline,omitempty"`
	PromoSubtext    string `json:"promoSubtext,omitempty" dynamodbav:"PromoSubtext,omitempty"`
	PromoBgImageURL string `json:"promoBgImageUrl,omitempty" dynamodbav:"PromoBgImageUrl,omitempty"`
	WhatsappURL     string `json:"whatsappUrl,omitempty" dynamodbav:"WhatsappUrl,omitempty"`
	InstagramURL    string `json:"instagramUrl,omitempty" dynamodbav:"InstagramUrl,omitempty"`
	FacebookURL     string `json:"facebookUrl,omitempty" dynamodbav:"FacebookUrl,omitempty"`

	// ─── Analytics ───
	GoogleAnalyticsID string `json:"googleAnalyticsId,omitempty" dynamodbav:"GoogleAnalyticsId,omitempty"`

	// ─── Rewards Program ───
	// When enabled, customers earn RewardPointsPerThreshold points for every
	// RewardSpendThresholdCents spent (subtotal after coupon discount, in
	// cents). Each earned point is worth RewardPointValueCents at redemption.
	// Earnings are credited as 'pending' on order Delivered, and become
	// 'available' after RewardEligibilityDays from the delivered timestamp
	// (default 15, matching the refund window) so refunds can claw back cleanly.
	RewardsEnabled            bool  `json:"rewardsEnabled,omitempty" dynamodbav:"RewardsEnabled,omitempty"`
	RewardSpendThresholdCents int64 `json:"rewardSpendThresholdCents,omitempty" dynamodbav:"RewardSpendThresholdCents,omitempty"`
	RewardPointsPerThreshold  int64 `json:"rewardPointsPerThreshold,omitempty" dynamodbav:"RewardPointsPerThreshold,omitempty"`
	RewardPointValueCents     int64 `json:"rewardPointValueCents,omitempty" dynamodbav:"RewardPointValueCents,omitempty"`
	RewardEligibilityDays     int   `json:"rewardEligibilityDays,omitempty" dynamodbav:"RewardEligibilityDays,omitempty"`

	// ─── Stripe Tax ───
	// When true, Stripe Automatic Tax is enabled and used for order calculations.
	// When false, custom backend tax calculation is used.
	// Default: true (Stripe Tax enabled)
	// Note: omitempty is intentionally NOT used; false values must be explicitly stored.
	StripeAutoTaxEnabled bool `json:"stripeAutoTaxEnabled" dynamodbav:"StripeAutoTaxEnabled"`

	// FreeShippingMinOrderAmount: merchandise subtotal (after coupon) at or above this gets $0 shipping.
	// Zero in storage means use default ($50).
	FreeShippingMinOrderAmount float64 `json:"freeShippingMinOrderAmount,omitempty" dynamodbav:"FreeShippingMinOrderAmount,omitempty"`
	// ShippingFee: flat fee when below FreeShippingMinOrderAmount. Zero in storage means use default ($4.99).
	ShippingFee float64 `json:"shippingFee,omitempty" dynamodbav:"ShippingFee,omitempty"`

	// MaxQtyPerProduct caps how many units of one SKU a customer may buy per order. Zero means default (10).
	MaxQtyPerProduct int `json:"maxQtyPerProduct,omitempty" dynamodbav:"MaxQtyPerProduct,omitempty"`

	// Freebie promotion: one free gift SKU when paid merchandise subtotal meets the threshold.
	FreebieEnabled        bool    `json:"freebieEnabled,omitempty" dynamodbav:"FreebieEnabled,omitempty"`
	FreebieMinOrderAmount float64 `json:"freebieMinOrderAmount,omitempty" dynamodbav:"FreebieMinOrderAmount,omitempty"`
	FreebieProductID      string  `json:"freebieProductId,omitempty" dynamodbav:"FreebieProductId,omitempty"`
	FreebieStartsAt       string  `json:"freebieStartsAt,omitempty" dynamodbav:"FreebieStartsAt,omitempty"`
	FreebieEndsAt         string  `json:"freebieEndsAt,omitempty" dynamodbav:"FreebieEndsAt,omitempty"`
	FreebieLabel          string  `json:"freebieLabel,omitempty" dynamodbav:"FreebieLabel,omitempty"`
	// Populated on GET /config/theme only (not persisted).
	FreebieOffer *FreebieOffer `json:"freebieOffer,omitempty" dynamodbav:"-"`

	// ─── Delivery Zone Restrictions ───
	// When DeliveryZipCodesEnabled is true, orders whose shipping ZIP is not in
	// DeliveryZipCodes are blocked at checkout.
	DeliveryZipCodesEnabled bool     `json:"deliveryZipCodesEnabled" dynamodbav:"DeliveryZipCodesEnabled"`
	DeliveryZipCodes        []string `json:"deliveryZipCodes" dynamodbav:"DeliveryZipCodes"`
}

// FreebieOffer is returned on public theme config when a promotion is configured.
type FreebieOffer struct {
	Active         bool     `json:"active"`
	MinOrderAmount float64  `json:"minOrderAmount"`
	Label          string   `json:"label,omitempty"`
	EndsAt         string   `json:"endsAt,omitempty"`
	Product        *Product `json:"product,omitempty"`
}

// AuditLog records an admin action for accountability.
type AuditLog struct {
	AuditID    string `json:"auditId" dynamodbav:"PK"`
	Action     string `json:"action" dynamodbav:"Action"`         // e.g. "create_product", "update_order_status"
	EntityType string `json:"entityType" dynamodbav:"EntityType"` // e.g. "product", "category", "order", "config"
	EntityID   string `json:"entityId" dynamodbav:"EntityId"`
	AdminID    string `json:"adminId" dynamodbav:"AdminId"`
	AdminName  string `json:"adminName" dynamodbav:"AdminName"`
	AdminEmail string `json:"adminEmail" dynamodbav:"AdminEmail"`
	Details    string `json:"details" dynamodbav:"Details"` // human-readable summary of what changed
	CreatedAt  string `json:"createdAt" dynamodbav:"CreatedAt"`
}

// PriceHistoryEntry records a product price change.
type PriceHistoryEntry struct {
	Price     float64 `json:"price" dynamodbav:"Price"`
	ChangedBy string  `json:"changedBy" dynamodbav:"ChangedBy"`
	ChangedAt string  `json:"changedAt" dynamodbav:"ChangedAt"`
}

// Paginated is a generic paginated response.
type Paginated[T any] struct {
	Items      []T    `json:"items"`
	NextCursor string `json:"nextCursor"`
	Count      int    `json:"count"`
}

// AuthResponse is returned on login/signup.
type AuthResponse struct {
	User  *User  `json:"user"`
	Token string `json:"token"`
}

// CreateOrderRequest is the request body for creating an order.
type CreateOrderRequest struct {
	Items           []CreateOrderItem `json:"items"`
	ShippingAddress Address           `json:"shippingAddress"`
	CouponCode      string            `json:"couponCode,omitempty"`
	RedeemPoints    int64             `json:"redeemPoints,omitempty"`
}

type CreateOrderItem struct {
	ProductID string `json:"productId"`
	Qty       int    `json:"qty"`
}

type CreateOrderResponse struct {
	OrderID      string `json:"orderId"`
	OrderNumber  string `json:"orderNumber"`
	ClientSecret string `json:"clientSecret,omitempty"`
	AmountCents  int64  `json:"amountCents"`
	Currency     string `json:"currency"`
	// NoPaymentRequired is true when the order total is $0 (e.g. 100% coupon); Stripe is skipped.
	NoPaymentRequired bool `json:"noPaymentRequired,omitempty"`
	// Breakdown returned so the frontend can display actual computed amounts
	Subtotal    float64 `json:"subtotal"`
	Discount    float64 `json:"discount"`
	ShippingFee float64 `json:"shippingFee"`
	Tax         float64 `json:"tax"`
	Total       float64 `json:"total"`
	// CouponUnusedAmount is the flat-coupon face value not applied on this order (forfeited).
	CouponUnusedAmount float64 `json:"couponUnusedAmount,omitempty"`
}

type ConfirmPaymentRequest struct {
	PaymentIntentID string `json:"paymentIntentId"`
}

type ConfirmPaymentResponse struct {
	OrderID string `json:"orderId"`
	Status  string `json:"status"`
	Message string `json:"message"`
}

type AdminRefundRequest struct {
	RefundType  string `json:"refund_type"` // "full" or "partial"
	AmountCents int64  `json:"amount_cents"`
	Reason      string `json:"reason"`
	Comments    string `json:"comments,omitempty"`
}

type AdminRefundResponse struct {
	RefundedAmountCents int64  `json:"refunded_amount_cents"`
	RefundID            string `json:"refund_id"`
	PaymentStatus       string `json:"payment_status"`
}

// LoginRequest is the request body for login.
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// SignupRequest is the request body for signup.
type SignupRequest struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

// ConfirmSignupRequest is the request body for confirming email verification.
type ConfirmSignupRequest struct {
	Email string `json:"email"`
	Code  string `json:"code"`
}

// ResendCodeRequest is the request body for resending verification code.
type ResendCodeRequest struct {
	Email string `json:"email"`
}

// ForgotPasswordRequest initiates a password reset via Cognito.
type ForgotPasswordRequest struct {
	Email string `json:"email"`
}

// ForgotPasswordResponse describes the outcome of a password-reset request.
type ForgotPasswordResponse struct {
	Message      string `json:"message"`
	Hint         string `json:"hint,omitempty"`         // verify_email_first, rate_limited, check_inbox, delivery_failed, social_sign_in
	Delivered    bool   `json:"delivered"`              // true when Cognito accepted the reset request
	AccountState string `json:"accountState,omitempty"` // verified, needs_verification, unknown
}

// ConfirmForgotPasswordRequest completes the password reset with the code
// Cognito emailed to the user.
type ConfirmForgotPasswordRequest struct {
	Email       string `json:"email"`
	Code        string `json:"code"`
	NewPassword string `json:"newPassword"`
}

// ChangePasswordRequest is used by logged-in users to set a new password.
type ChangePasswordRequest struct {
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
}

// SignupResponse extends AuthResponse with verification status.
type SignupResponse struct {
	User              *User  `json:"user,omitempty"`
	Token             string `json:"token,omitempty"`
	NeedsVerification bool   `json:"needsVerification"`
	Message           string `json:"message,omitempty"`
}

// CreateUserRequest is the admin request to create a B2B user manually.
type CreateUserRequest struct {
	Name     string  `json:"name"`
	Email    string  `json:"email"`
	Password string  `json:"password"`
	Phone    string  `json:"phone,omitempty"`
	UserType string  `json:"userType"`       // B2B or B2C
	Role     string  `json:"role,omitempty"` // admin or customer; default customer
	Address  Address `json:"address,omitempty"`
	IsActive *bool   `json:"isActive,omitempty"`
}

// Coupon represents a discount coupon.
type Coupon struct {
	CouponID    string `json:"couponId" dynamodbav:"PK"`
	Code        string `json:"code" dynamodbav:"Code"`
	Description string `json:"description" dynamodbav:"Description"`
	// DiscountType is "percent" (default) or "flat".
	DiscountType    string  `json:"discountType,omitempty" dynamodbav:"DiscountType,omitempty"`
	DiscountPercent float64 `json:"discountPercent" dynamodbav:"DiscountPercent"`
	// DiscountAmount is a fixed dollar discount when DiscountType is "flat".
	DiscountAmount float64  `json:"discountAmount,omitempty" dynamodbav:"DiscountAmount,omitempty"`
	IsActive       bool     `json:"isActive" dynamodbav:"IsActive"`
	OneTimePerUser bool     `json:"oneTimePerUser" dynamodbav:"OneTimePerUser"`
	AllowedUserIDs []string `json:"allowedUserIds,omitempty" dynamodbav:"AllowedUserIds,omitempty"`
	// ExpiresAt is optional RFC3339 UTC; after this instant the code is not valid. Empty means no expiry.
	ExpiresAt string `json:"expiresAt,omitempty" dynamodbav:"ExpiresAt,omitempty"`
	CreatedAt string `json:"createdAt" dynamodbav:"CreatedAt"`
	UpdatedAt string `json:"updatedAt" dynamodbav:"UpdatedAt"`
}

// CouponRedemption tracks per-user coupon usage.
type CouponRedemption struct {
	PK         string `json:"-" dynamodbav:"PK"` // COUPONREDEMPTION#<userId>
	SK         string `json:"-" dynamodbav:"SK"` // <couponId>
	UserID     string `json:"userId" dynamodbav:"UserId"`
	CouponID   string `json:"couponId" dynamodbav:"CouponId"`
	CouponCode string `json:"couponCode" dynamodbav:"CouponCode"`
	OrderID    string `json:"orderId" dynamodbav:"OrderId"`
	RedeemedAt string `json:"redeemedAt" dynamodbav:"RedeemedAt"`
}

// DealerContact is one contact person at a dealer.
type DealerContact struct {
	Name  string `json:"name" dynamodbav:"Name"`
	Email string `json:"email,omitempty" dynamodbav:"Email,omitempty"`
	Phone string `json:"phone,omitempty" dynamodbav:"Phone,omitempty"`
	Role  string `json:"role,omitempty" dynamodbav:"Role,omitempty"`
}

// DealerProductPrice is a per-product custom price for a dealer.
type DealerProductPrice struct {
	ProductID string  `json:"productId" dynamodbav:"ProductId"`
	Price     float64 `json:"price" dynamodbav:"Price"`
}

// Dealer represents a B2B dealer/distributor with contacts and pricing.
type Dealer struct {
	DealerID      string               `json:"dealerId" dynamodbav:"PK"`
	Name          string               `json:"name" dynamodbav:"Name"`
	CompanyName   string               `json:"companyName,omitempty" dynamodbav:"CompanyName,omitempty"`
	Email         string               `json:"email,omitempty" dynamodbav:"Email,omitempty"`
	Phone         string               `json:"phone,omitempty" dynamodbav:"Phone,omitempty"`
	Address       Address              `json:"address" dynamodbav:"Address"`
	Notes         string               `json:"notes,omitempty" dynamodbav:"Notes,omitempty"`
	IsActive      bool                 `json:"isActive" dynamodbav:"IsActive"`
	Contacts      []DealerContact      `json:"contacts,omitempty" dynamodbav:"Contacts,omitempty"`
	ProductPrices []DealerProductPrice `json:"productPrices,omitempty" dynamodbav:"ProductPrices,omitempty"`
	CreatedAt     string               `json:"createdAt" dynamodbav:"CreatedAt"`
	UpdatedAt     string               `json:"updatedAt" dynamodbav:"UpdatedAt"`
}

// ─── Rewards ───

// RewardLedgerEntry is a single immutable event in a user's rewards ledger.
// Type is one of: "earn" | "redeem" | "reverse".
// Status is one of: "pending" | "available" | "redeemed" | "reversed".
//   - earn entries start "pending" on Delivered, become "available" after EligibleAt.
//   - redeem entries are written as "redeemed" when an order is paid.
//   - reverse entries cancel a prior earn (status="reversed") when the order
//     is refunded/cancelled within the refund window.
type RewardLedgerEntry struct {
	// Stored as Dynamo attribute EntryId (table PK is REWARDLEDGER#<userId>, SK is <createdAt>#<entryId>).
	EntryID    string `json:"entryId" dynamodbav:"EntryId,omitempty"`
	UserID     string `json:"userId" dynamodbav:"UserId"`
	Type       string `json:"type" dynamodbav:"Type"`
	Status     string `json:"status" dynamodbav:"Status"`
	Points     int64  `json:"points" dynamodbav:"Points"` // positive integer; sign implied by Type
	OrderID    string `json:"orderId,omitempty" dynamodbav:"OrderId,omitempty"`
	OrderTotal int64  `json:"orderTotalCents,omitempty" dynamodbav:"OrderTotalCents,omitempty"`
	EligibleAt string `json:"eligibleAt,omitempty" dynamodbav:"EligibleAt,omitempty"`
	Note       string `json:"note,omitempty" dynamodbav:"Note,omitempty"`
	CreatedAt  string `json:"createdAt" dynamodbav:"CreatedAt"`
	UpdatedAt  string `json:"updatedAt" dynamodbav:"UpdatedAt"`
}

// RewardSummary is a denormalised per-user aggregate for fast reads.
type RewardSummary struct {
	UserID               string `json:"userId" dynamodbav:"PK"` // REWARDSUMMARY#<userId>
	LifetimeSpendCents   int64  `json:"lifetimeSpendCents" dynamodbav:"LifetimeSpendCents"`
	LifetimePointsEarned int64  `json:"lifetimePointsEarned" dynamodbav:"LifetimePointsEarned"`
	PendingPoints        int64  `json:"pendingPoints" dynamodbav:"PendingPoints"`
	AvailablePoints      int64  `json:"availablePoints" dynamodbav:"AvailablePoints"`
	RedeemedPoints       int64  `json:"redeemedPoints" dynamodbav:"RedeemedPoints"`
	ReversedPoints       int64  `json:"reversedPoints" dynamodbav:"ReversedPoints"`
	UpdatedAt            string `json:"updatedAt" dynamodbav:"UpdatedAt"`
}

// RewardSummaryResponse is what the API returns to logged-in users.
// It includes the live store config so the UI can render progress bars
// without making a second call to /api/config/theme.
type RewardSummaryResponse struct {
	Summary RewardSummary       `json:"summary"`
	Config  RewardConfig        `json:"config"`
	History []RewardLedgerEntry `json:"history,omitempty"`
}

// AdminRewardListItem is one user row on the admin rewards overview.
type AdminRewardListItem struct {
	UserID         string        `json:"userId"`
	UserName       string        `json:"userName,omitempty"`
	UserEmail      string        `json:"userEmail,omitempty"`
	UserRole       string        `json:"userRole,omitempty"` // admin or customer
	ProfileMissing bool          `json:"profileMissing,omitempty"`
	Summary        RewardSummary `json:"summary"`
}

// AdminRewardListResponse is returned by GET /admin/rewards (all users, zeros when unused).
type AdminRewardListResponse struct {
	Items  []AdminRewardListItem `json:"items"`
	Config RewardConfig          `json:"config"`
}

// RewardConfig is a slim view of StoreConfig fields relevant to redemption,
// safe to expose to logged-in customers.
type RewardConfig struct {
	Enabled             bool  `json:"enabled"`
	SpendThresholdCents int64 `json:"spendThresholdCents"`
	PointsPerThreshold  int64 `json:"pointsPerThreshold"`
	PointValueCents     int64 `json:"pointValueCents"`
	EligibilityDays     int   `json:"eligibilityDays"`
}

// Notification is an in-app alert scoped to a single user profile.
type Notification struct {
	NotificationID string `json:"notificationId" dynamodbav:"NotificationID"`
	UserID         string `json:"userId" dynamodbav:"UserID"`
	Title          string `json:"title" dynamodbav:"Title"`
	Body           string `json:"body" dynamodbav:"Body"`
	Type           string `json:"type" dynamodbav:"Type"` // order, system, contact
	Link           string `json:"link,omitempty" dynamodbav:"Link,omitempty"`
	ReadAt         string `json:"readAt,omitempty" dynamodbav:"ReadAt,omitempty"`
	CreatedAt      string `json:"createdAt" dynamodbav:"CreatedAt"`
}

// NotificationListResponse is returned by GET /notifications.
type NotificationListResponse struct {
	Items       []Notification `json:"items"`
	UnreadCount int            `json:"unreadCount"`
}
