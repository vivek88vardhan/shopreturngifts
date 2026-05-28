package handlers

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	stripe "github.com/stripe/stripe-go/v82"
	balancetransaction "github.com/stripe/stripe-go/v82/balancetransaction"
	chargeapi "github.com/stripe/stripe-go/v82/charge"
	"github.com/stripe/stripe-go/v82/paymentintent"
	"github.com/stripe/stripe-go/v82/refund"
	taxcalculation "github.com/stripe/stripe-go/v82/tax/calculation"

	coupondiscount "shopreturngifts-api/internal/coupons"
	"shopreturngifts-api/internal/email"
	"shopreturngifts-api/internal/freebie"
	"shopreturngifts-api/internal/middleware"
	"shopreturngifts-api/internal/models"
	"shopreturngifts-api/internal/orderlimits"
	shippingcalc "shopreturngifts-api/internal/shipping"
	"shopreturngifts-api/internal/store"
	stripeutil "shopreturngifts-api/internal/stripe"
)

// Handlers holds all HTTP handlers.
type Handlers struct {
	db    *store.DynamoDB
	email *email.Publisher
}

// New creates a new Handlers instance.
func New(db *store.DynamoDB) *Handlers {
	return &Handlers{
		db:    db,
		email: email.NewPublisherFromEnv(context.Background()),
	}
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if v != nil {
		json.NewEncoder(w).Encode(v)
	}
}

func writeError(w http.ResponseWriter, status int, msg string) {
	http.Error(w, msg, status)
}

// writeAuthJSONError returns a machine-readable auth error for the frontend.
func writeAuthJSONError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]string{
		"error":   code,
		"message": message,
	})
}

func now() string {
	return time.Now().UTC().Format(time.RFC3339)
}

func invoiceDisplayLocation() *time.Location {
	name := strings.TrimSpace(os.Getenv("INVOICE_DISPLAY_TIMEZONE"))
	if name == "" {
		name = "America/Phoenix"
	}
	loc, err := time.LoadLocation(name)
	if err != nil {
		return time.FixedZone("MST", -7*3600)
	}
	return loc
}

// formatPaidAtForInvoice renders a stored RFC3339 instant in the store's display timezone for PDFs.
func formatPaidAtForInvoice(paidAt string) string {
	paidAt = strings.TrimSpace(paidAt)
	if paidAt == "" {
		return ""
	}
	t, err := time.Parse(time.RFC3339Nano, paidAt)
	if err != nil {
		t, err = time.Parse(time.RFC3339, paidAt)
	}
	if err != nil {
		return paidAt
	}
	loc := invoiceDisplayLocation()
	return t.In(loc).Format("Jan 02, 2006 3:04:05 PM MST")
}

func stripeCurrency(config *models.StoreConfig) string {
	if config == nil || strings.TrimSpace(config.Currency) == "" {
		return "usd"
	}
	return strings.ToLower(strings.TrimSpace(config.Currency))
}

func statementDescriptorSuffix(config *models.StoreConfig) string {
	descriptor := strings.TrimSpace(os.Getenv("STRIPE_STATEMENT_DESCRIPTOR_SUFFIX"))
	if descriptor == "" {
		descriptor = strings.TrimSpace(os.Getenv("STRIPE_STATEMENT_DESCRIPTOR"))
	}
	if descriptor == "" && config != nil {
		descriptor = strings.TrimSpace(config.StoreName)
	}
	if descriptor == "" {
		descriptor = "SHOPRETURNGIFTS"
	}
	descriptor = strings.ToUpper(strings.ReplaceAll(descriptor, "_", " "))
	if len(descriptor) > 22 {
		descriptor = descriptor[:22]
	}
	return descriptor
}

func stripeIdempotencyKey(orderID string) string {
	prefix := strings.TrimSpace(os.Getenv("STRIPE_IDEMPOTENCY_KEY_PREFIX"))
	if prefix == "" {
		prefix = "shopreturngifts"
	}
	return fmt.Sprintf("%s-order-%s", prefix, orderID)
}

func invoiceStorageMode() string {
	mode := strings.ToLower(strings.TrimSpace(os.Getenv("INVOICE_STORAGE")))
	switch mode {
	case "local", "s3":
		return mode
	}

	if strings.TrimSpace(os.Getenv("AWS_LAMBDA_RUNTIME_API")) != "" {
		return "s3"
	}

	return "local"
}

func useLocalInvoiceStorage() bool {
	return invoiceStorageMode() == "local"
}

func invoiceS3Key(orderID string) string {
	return fmt.Sprintf("invoices/%s.pdf", strings.TrimSpace(orderID))
}

func localInvoiceDir() string {
	dir := strings.TrimSpace(os.Getenv("LOCAL_INVOICE_DIR"))
	if dir == "" {
		dir = "./invoices"
	}
	return dir
}

func localInvoicePath(orderID string) string {
	return filepath.Join(localInvoiceDir(), fmt.Sprintf("%s.pdf", strings.TrimSpace(orderID)))
}

func localInvoiceMarker(path string) string {
	return "LOCAL-INVOICE:" + path
}

func parseLocalInvoiceMarker(value string) (string, bool) {
	const prefix = "LOCAL-INVOICE:"
	if !strings.HasPrefix(value, prefix) {
		return "", false
	}
	path := strings.TrimSpace(strings.TrimPrefix(value, prefix))
	if path == "" {
		return "", false
	}
	return path, true
}

func formatMoney(currency string, amount float64) string {
	code := strings.ToUpper(strings.TrimSpace(currency))
	if code == "" {
		code = "USD"
	}
	if code == "USD" {
		return fmt.Sprintf("$%.2f", amount)
	}
	return fmt.Sprintf("%s %.2f", code, amount)
}

func buildInlinePDFURL(pdfContent []byte) string {
	encoded := base64.StdEncoding.EncodeToString(pdfContent)
	return "data:application/pdf;base64," + encoded
}

// orderCouponForInvoice returns coupon code and total discount for invoice totals.
// New orders store these on the order; older orders fall back to redemption lookup.
func (h *Handlers) orderCouponForInvoice(ctx context.Context, order *models.Order) (code string, discount float64) {
	if order == nil {
		return "", 0
	}
	code = strings.TrimSpace(order.CouponCode)
	if order.CouponDiscountCents > 0 {
		discount = float64(order.CouponDiscountCents) / 100
	}
	if code != "" && discount > 0 {
		return code, discount
	}
	if strings.TrimSpace(order.UserID) != "" && strings.TrimSpace(order.OrderID) != "" {
		reds, err := h.db.GetUserCouponRedemptions(ctx, order.UserID)
		if err == nil {
			for _, r := range reds {
				if r.OrderID == order.OrderID {
					if code == "" {
						code = strings.TrimSpace(r.CouponCode)
					}
					break
				}
			}
		}
	}
	if discount <= 0 {
		var merch float64
		for _, item := range order.Items {
			merch += item.LineTotal
		}
		if merch > order.Subtotal {
			discount = merch - order.Subtotal
		}
	}
	return code, discount
}

func (h *Handlers) ensureInvoiceGenerated(r *http.Request, order *models.Order) error {
	if order == nil || strings.TrimSpace(order.InvoiceS3Key) != "" {
		return nil
	}

	config, err := h.db.GetConfig(r.Context())
	if err != nil {
		return err
	}

	var user *models.User
	if strings.TrimSpace(order.UserID) != "" {
		user, _ = h.db.GetUser(r.Context(), order.UserID)
	}

	couponCode, couponDiscount := h.orderCouponForInvoice(r.Context(), order)
	pdfBytes, err := renderInvoicePDF(config, user, order, couponCode, couponDiscount)
	if err != nil {
		return err
	}

	if useLocalInvoiceStorage() {
		path := localInvoicePath(order.OrderID)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(path, pdfBytes, 0o644); err != nil {
			return err
		}
		order.InvoiceS3Key = localInvoiceMarker(path)
	} else {
		key := invoiceS3Key(order.OrderID)
		if err := h.db.PutObject(r.Context(), key, pdfBytes, "application/pdf"); err != nil {
			return err
		}
		order.InvoiceS3Key = key
	}

	if strings.TrimSpace(order.UserName) == "" && user != nil {
		order.UserName = user.Name
	}
	if strings.TrimSpace(order.UserEmail) == "" && user != nil {
		order.UserEmail = user.Email
	}
	order.UpdatedAt = now()
	return h.db.PutOrder(r.Context(), order)
}

// ─── Validation helpers ───

var (
	reUSZip   = regexp.MustCompile(`^\d{5}(-\d{4})?$`)
	reUSPhone = regexp.MustCompile(`^\+1[2-9]\d{9}$`)
)

// validateAddress enforces basic US address field constraints.
func validateAddress(a models.Address) error {
	if strings.TrimSpace(a.Line1) == "" {
		return fmt.Errorf("address line1 is required")
	}
	if strings.TrimSpace(a.City) == "" {
		return fmt.Errorf("city is required")
	}
	if len(strings.TrimSpace(a.State)) != 2 {
		return fmt.Errorf("state must be a 2-letter US state code")
	}
	if !reUSZip.MatchString(strings.TrimSpace(a.Zip)) {
		return fmt.Errorf("zip must be a valid US ZIP code (e.g. 85001)")
	}
	if !isUSCountry(a.Country) {
		return fmt.Errorf("country must be United States (US)")
	}
	return nil
}

func customerOrderVisibleInHistory(o models.Order) bool {
	ps := strings.ToLower(strings.TrimSpace(o.PaymentStatus))
	return ps == "paid" || ps == "partially_refunded"
}

func (h *Handlers) productNameTaken(ctx context.Context, name, excludeProductID string) bool {
	n := strings.TrimSpace(name)
	if n == "" {
		return false
	}
	list, err := h.db.GetProducts(ctx, "", "", 0)
	if err != nil || list == nil {
		return false
	}
	ex := strings.TrimPrefix(strings.TrimSpace(excludeProductID), "PRODUCT#")
	for _, p := range list.Items {
		pid := strings.TrimPrefix(strings.TrimSpace(p.ProductID), "PRODUCT#")
		if strings.EqualFold(strings.TrimSpace(p.Name), n) && pid != ex {
			return true
		}
	}
	return false
}

// ─── Auth ───

func (h *Handlers) Login(w http.ResponseWriter, r *http.Request) {
	var req models.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	resp, err := h.db.Login(r.Context(), req)
	if err != nil {
		log.Printf("login failed for user: %v", err)
		if strings.Contains(strings.ToLower(err.Error()), "disabled") {
			writeError(w, http.StatusForbidden, "this account has been deactivated")
			return
		}
		if errors.Is(err, store.ErrUserNotConfirmed) {
			writeAuthJSONError(w, http.StatusForbidden, "email_not_verified",
				"Please verify your email before signing in. Use the code we sent, or request a new one.")
			return
		}
		if errors.Is(err, store.ErrInvalidLogin) {
			writeError(w, http.StatusUnauthorized, "invalid email or password")
			return
		}
		writeError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *Handlers) Signup(w http.ResponseWriter, r *http.Request) {
	var req models.SignupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	resp, err := h.db.Signup(r.Context(), req)
	if err != nil {
		log.Printf("signup error: %v", err)
		if errors.Is(err, store.ErrSignupEmailAlreadyInUse) {
			writeError(w, http.StatusConflict, "An account with this email already exists. Sign in with Google or your password instead of registering again.")
			return
		}
		// Return a generic message to prevent user enumeration for other failures.
		writeError(w, http.StatusBadRequest, "signup failed: check your details and try again")
		return
	}

	writeJSON(w, http.StatusCreated, resp)
}

func (h *Handlers) ConfirmSignup(w http.ResponseWriter, r *http.Request) {
	var req models.ConfirmSignupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	resp, err := h.db.ConfirmSignup(r.Context(), req)
	if err != nil {
		log.Printf("confirm signup error: %v", err)
		writeError(w, http.StatusBadRequest, "verification failed: check the code and try again")
		return
	}

	writeJSON(w, http.StatusOK, resp)
}

func (h *Handlers) ResendVerificationCode(w http.ResponseWriter, r *http.Request) {
	var req models.ResendCodeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := h.db.ResendVerificationCode(r.Context(), req); err != nil {
		if errors.Is(err, store.ErrUserAlreadyConfirmed) {
			writeAuthJSONError(w, http.StatusBadRequest, "already_verified",
				"This email is already verified. Sign in with your password.")
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Verification code sent"})
}

func (h *Handlers) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	var req models.ForgotPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.Email) == "" {
		writeError(w, http.StatusBadRequest, "email is required")
		return
	}

	resp := h.db.RequestForgotPassword(r.Context(), req)
	if resp.Hint == "invalid_email" {
		writeError(w, http.StatusBadRequest, resp.Message)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *Handlers) ConfirmForgotPassword(w http.ResponseWriter, r *http.Request) {
	var req models.ConfirmForgotPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.Code) == "" || strings.TrimSpace(req.NewPassword) == "" {
		writeError(w, http.StatusBadRequest, "code and new password are required")
		return
	}

	if err := h.db.ConfirmForgotPassword(r.Context(), req); err != nil {
		log.Printf("confirm forgot password error: %v", err)
		writeError(w, http.StatusBadRequest, "password reset failed: check the code and try again")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Password reset successfully. You can now sign in."})
}

// ─── Public ───

func (h *Handlers) GetTheme(w http.ResponseWriter, r *http.Request) {
	config, err := h.db.GetConfig(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	config.FreebieOffer = h.buildFreebieOffer(r.Context(), config)
	writeJSON(w, http.StatusOK, config)
}

func (h *Handlers) buildFreebieOffer(ctx context.Context, config *models.StoreConfig) *models.FreebieOffer {
	if config == nil || !freebie.PromotionConfigured(config) {
		return nil
	}
	now := time.Now().UTC()
	label := strings.TrimSpace(config.FreebieLabel)
	if label == "" {
		label = fmt.Sprintf("Free gift on orders %s+", formatUSD(freebie.MinOrderAmount(config)))
	}
	offer := &models.FreebieOffer{
		Active:         freebie.IsPromotionActive(config, now),
		MinOrderAmount: freebie.MinOrderAmount(config),
		Label:          label,
		EndsAt:         strings.TrimSpace(config.FreebieEndsAt),
	}
	pid := strings.TrimSpace(config.FreebieProductID)
	if pid == "" {
		return offer
	}
	product, err := h.db.GetProduct(ctx, pid)
	if err != nil || product == nil || !product.IsActive {
		return offer
	}
	offer.Product = product
	return offer
}

func formatUSD(amount float64) string {
	return fmt.Sprintf("$%.0f", amount)
}

func (h *Handlers) appendFreebieLine(ctx context.Context, items *[]models.OrderItem, config *models.StoreConfig, productID string) error {
	for _, it := range *items {
		if it.ProductID == productID && it.IsFreebie {
			return nil
		}
	}
	product, err := h.db.GetProduct(ctx, productID)
	if err != nil {
		return fmt.Errorf("free gift product not found")
	}
	if !product.IsActive {
		return fmt.Errorf("free gift %s is unavailable", product.Name)
	}
	if product.Stock < 1 {
		return fmt.Errorf("free gift %s is out of stock", product.Name)
	}
	*items = append(*items, models.OrderItem{
		ProductID: product.ProductID,
		Name:      product.Name,
		Qty:       1,
		UnitPrice: 0,
		LineTotal: 0,
		IsFreebie: true,
	})
	return nil
}

func (h *Handlers) GetProducts(w http.ResponseWriter, r *http.Request) {
	category := r.URL.Query().Get("category")
	search := r.URL.Query().Get("search")
	result, err := h.db.GetProducts(r.Context(), category, search, 0)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *Handlers) GetProduct(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "productId")
	product, err := h.db.GetProduct(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, product)
}

func (h *Handlers) GetCategories(w http.ResponseWriter, r *http.Request) {
	categories, err := h.db.GetCategories(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, categories)
}

// ─── Authenticated User ───

func (h *Handlers) GetMe(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	user, err := h.db.GetUser(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, user)
}

func (h *Handlers) UpdateMe(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	user, err := h.db.GetUser(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	var patch struct {
		Name  *string `json:"name"`
		Phone *string `json:"phone"`
	}
	if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if patch.Name != nil {
		user.Name = strings.TrimSpace(*patch.Name)
	}
	if patch.Phone != nil {
		user.Phone = strings.TrimSpace(*patch.Phone)
	}
	user.UpdatedAt = now()

	if err := h.db.PutUser(r.Context(), user); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, user)
}

func (h *Handlers) UpdateAddress(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	user, err := h.db.GetUser(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	var addr models.Address
	if err := json.NewDecoder(r.Body).Decode(&addr); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := validateAddress(addr); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := validateUSZipCityStateMatch(r.Context(), addr.Zip, addr.City, addr.State); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	addr.Country = ensureUSCountryCode(addr.Country)

	user.Address = addr
	user.UpdatedAt = now()

	if err := h.db.PutUser(r.Context(), user); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handlers) ChangePassword(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	user, err := h.db.GetUser(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	var req models.ChangePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.CurrentPassword = strings.TrimSpace(req.CurrentPassword)
	req.NewPassword = strings.TrimSpace(req.NewPassword)
	if req.CurrentPassword == "" || req.NewPassword == "" {
		writeError(w, http.StatusBadRequest, "current and new password are required")
		return
	}
	if len(req.NewPassword) < 8 {
		writeError(w, http.StatusBadRequest, "new password must be at least 8 characters")
		return
	}

	if err := h.db.ChangePassword(r.Context(), user.Email, req.CurrentPassword, req.NewPassword); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ─── Orders ───

func (h *Handlers) GetOrders(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	orders, err := h.db.GetOrders(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	filtered := make([]models.Order, 0, len(orders.Items))
	for i := range orders.Items {
		if customerOrderVisibleInHistory(orders.Items[i]) {
			filtered = append(filtered, orders.Items[i])
		}
	}
	writeJSON(w, http.StatusOK, models.Paginated[models.Order]{Items: filtered, Count: len(filtered)})
}

func (h *Handlers) GetOrder(w http.ResponseWriter, r *http.Request) {
	orderID := chi.URLParam(r, "orderId")
	order, err := h.db.GetOrder(r.Context(), orderID)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	// Verify ownership
	userID := middleware.GetUserID(r)
	if order.UserID != userID {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}
	writeJSON(w, http.StatusOK, order)
}

// CancelOrder lets the order owner cancel an order while it is still Pending.
// Once payment is captured (status >= Paid), only an admin refund can void the charge.
func (h *Handlers) CancelOrder(w http.ResponseWriter, r *http.Request) {
	orderID := chi.URLParam(r, "orderId")
	order, err := h.db.GetOrder(r.Context(), orderID)
	if err != nil {
		writeError(w, http.StatusNotFound, "order not found")
		return
	}
	userID := middleware.GetUserID(r)
	if order.UserID != userID {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}
	if order.Status != "Pending" {
		writeError(w, http.StatusBadRequest, "only Pending orders can be cancelled")
		return
	}

	var body struct {
		Reason string `json:"reason"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	// Best-effort: cancel the Stripe PaymentIntent if one was created.
	if stripeutil.IsInitialized() && strings.TrimSpace(order.StripePaymentIntentID) != "" {
		if _, err := paymentintent.Cancel(order.StripePaymentIntentID, nil); err != nil {
			log.Printf("cancel payment intent failed for order %s: %v", order.OrderID, err)
		}
	}

	order.Status = "Cancelled"
	order.PaymentStatus = "cancelled"
	order.CancelledAt = now()
	order.CancelReason = strings.TrimSpace(body.Reason)
	order.UpdatedAt = now()

	if err := h.db.PutOrder(r.Context(), order); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	// Reverse any reward earnings/redemptions tied to this order.
	h.reverseRewardForOrder(r.Context(), order)
	h.notifyOrderCancelledByCustomer(r.Context(), order)
	writeJSON(w, http.StatusOK, order)
}

// completeZeroAmountOrder marks a $0 checkout as paid without Stripe and runs post-payment side effects.
func (h *Handlers) completeZeroAmountOrder(r *http.Request, order *models.Order, userID string, appliedCoupon *models.Coupon) error {
	order.Status = "Paid"
	order.PaymentStatus = "paid"
	order.PaidAt = now()
	order.UpdatedAt = now()
	if err := h.db.PutOrder(r.Context(), order); err != nil {
		return err
	}
	if appliedCoupon != nil {
		if err := h.db.RecordCouponRedemption(r.Context(), userID, appliedCoupon.CouponID, appliedCoupon.Code, order.OrderID); err != nil {
			log.Printf("failed to record coupon redemption (user=%s coupon=%s order=%s): %v", userID, appliedCoupon.CouponID, order.OrderID, err)
		}
	}
	h.recordRewardRedemption(r.Context(), order)
	order.UpdatedAt = now()
	if err := h.db.PutOrder(r.Context(), order); err != nil {
		return err
	}
	if err := h.db.DebitOrderInventoryIfPaid(r.Context(), order.OrderID); err != nil {
		log.Printf("inventory debit failed for zero-amount order %s: %v", order.OrderID, err)
	}
	if err := h.ensureInvoiceGenerated(r, order); err != nil {
		return err
	}
	h.notifyOrderPaid(r.Context(), order)
	return nil
}

func (h *Handlers) CreateOrder(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	var req models.CreateOrderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(req.Items) == 0 {
		writeError(w, http.StatusBadRequest, "cart is empty")
		return
	}
	// Limit line items per order to prevent abuse.
	const maxLineItems = 50
	if len(req.Items) > maxLineItems {
		writeError(w, http.StatusBadRequest, "too many line items in order")
		return
	}
	if err := validateAddress(req.ShippingAddress); err != nil {
		writeError(w, http.StatusBadRequest, "invalid shipping address: "+err.Error())
		return
	}
	if err := validateUSZipCityStateMatch(r.Context(), req.ShippingAddress.Zip, req.ShippingAddress.City, req.ShippingAddress.State); err != nil {
		writeError(w, http.StatusBadRequest, "invalid shipping address: "+err.Error())
		return
	}
	req.ShippingAddress.Country = ensureUSCountryCode(req.ShippingAddress.Country)

	config, err := h.db.GetConfig(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load store configuration")
		return
	}

	// Build order
	orderID := uuid.New().String()
	orderNumber := fmt.Sprintf("SF-%d", time.Now().UnixMilli()%1000000)

	var items []models.OrderItem
	var subtotal float64
	freebieProductID := strings.TrimSpace(config.FreebieProductID)
	orderNow := time.Now().UTC()
	freebieQtyRequested := 0

	for _, ci := range req.Items {
		if freebieProductID != "" && ci.ProductID == freebieProductID {
			if ci.Qty <= 0 {
				writeError(w, http.StatusBadRequest, "invalid quantity")
				return
			}
			if ci.Qty > 1 {
				writeError(w, http.StatusBadRequest, "free gift is limited to 1 per order")
				return
			}
			freebieQtyRequested += ci.Qty
			continue
		}

		product, err := h.db.GetProduct(r.Context(), ci.ProductID)
		if err != nil {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("product %s not found", ci.ProductID))
			return
		}
		if !product.IsActive {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("product %s is unavailable", product.Name))
			return
		}
		if ci.Qty <= 0 {
			writeError(w, http.StatusBadRequest, "invalid quantity")
			return
		}
		maxQtyPerItem := orderlimits.MaxQtyPerProduct(config)
		if ci.Qty > maxQtyPerItem {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("quantity exceeds maximum allowed per item (%d)", maxQtyPerItem))
			return
		}
		if product.Stock < ci.Qty {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("insufficient stock for %s", product.Name))
			return
		}
		lineTotal := product.Price * float64(ci.Qty)
		items = append(items, models.OrderItem{
			ProductID: ci.ProductID,
			Name:      product.Name,
			Qty:       ci.Qty,
			UnitPrice: product.Price,
			LineTotal: lineTotal,
		})
		subtotal += lineTotal
	}

	freebieEligible := freebie.IsEligible(subtotal, config, orderNow)
	if freebieQtyRequested > 0 && !freebieEligible {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("order must be at least %s to receive the free gift", formatUSD(freebie.MinOrderAmount(config))))
		return
	}
	if freebieEligible && freebieProductID != "" {
		if err := h.appendFreebieLine(r.Context(), &items, config, freebieProductID); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
	}

	var discount float64
	var couponUnused float64
	var appliedCoupon *models.Coupon
	if code := strings.TrimSpace(req.CouponCode); code != "" {
		coupon, err := h.db.GetCouponByCode(r.Context(), code)
		if err != nil || coupon == nil || !coupon.IsActive || !couponUsableNow(coupon) {
			writeError(w, http.StatusBadRequest, "invalid or expired coupon")
			return
		}
		if !couponAllowedForUser(coupon, userID) {
			writeError(w, http.StatusBadRequest, "this coupon is not available for your account")
			return
		}
		if coupon.OneTimePerUser {
			already, err := h.db.HasUserRedeemedCoupon(r.Context(), userID, coupon.CouponID)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "failed to validate coupon")
				return
			}
			if already {
				writeError(w, http.StatusBadRequest, "you have already used this coupon")
				return
			}
		}
		appliedCoupon = coupon
	}

	// Determine tax mode up front so it affects both the amount calculation
	// and the PaymentIntent params below.
	// stripeAutoTaxEnabled=true → call Stripe Tax Calculations API to get real tax;
	//   the calculation's amount_total (which includes tax) becomes the charge amount.
	// stripeAutoTaxEnabled=false → use config.TaxRate for local backend tax.
	useStripeTax := config.StripeAutoTaxEnabled

	var taxableSubtotal, shippingFee float64
	if appliedCoupon != nil && coupondiscount.IsFlat(appliedCoupon) {
		shippingPre := shippingcalc.Fee(subtotal, config)
		red := coupondiscount.FlatRedemptionForOrder(subtotal, shippingPre, appliedCoupon)
		discount = red.Applied
		couponUnused = red.Unused
		if discount <= 0 {
			writeError(w, http.StatusBadRequest, "invalid or expired coupon")
			return
		}
		taxableSubtotal = subtotal - red.MerchandiseDiscount
		if taxableSubtotal < 0 {
			taxableSubtotal = 0
		}
		shippingFee = shippingPre - red.ShippingDiscount
		if shippingFee < 0 {
			shippingFee = 0
		}
	} else {
		if appliedCoupon != nil {
			discount = coupondiscount.DiscountAmount(subtotal, 0, appliedCoupon)
			if discount <= 0 {
				writeError(w, http.StatusBadRequest, "invalid or expired coupon")
				return
			}
		}
		taxableSubtotal = subtotal - discount
		if taxableSubtotal < 0 {
			taxableSubtotal = 0
		}
		shippingFee = shippingcalc.Fee(taxableSubtotal, config)
	}
	// Flat delivery fee is not taxed — tax applies to merchandise (after coupon) only.
	var tax float64
	if !useStripeTax {
		tax = taxableSubtotal * config.TaxRate / 100
	}
	total := taxableSubtotal + shippingFee + tax
	amountCents := int64(math.Round(total * 100))

	// When Stripe Tax is enabled, run the Tax Calculations API now (before rewards)
	// so we know the real tax amount. We'll use taxcalc.AmountTotal as the base.
	// Skip the API call entirely when taxableSubtotal is zero — there is nothing to
	// tax, and sending zero-amount line items (or items floored to 1¢) to Stripe
	// would return nonsensical tax values. Tax stays zero in this case.
	var taxCalcID string
	if useStripeTax && taxableSubtotal > 0 {
		// Stripe Tax Calculations API requires all line item amounts to be positive
		// integers. When a coupon discount is applied, distribute it proportionally
		// across each line item rather than sending a negative "discount" line item
		// (which Stripe rejects with a validation error).
		discountRatio := float64(0)
		if subtotal > 0 && discount > 0 {
			discountRatio = discount / subtotal
		}
		var lineItemParams []*stripe.TaxCalculationLineItemParams
		for _, item := range items {
			if item.IsFreebie || item.LineTotal <= 0 {
				continue
			}
			// Apply the proportional discount to arrive at the taxable amount per line.
			discountedCents := int64(math.Round(item.LineTotal * (1 - discountRatio) * 100))
			if discountedCents < 1 {
				discountedCents = 1 // Stripe requires amount >= 1
			}
			lineItemParams = append(lineItemParams, &stripe.TaxCalculationLineItemParams{
				Amount:    stripe.Int64(discountedCents),
				Reference: stripe.String(item.ProductID),
				Quantity:  stripe.Int64(int64(item.Qty)),
			})
		}
		addressSource := string(stripe.TaxCalculationCustomerDetailsAddressSourceShipping)
		taxcalc, tcErr := taxcalculation.New(&stripe.TaxCalculationParams{
			Currency:  stripe.String(stripeCurrency(config)),
			LineItems: lineItemParams,
			CustomerDetails: &stripe.TaxCalculationCustomerDetailsParams{
				Address: &stripe.AddressParams{
					Line1:      stripe.String(req.ShippingAddress.Line1),
					Line2:      stripe.String(req.ShippingAddress.Line2),
					City:       stripe.String(req.ShippingAddress.City),
					State:      stripe.String(req.ShippingAddress.State),
					PostalCode: stripe.String(req.ShippingAddress.Zip),
					Country:    stripe.String(req.ShippingAddress.Country),
				},
				AddressSource: stripe.String(addressSource),
			},
		})
		if tcErr != nil {
			log.Printf("Stripe Tax calculation failed (order=%s): %v", orderID, tcErr)
			writeError(w, http.StatusInternalServerError, "failed to calculate tax")
			return
		}
		taxCalcID = taxcalc.ID
		tax = float64(taxcalc.TaxAmountExclusive) / 100
		shippingCents := int64(math.Round(shippingFee * 100))
		amountCents = taxcalc.AmountTotal + shippingCents
		total = float64(amountCents) / 100
		log.Printf("Stripe Tax calc=%s tax_exclusive=%d merchandise_total=%d shipping_cents=%d charge_cents=%d",
			taxCalcID, taxcalc.TaxAmountExclusive, taxcalc.AmountTotal, shippingCents, amountCents)
	}

	// ─── Reward redemption ───
	// Customers may apply available reward points as a final cash discount on
	// top of any coupon. The discount is capped at (a) the user's available
	// balance, (b) the value implied by amountCents minus 1¢ (Stripe requires
	// a non-zero charge), and (c) what reward points actually buy at the
	// configured point value.
	rewardCfg := effectiveRewardConfig(config)
	var redeemPoints int64
	var rewardDiscountCents int64
	if rewardCfg.Enabled && req.RedeemPoints > 0 {
		if _, err := h.db.PromoteEligibleRewardsForUser(r.Context(), userID, time.Now().UTC()); err != nil {
			log.Printf("reward promotion before checkout user=%s: %v", userID, err)
		}
		summary, srerr := h.db.GetRewardSummary(r.Context(), userID)
		if srerr != nil {
			writeError(w, http.StatusInternalServerError, "failed to load rewards summary")
			return
		}
		available := int64(0)
		if summary != nil {
			available = summary.AvailablePoints
		}
		redeemPoints = req.RedeemPoints
		if redeemPoints > available {
			writeError(w, http.StatusBadRequest, "not enough reward points available")
			return
		}
		rewardDiscountCents = pointsToCents(rewardCfg, redeemPoints)
		// Never let rewards drive the order to zero — Stripe minimum is 1¢
		// (and many regions enforce $0.50). Cap and refund the unused points.
		maxDiscount := amountCents - 1
		if maxDiscount < 0 {
			maxDiscount = 0
		}
		if rewardDiscountCents > maxDiscount {
			rewardDiscountCents = maxDiscount
			if rewardCfg.PointValueCents > 0 {
				redeemPoints = rewardDiscountCents / rewardCfg.PointValueCents
				rewardDiscountCents = redeemPoints * rewardCfg.PointValueCents
			}
		}
		amountCents -= rewardDiscountCents
		total = float64(amountCents) / 100
	}

	order := &models.Order{
		OrderID:              orderID,
		OrderNumber:          orderNumber,
		UserID:               userID,
		Status:               "Pending",
		PaymentStatus:        "pending",
		Items:                items,
		ShippingAddress:      req.ShippingAddress,
		Subtotal:             taxableSubtotal,
		ShippingFee:          shippingFee,
		Tax:                  tax,
		Total:                total,
		Currency:             strings.ToUpper(stripeCurrency(config)),
		RewardPointsRedeemed: redeemPoints,
		RewardDiscountCents:  rewardDiscountCents,
		CreatedAt:            now(),
		UpdatedAt:            now(),
	}
	if appliedCoupon != nil && discount > 0 {
		order.CouponCode = strings.TrimSpace(appliedCoupon.Code)
		order.CouponDiscountCents = int64(math.Round(discount * 100))
	}

	if amountCents <= 0 {
		if err := h.completeZeroAmountOrder(r, order, userID, appliedCoupon); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusCreated, models.CreateOrderResponse{
			OrderID:            orderID,
			OrderNumber:        orderNumber,
			AmountCents:        0,
			Currency:           stripeCurrency(config),
			Subtotal:           subtotal,
			Discount:           discount,
			ShippingFee:        shippingFee,
			Tax:                tax,
			Total:              0,
			CouponUnusedAmount: couponUnused,
			NoPaymentRequired:  true,
		})
		return
	}

	if !stripeutil.IsInitialized() {
		writeError(w, http.StatusInternalServerError, "stripe is not configured")
		return
	}

	params := &stripe.PaymentIntentParams{
		Amount:                    stripe.Int64(amountCents),
		Currency:                  stripe.String(stripeCurrency(config)),
		StatementDescriptorSuffix: stripe.String(statementDescriptorSuffix(config)),
		// Accepted payment methods: card/debit card, Apple Pay (card wallet),
		// and Amazon Pay. Bank methods (ACH, SEPA, etc.) are intentionally
		// excluded by not listing them here.
		PaymentMethodTypes: []*string{
			stripe.String("card"),
			stripe.String("amazon_pay"),
		},
	}

	// Link the Stripe Tax Calculation to the PaymentIntent using the simplified
	// Stripe Tax API. When the PaymentIntent succeeds, Stripe automatically records
	// a Tax Transaction and handles reversals on refunds.
	// See: https://docs.stripe.com/tax/payment-intent/simplified
	if useStripeTax && taxCalcID != "" {
		params.Params.AddExtra("hooks[inputs][tax][calculation]", taxCalcID)
	}

	params.Metadata = map[string]string{
		"order_id":           orderID,
		"order_number":       orderNumber,
		"user_id":            userID,
		"stripe_tax_enabled": fmt.Sprintf("%v", useStripeTax),
	}

	params.Params.IdempotencyKey = stripe.String(stripeIdempotencyKey(orderID))

	pi, err := paymentintent.New(params)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to initialize Stripe payment")
		return
	}

	order.StripePaymentIntentID = pi.ID

	if err := h.db.PutOrder(r.Context(), order); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.notifyOrderCreated(r.Context(), order)

	// Record coupon redemption (best-effort; failure must not block order creation).
	if appliedCoupon != nil {
		if err := h.db.RecordCouponRedemption(r.Context(), userID, appliedCoupon.CouponID, appliedCoupon.Code, orderID); err != nil {
			log.Printf("failed to record coupon redemption (user=%s coupon=%s order=%s): %v", userID, appliedCoupon.CouponID, orderID, err)
		}
	}

	writeJSON(w, http.StatusCreated, models.CreateOrderResponse{
		OrderID:            orderID,
		OrderNumber:        orderNumber,
		ClientSecret:       pi.ClientSecret,
		AmountCents:        amountCents,
		Currency:           stripeCurrency(config),
		Subtotal:           subtotal,
		Discount:           discount,
		ShippingFee:        shippingFee,
		Tax:                tax,
		Total:              total,
		CouponUnusedAmount: couponUnused,
	})
}

func (h *Handlers) ConfirmOrderPayment(w http.ResponseWriter, r *http.Request) {
	if !stripeutil.IsInitialized() {
		writeError(w, http.StatusInternalServerError, "stripe is not configured")
		return
	}

	orderID := chi.URLParam(r, "orderId")
	order, err := h.db.GetOrder(r.Context(), orderID)
	if err != nil {
		writeError(w, http.StatusNotFound, "order not found")
		return
	}

	userID := middleware.GetUserID(r)
	if order.UserID != userID {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}

	var req models.ConfirmPaymentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.PaymentIntentID) == "" {
		writeError(w, http.StatusBadRequest, "payment intent id is required")
		return
	}

	pi, err := paymentintent.Get(req.PaymentIntentID, nil)
	if err != nil {
		writeError(w, http.StatusBadRequest, "payment intent not found")
		return
	}
	if pi.Metadata["order_id"] != orderID {
		writeError(w, http.StatusForbidden, "payment intent does not match order")
		return
	}
	if pi.Status != stripe.PaymentIntentStatusSucceeded && pi.Status != stripe.PaymentIntentStatusProcessing {
		writeError(w, http.StatusBadRequest, "payment has not been completed")
		return
	}

	// PaymentIntentStatusProcessing means Stripe has accepted the payment method
	// but capture is not yet confirmed (e.g. ACH, bank transfers). Do NOT mark the
	// order as "Paid" yet — doing so would create a split-state if the async payment
	// later fails. Keep PaymentStatus as "pending" and let the payment_intent.succeeded
	// webhook transition the order to "Paid" once money is actually captured.
	if pi.Status == stripe.PaymentIntentStatusProcessing && order.PaymentStatus != "paid" {
		order.PaymentStatus = "pending"
		order.UpdatedAt = now()
		if err := h.db.PutOrder(r.Context(), order); err != nil {
			log.Printf("failed to persist pending status for order %s: %v", orderID, err)
		}
		writeJSON(w, http.StatusOK, models.ConfirmPaymentResponse{
			OrderID: orderID,
			Status:  "pending",
			Message: "Your payment is being processed. We will confirm your order shortly.",
		})
		return
	}

	if order.PaymentStatus != "paid" {
		order.Status = "Paid"
		order.PaymentStatus = "paid"
		order.PaidAt = now()
		if pi.LatestCharge != nil {
			order.StripeChargeID = pi.LatestCharge.ID
		}
		// Debit any reward points the customer chose to redeem at checkout.
		h.recordRewardRedemption(r.Context(), order)
		order.UpdatedAt = now()
		if err := h.db.PutOrder(r.Context(), order); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to update order payment status")
			return
		}
		if err := h.db.DebitOrderInventoryIfPaid(r.Context(), orderID); err != nil {
			log.Printf("inventory debit failed on confirm for %s: %v", orderID, err)
		}
		if err := h.ensureInvoiceGenerated(r, order); err != nil {
			log.Printf("invoice generation failed during confirm for order %s: %v", orderID, err)
			writeError(w, http.StatusInternalServerError, "failed to generate invoice")
			return
		}
		h.notifyOrderPaid(r.Context(), order)
	} else if err := h.ensureInvoiceGenerated(r, order); err != nil {
		log.Printf("invoice generation failed during confirm for order %s: %v", orderID, err)
		writeError(w, http.StatusInternalServerError, "failed to generate invoice")
		return
	}

	writeJSON(w, http.StatusOK, models.ConfirmPaymentResponse{
		OrderID: orderID,
		Status:  "paid",
		Message: "Your order is confirmed and payment has been processed.",
	})
}

func (h *Handlers) StripeWebhook(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	event, err := stripeutil.VerifyWebhook(body, r.Header.Get("Stripe-Signature"), os.Getenv("STRIPE_WEBHOOK_SECRET"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid webhook signature")
		return
	}

	switch event.Type {
	case "payment_intent.succeeded":
		var pi stripe.PaymentIntent
		if err := json.Unmarshal(event.Data.Raw, &pi); err == nil {
			h.syncSuccessfulPayment(r, &pi)
		}
	case "payment_intent.payment_failed":
		var pi stripe.PaymentIntent
		if err := json.Unmarshal(event.Data.Raw, &pi); err == nil {
			h.syncFailedPayment(r, &pi)
		}
	case "payment_intent.canceled":
		var pi stripe.PaymentIntent
		if err := json.Unmarshal(event.Data.Raw, &pi); err == nil {
			h.syncCancelledPayment(r, &pi)
		}
	case "charge.dispute.created":
		h.syncDisputeCreated(r, event.Data.Raw)
	case "charge.refunded":
		var charge stripe.Charge
		if err := json.Unmarshal(event.Data.Raw, &charge); err == nil {
			h.syncChargeRefunded(r, &charge)
		}
	default:
		log.Printf("ignoring unsupported Stripe event type: %s", event.Type)
	}

	w.WriteHeader(http.StatusOK)
}

func (h *Handlers) syncSuccessfulPayment(r *http.Request, pi *stripe.PaymentIntent) {
	orderID := pi.Metadata["order_id"]
	if orderID == "" {
		return
	}

	order, err := h.db.GetOrder(r.Context(), orderID)
	if err != nil {
		log.Printf("webhook order lookup failed for %s: %v", orderID, err)
		return
	}
	if order.PaymentStatus == "paid" {
		if err := h.db.DebitOrderInventoryIfPaid(r.Context(), orderID); err != nil {
			log.Printf("inventory debit (already paid) failed for %s: %v", orderID, err)
		}
		if strings.TrimSpace(order.InvoiceS3Key) == "" {
			if err := h.ensureInvoiceGenerated(r, order); err != nil {
				log.Printf("invoice generation failed for paid order %s: %v", orderID, err)
			}
		}
		return
	}

	order.Status = "Paid"
	order.PaymentStatus = "paid"
	order.PaidAt = now()
	if pi.LatestCharge != nil {
		order.StripeChargeID = pi.LatestCharge.ID
	}
	order.UpdatedAt = now()
	if err := h.db.PutOrder(r.Context(), order); err != nil {
		log.Printf("webhook order update failed for %s: %v", orderID, err)
		return
	}
	if err := h.db.DebitOrderInventoryIfPaid(r.Context(), orderID); err != nil {
		log.Printf("inventory debit failed for %s: %v", orderID, err)
	}
	if err := h.ensureInvoiceGenerated(r, order); err != nil {
		log.Printf("invoice generation failed for %s: %v", orderID, err)
	}
	h.notifyOrderPaid(r.Context(), order)
}

func (h *Handlers) syncFailedPayment(r *http.Request, pi *stripe.PaymentIntent) {
	orderID := pi.Metadata["order_id"]
	if orderID == "" {
		return
	}

	order, err := h.db.GetOrder(r.Context(), orderID)
	if err != nil {
		log.Printf("failed payment order lookup failed for %s: %v", orderID, err)
		return
	}

	order.PaymentStatus = "capture_failed"
	// Move the order to "Failed" whenever Stripe reports payment failure.
	// Orders that were still "Pending" (payment initiated but not confirmed) and
	// orders that were prematurely marked "Paid" (e.g. ConfirmOrderPayment called
	// while Stripe PI was still in the async 'processing' state) both need this
	// terminal state so customers and admins can clearly see the payment did not go through.
	if order.Status == "Pending" || order.Status == "Paid" {
		order.Status = "Failed"
		order.PaidAt = ""
	}
	order.UpdatedAt = now()
	if err := h.db.PutOrder(r.Context(), order); err != nil {
		log.Printf("failed payment order update failed for %s: %v", orderID, err)
		return
	}
	h.notifyOrderStatus(r.Context(), order, "Failed")
}

func (h *Handlers) syncCancelledPayment(r *http.Request, pi *stripe.PaymentIntent) {
	orderID := pi.Metadata["order_id"]
	if orderID == "" {
		return
	}

	order, err := h.db.GetOrder(r.Context(), orderID)
	if err != nil {
		log.Printf("cancelled payment order lookup failed for %s: %v", orderID, err)
		return
	}

	order.Status = "Cancelled"
	order.PaymentStatus = "cancelled"
	order.UpdatedAt = now()
	if err := h.db.PutOrder(r.Context(), order); err != nil {
		log.Printf("cancelled payment order update failed for %s: %v", orderID, err)
		return
	}
	h.notifyOrderStatus(r.Context(), order, "Cancelled")
}

func (h *Handlers) syncDisputeCreated(r *http.Request, raw []byte) {
	var payload map[string]interface{}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return
	}

	chargeID, _ := payload["charge"].(string)
	if chargeID == "" {
		return
	}

	order, err := h.db.GetOrderByStripeChargeID(r.Context(), chargeID)
	if err != nil {
		log.Printf("dispute order lookup failed for charge %s: %v", chargeID, err)
		return
	}

	order.Status = "Disputed"
	order.PaymentStatus = "disputed"
	order.UpdatedAt = now()
	if err := h.db.PutOrder(r.Context(), order); err != nil {
		log.Printf("dispute order update failed for %s: %v", order.OrderID, err)
	}
}

func (h *Handlers) syncChargeRefunded(r *http.Request, charge *stripe.Charge) {
	if charge == nil {
		return
	}

	orderID := ""
	if charge.Metadata != nil {
		orderID = charge.Metadata["order_id"]
	}

	var order *models.Order
	var err error
	if orderID != "" {
		order, err = h.db.GetOrder(r.Context(), orderID)
	} else {
		order, err = h.db.GetOrderByStripeChargeID(r.Context(), charge.ID)
	}
	if err != nil {
		log.Printf("refunded charge order lookup failed for charge %s: %v", charge.ID, err)
		return
	}

	paidCents := int64(math.Round(order.Total * 100))
	previousRefundedCents := order.RefundedAmountCents
	order.RefundedAmountCents = charge.AmountRefunded
	if order.RefundedAmountCents >= paidCents {
		order.PaymentStatus = "refunded"
	} else {
		order.PaymentStatus = "partially_refunded"
	}
	order.UpdatedAt = now()
	if err := h.db.PutOrder(r.Context(), order); err != nil {
		log.Printf("refunded charge order update failed for %s: %v", order.OrderID, err)
		return
	}
	if order.RefundedAmountCents > previousRefundedCents {
		h.notifyOrderRefunded(r.Context(), order, order.PaymentStatus == "partially_refunded")
	}
}

func (h *Handlers) GetInvoice(w http.ResponseWriter, r *http.Request) {
	orderID := chi.URLParam(r, "orderId")
	order, err := h.db.GetOrder(r.Context(), orderID)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	userID := middleware.GetUserID(r)
	if order.UserID != userID {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}
	if order.InvoiceS3Key == "" {
		if strings.EqualFold(order.PaymentStatus, "paid") {
			if err := h.ensureInvoiceGenerated(r, order); err != nil {
				log.Printf("invoice generation failed on demand for order %s: %v", orderID, err)
				writeError(w, http.StatusInternalServerError, "failed to generate invoice")
				return
			}
		} else {
			writeError(w, http.StatusNotFound, "no invoice available")
			return
		}
	}

	if localPath, ok := parseLocalInvoiceMarker(order.InvoiceS3Key); ok {
		pdfBytes, err := os.ReadFile(localPath)
		if err != nil {
			log.Printf("local invoice read failed for order %s at %s: %v", orderID, localPath, err)
			writeError(w, http.StatusInternalServerError, "failed to load local invoice")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"url": buildInlinePDFURL(pdfBytes)})
		return
	}

	url, err := h.db.GetPresignedDownloadURL(r.Context(), order.InvoiceS3Key)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"url": url})
}

// ─── Admin ───

func (h *Handlers) logAudit(r *http.Request, action, entityType, entityID, details string) {
	userID, _ := r.Context().Value(middleware.UserIDKey).(string)
	user, _ := h.db.GetUser(r.Context(), userID)
	adminName, adminEmail := userID, ""
	if user != nil {
		adminName = user.Name
		adminEmail = user.Email
	}
	entry := &models.AuditLog{
		AuditID:    uuid.New().String(),
		Action:     action,
		EntityType: entityType,
		EntityID:   entityID,
		AdminID:    userID,
		AdminName:  adminName,
		AdminEmail: adminEmail,
		Details:    details,
		CreatedAt:  time.Now().UTC().Format(time.RFC3339),
	}
	_ = h.db.PutAuditLog(r.Context(), entry)
}

const maxAuditDetailRunes = 3800

func normalizeProductType(raw string) (string, error) {
	s := strings.ToLower(strings.TrimSpace(raw))
	if s == "" {
		return "product", nil
	}
	switch s {
	case "product", "package":
		return s, nil
	default:
		return "", fmt.Errorf("productType must be either \"product\" or \"package\"")
	}
}

func normalizePackageItems(raw []models.ProductPackageItem, productType, selfID string) ([]models.ProductPackageItem, error) {
	if productType != "package" {
		return nil, nil
	}
	if len(raw) == 0 {
		return nil, fmt.Errorf("package products must include at least one package item")
	}
	out := make([]models.ProductPackageItem, 0, len(raw))
	seen := make(map[string]struct{}, len(raw))
	for _, item := range raw {
		id := strings.TrimSpace(item.ProductID)
		if id == "" {
			return nil, fmt.Errorf("packageItems.productId is required")
		}
		if strings.EqualFold(id, strings.TrimSpace(selfID)) {
			return nil, fmt.Errorf("package cannot include itself")
		}
		if item.Qty <= 0 {
			return nil, fmt.Errorf("packageItems.qty must be greater than 0")
		}
		k := strings.ToLower(id)
		if _, ok := seen[k]; ok {
			return nil, fmt.Errorf("duplicate package item: %s", id)
		}
		seen[k] = struct{}{}
		out = append(out, models.ProductPackageItem{ProductID: id, Qty: item.Qty})
	}
	return out, nil
}

func normalizeProcurementFields(p *models.Product) error {
	p.PurchasedFrom = strings.TrimSpace(p.PurchasedFrom)
	if p.PurchasePackQty < 0 {
		return fmt.Errorf("purchasePackQty cannot be negative")
	}
	if p.PurchasePackPrice < 0 {
		return fmt.Errorf("purchasePackPrice cannot be negative")
	}
	if p.OriginalUnitPrice < 0 {
		return fmt.Errorf("originalUnitPrice cannot be negative")
	}

	hasPackQty := p.PurchasePackQty > 0
	hasPackPrice := p.PurchasePackPrice > 0

	if hasPackQty != hasPackPrice {
		return fmt.Errorf("purchasePackQty and purchasePackPrice must both be provided together")
	}

	if hasPackQty && hasPackPrice {
		// Pack pricing is the source of truth when provided.
		p.OriginalUnitPrice = p.PurchasePackPrice / float64(p.PurchasePackQty)
		return nil
	}

	// If pack info is not provided, require explicit unit cost for P&L.
	if p.OriginalUnitPrice <= 0 {
		return fmt.Errorf("originalUnitPrice is required when purchase pack fields are empty")
	}
	return nil
}

func truncateForAudit(s string, max int) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return "(empty)"
	}
	runes := []rune(s)
	if len(runes) <= max {
		return s
	}
	return string(runes[:max]) + "…"
}

// formatProductUpdateAudit builds a concise before → after summary for audit logs.
func formatProductUpdateAudit(before, after *models.Product) string {
	var parts []string
	if before.Name != after.Name {
		parts = append(parts, fmt.Sprintf(`name: %q → %q`, before.Name, after.Name))
	}
	if before.Description != after.Description {
		parts = append(parts, fmt.Sprintf("description: %q → %q", truncateForAudit(before.Description, 80), truncateForAudit(after.Description, 80)))
	}
	if before.Category != after.Category {
		parts = append(parts, fmt.Sprintf("category: %q → %q", before.Category, after.Category))
	}
	if before.Price != after.Price {
		parts = append(parts, fmt.Sprintf("price: %.2f → %.2f", before.Price, after.Price))
	}
	if before.CompareAtPrice != after.CompareAtPrice {
		parts = append(parts, fmt.Sprintf("compareAtPrice: %.2f → %.2f", before.CompareAtPrice, after.CompareAtPrice))
	}
	if before.Currency != after.Currency {
		parts = append(parts, fmt.Sprintf("currency: %q → %q", before.Currency, after.Currency))
	}
	if before.Stock != after.Stock {
		parts = append(parts, fmt.Sprintf("stock: %d → %d", before.Stock, after.Stock))
	}
	if !reflect.DeepEqual(before.Images, after.Images) {
		parts = append(parts, fmt.Sprintf("images: %d URL(s) → %d URL(s)", len(before.Images), len(after.Images)))
	}
	if !reflect.DeepEqual(before.Tags, after.Tags) {
		parts = append(parts, fmt.Sprintf("tags: %v → %v", before.Tags, after.Tags))
	}
	if before.ProductType != after.ProductType {
		parts = append(parts, fmt.Sprintf("productType: %q → %q", before.ProductType, after.ProductType))
	}
	if !reflect.DeepEqual(before.PackageItems, after.PackageItems) {
		parts = append(parts, "packageItems: updated")
	}
	if before.PurchasedFrom != after.PurchasedFrom {
		parts = append(parts, fmt.Sprintf("purchasedFrom: %q → %q", before.PurchasedFrom, after.PurchasedFrom))
	}
	if before.OriginalUnitPrice != after.OriginalUnitPrice {
		parts = append(parts, fmt.Sprintf("originalUnitPrice: %.4f → %.4f", before.OriginalUnitPrice, after.OriginalUnitPrice))
	}
	if before.PurchasePackQty != after.PurchasePackQty {
		parts = append(parts, fmt.Sprintf("purchasePackQty: %d → %d", before.PurchasePackQty, after.PurchasePackQty))
	}
	if before.PurchasePackPrice != after.PurchasePackPrice {
		parts = append(parts, fmt.Sprintf("purchasePackPrice: %.4f → %.4f", before.PurchasePackPrice, after.PurchasePackPrice))
	}
	if before.IsActive != after.IsActive {
		parts = append(parts, fmt.Sprintf("isActive: %v → %v", before.IsActive, after.IsActive))
	}
	if before.IsTaxable != after.IsTaxable {
		parts = append(parts, fmt.Sprintf("isTaxable: %v → %v", before.IsTaxable, after.IsTaxable))
	}
	if before.Notes != after.Notes {
		parts = append(parts, fmt.Sprintf("notes: %q → %q", truncateForAudit(before.Notes, 60), truncateForAudit(after.Notes, 60)))
	}
	if before.Details != after.Details {
		parts = append(parts, fmt.Sprintf("details: %q → %q", truncateForAudit(before.Details, 60), truncateForAudit(after.Details, 60)))
	}
	if len(parts) == 0 {
		return "no tracked field changes (saved)"
	}
	out := strings.Join(parts, "; ")
	if len([]rune(out)) > maxAuditDetailRunes {
		r := []rune(out)
		return string(r[:maxAuditDetailRunes]) + "…"
	}
	return out
}

func formatCategoryUpdateAudit(before, after *models.Category) string {
	var parts []string
	if before.Name != after.Name {
		parts = append(parts, fmt.Sprintf(`name: %q → %q`, before.Name, after.Name))
	}
	if before.Description != after.Description {
		parts = append(parts, fmt.Sprintf("description: %q → %q", truncateForAudit(before.Description, 80), truncateForAudit(after.Description, 80)))
	}
	if before.ImageURL != after.ImageURL {
		parts = append(parts, fmt.Sprintf("imageUrl: %q → %q", truncateForAudit(before.ImageURL, 80), truncateForAudit(after.ImageURL, 80)))
	}
	if before.SortOrder != after.SortOrder {
		parts = append(parts, fmt.Sprintf("sortOrder: %d → %d", before.SortOrder, after.SortOrder))
	}
	if before.IsActive != after.IsActive {
		parts = append(parts, fmt.Sprintf("isActive: %v → %v", before.IsActive, after.IsActive))
	}
	if len(parts) == 0 {
		return "no tracked field changes (saved)"
	}
	out := strings.Join(parts, "; ")
	if len([]rune(out)) > maxAuditDetailRunes {
		r := []rune(out)
		return string(r[:maxAuditDetailRunes]) + "…"
	}
	return out
}

// normalizeDeliveryZipCodes trims, dedupes, and stores 5-digit US ZIPs for delivery zones.
func normalizeDeliveryZipCodes(in []string) []string {
	seen := make(map[string]struct{}, len(in))
	out := make([]string, 0, len(in))
	for _, raw := range in {
		z := strings.TrimSpace(raw)
		if z == "" {
			continue
		}
		var digits strings.Builder
		for _, r := range z {
			if r >= '0' && r <= '9' {
				digits.WriteRune(r)
			}
		}
		d := digits.String()
		if len(d) < 5 {
			continue
		}
		z5 := d[:5]
		if _, ok := seen[z5]; ok {
			continue
		}
		seen[z5] = struct{}{}
		out = append(out, z5)
	}
	return out
}

func configFieldLabel(field reflect.StructField) string {
	tag := field.Tag.Get("json")
	if tag == "" || tag == "-" {
		return field.Name
	}
	if i := strings.Index(tag, ","); i >= 0 {
		return tag[:i]
	}
	return tag
}

func formatConfigReflectValue(v reflect.Value) string {
	if !v.IsValid() {
		return ""
	}
	switch v.Kind() {
	case reflect.String:
		return truncateForAudit(v.String(), 100)
	case reflect.Bool:
		if v.Bool() {
			return "true"
		}
		return "false"
	case reflect.Float32, reflect.Float64:
		return fmt.Sprintf("%.4f", v.Float())
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		return fmt.Sprintf("%d", v.Int())
	case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		return fmt.Sprintf("%d", v.Uint())
	default:
		return truncateForAudit(fmt.Sprint(v.Interface()), 100)
	}
}

// formatStoreConfigUpdateAudit diffs two store configs for audit logs. Stripe
// publishable key changes are noted but values are never written to the log.
func formatStoreConfigUpdateAudit(before, after *models.StoreConfig) string {
	vb := reflect.ValueOf(before).Elem()
	va := reflect.ValueOf(after).Elem()
	t := vb.Type()
	var parts []string
	for i := 0; i < t.NumField(); i++ {
		field := t.Field(i)
		if !field.IsExported() {
			continue
		}
		fb := vb.Field(i)
		fa := va.Field(i)
		if reflect.DeepEqual(fb.Interface(), fa.Interface()) {
			continue
		}
		label := configFieldLabel(field)
		if label == "stripePublishableKey" {
			parts = append(parts, "stripePublishableKey: changed (value not logged in audit)")
			continue
		}
		parts = append(parts, fmt.Sprintf("%s: %s → %s", label, formatConfigReflectValue(fb), formatConfigReflectValue(fa)))
	}
	if len(parts) == 0 {
		return "no tracked field changes (saved)"
	}
	sort.Strings(parts)
	out := strings.Join(parts, "; ")
	if len([]rune(out)) > maxAuditDetailRunes {
		r := []rune(out)
		return string(r[:maxAuditDetailRunes]) + "…"
	}
	return out
}

func (h *Handlers) AdminGetAuditLogs(w http.ResponseWriter, r *http.Request) {
	logs, err := h.db.GetAuditLogs(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, logs)
}

type dashboardDayRevenue struct {
	Date    string  `json:"date"`
	Gross   float64 `json:"gross"`
	Refunds float64 `json:"refunds"`
	Net     float64 `json:"net"`
}

func orderCountsTowardRevenue(paymentStatus string) bool {
	switch strings.ToLower(strings.TrimSpace(paymentStatus)) {
	case "paid", "partially_refunded", "refunded":
		return true
	default:
		return false
	}
}

func orderRevenueDay(o models.Order, loc *time.Location) string {
	if t, ok := parseOrderTimestamp(o.PaidAt); ok {
		return t.In(loc).Format("2006-01-02")
	}
	if t, ok := parseOrderTimestamp(o.CreatedAt); ok {
		return t.In(loc).Format("2006-01-02")
	}
	if len(o.CreatedAt) >= 10 {
		return o.CreatedAt[:10]
	}
	return ""
}

func centsToDollars(cents int64) float64 {
	if cents == 0 {
		return 0
	}
	return float64(cents) / 100
}

func (h *Handlers) AdminGetDashboard(w http.ResponseWriter, r *http.Request) {
	products, _ := h.db.GetProducts(r.Context(), "", "", 0)
	orders, _ := h.db.GetAllOrders(r.Context(), "")
	users, _ := h.db.GetUsers(r.Context())

	var todayOrders int
	var todayGrossCents, todayRefundCents int64
	displayLoc := invoiceDisplayLocation()
	nowInStoreTime := time.Now().In(displayLoc)
	today := nowInStoreTime.Format("2006-01-02")
	var totalGrossCents, totalRefundCents int64
	dayTotals := make(map[string]struct{ grossCents, refundsCents int64 })
	var recentOrders []models.Order
	var lowStock []models.Product

	if orders != nil {
		for _, o := range orders.Items {
			if o.Status == "Pending" {
				continue
			}
			day := orderRevenueDay(o, displayLoc)
			if day == today {
				todayOrders++
			}
			if !orderCountsTowardRevenue(o.PaymentStatus) {
				continue
			}
			grossCents := int64(math.Round(o.Total * 100))
			refundedCents := o.RefundedAmountCents
			totalGrossCents += grossCents
			totalRefundCents += refundedCents
			if day == today {
				todayGrossCents += grossCents
				todayRefundCents += refundedCents
			}
			if day != "" {
				b := dayTotals[day]
				b.grossCents += grossCents
				b.refundsCents += refundedCents
				dayTotals[day] = b
			}
		}
		if len(orders.Items) > 5 {
			recentOrders = orders.Items[:5]
		} else {
			recentOrders = orders.Items
		}
	}

	revenueTrend := make([]dashboardDayRevenue, 0, 30)
	for i := 29; i >= 0; i-- {
		d := nowInStoreTime.AddDate(0, 0, -i).Format("2006-01-02")
		b := dayTotals[d]
		revenueTrend = append(revenueTrend, dashboardDayRevenue{
			Date:    d,
			Gross:   centsToDollars(b.grossCents),
			Refunds: centsToDollars(b.refundsCents),
			Net:     centsToDollars(b.grossCents - b.refundsCents),
		})
	}

	activeProducts := 0
	if products != nil {
		for _, p := range products.Items {
			if p.IsActive {
				activeProducts++
			}
			if p.Stock < 10 {
				lowStock = append(lowStock, p)
			}
		}
	}

	totalUsers := 0
	if users != nil {
		totalUsers = users.Count
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"todayOrders":       todayOrders,
		"todayRevenue":      centsToDollars(todayGrossCents),
		"todayGrossRevenue": centsToDollars(todayGrossCents),
		"todayRefunds":      centsToDollars(todayRefundCents),
		"todayNetRevenue":   centsToDollars(todayGrossCents - todayRefundCents),
		"totalGrossRevenue": centsToDollars(totalGrossCents),
		"totalRefunds":      centsToDollars(totalRefundCents),
		"totalNetRevenue":   centsToDollars(totalGrossCents - totalRefundCents),
		"revenueTrend":      revenueTrend,
		"activeProducts":    activeProducts,
		"totalUsers":        totalUsers,
		"recentOrders":      recentOrders,
		"lowStockProducts":  lowStock,
	})
}

func (h *Handlers) AdminGetProducts(w http.ResponseWriter, r *http.Request) {
	result, err := h.db.GetProducts(r.Context(), "", "", 0)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *Handlers) AdminCreateProduct(w http.ResponseWriter, r *http.Request) {
	var p models.Product
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if p.ProductID == "" {
		p.ProductID = uuid.New().String()
	}
	p.CreatedAt = now()
	p.UpdatedAt = now()
	if p.CompareAtPrice > 0 && p.CompareAtPrice <= p.Price {
		p.CompareAtPrice = 0
	}
	if strings.TrimSpace(p.Name) == "" {
		writeError(w, http.StatusBadRequest, "product name is required")
		return
	}
	productType, err := normalizeProductType(p.ProductType)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	p.ProductType = productType
	packageItems, err := normalizePackageItems(p.PackageItems, p.ProductType, p.ProductID)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	p.PackageItems = packageItems
	if err := normalizeProcurementFields(&p); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if h.productNameTaken(r.Context(), p.Name, "") {
		writeError(w, http.StatusConflict, "a product with this name already exists")
		return
	}

	if err := h.db.PutProduct(r.Context(), &p); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.logAudit(r, "create_product", "product", p.ProductID, fmt.Sprintf("Created product: %s", p.Name))
	writeJSON(w, http.StatusCreated, p)
}

func (h *Handlers) AdminUpdateProduct(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "productId")
	existing, err := h.db.GetProduct(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	beforeJSON, err := json.Marshal(existing)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to snapshot product")
		return
	}
	var beforeSnapshot models.Product
	if err := json.Unmarshal(beforeJSON, &beforeSnapshot); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to snapshot product")
		return
	}

	// Read body once into bytes
	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusBadRequest, "failed to read body")
		return
	}

	var updates models.Product
	if err := json.Unmarshal(bodyBytes, &updates); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Parse raw to detect which fields were explicitly sent
	var raw map[string]json.RawMessage
	json.Unmarshal(bodyBytes, &raw)

	if _, ok := raw["name"]; ok {
		n := strings.TrimSpace(updates.Name)
		if n == "" {
			writeError(w, http.StatusBadRequest, "product name cannot be empty")
			return
		}
		if !strings.EqualFold(n, strings.TrimSpace(existing.Name)) && h.productNameTaken(r.Context(), n, id) {
			writeError(w, http.StatusConflict, "a product with this name already exists")
			return
		}
		existing.Name = n
	}
	if updates.Description != "" {
		existing.Description = updates.Description
	}
	if updates.Category != "" {
		existing.Category = updates.Category
	}
	if updates.Price > 0 && updates.Price != existing.Price {
		existing.PriceHistory = append(existing.PriceHistory, models.PriceHistoryEntry{
			Price:     existing.Price,
			ChangedBy: func() string { uid, _ := r.Context().Value(middleware.UserIDKey).(string); return uid }(),
			ChangedAt: now(),
		})
		existing.Price = updates.Price
	}
	if _, ok := raw["stock"]; ok {
		existing.Stock = updates.Stock
	}
	if updates.Images != nil {
		existing.Images = updates.Images
	}
	if len(updates.Tags) > 0 {
		existing.Tags = updates.Tags
	}
	if v, ok := raw["productType"]; ok {
		var s string
		if err := json.Unmarshal(v, &s); err == nil {
			pt, err := normalizeProductType(s)
			if err != nil {
				writeError(w, http.StatusBadRequest, err.Error())
				return
			}
			existing.ProductType = pt
		}
	}
	if _, ok := raw["packageItems"]; ok {
		existing.PackageItems = updates.PackageItems
	}
	if _, ok := raw["purchasedFrom"]; ok {
		existing.PurchasedFrom = updates.PurchasedFrom
	}
	if _, ok := raw["originalUnitPrice"]; ok {
		existing.OriginalUnitPrice = updates.OriginalUnitPrice
	}
	if _, ok := raw["purchasePackQty"]; ok {
		existing.PurchasePackQty = updates.PurchasePackQty
	}
	if _, ok := raw["purchasePackPrice"]; ok {
		existing.PurchasePackPrice = updates.PurchasePackPrice
	}
	if _, ok := raw["isActive"]; ok {
		existing.IsActive = updates.IsActive
	}
	if _, ok := raw["isTaxable"]; ok {
		existing.IsTaxable = updates.IsTaxable
	}
	if updates.Notes != "" {
		existing.Notes = updates.Notes
	}
	if updates.Details != "" {
		existing.Details = updates.Details
	}
	if v, ok := raw["compareAtPrice"]; ok {
		var f float64
		if err := json.Unmarshal(v, &f); err == nil {
			existing.CompareAtPrice = f
		}
	}
	if existing.ProductType == "" {
		existing.ProductType = "product"
	}
	normalizedPackageItems, err := normalizePackageItems(existing.PackageItems, existing.ProductType, existing.ProductID)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	existing.PackageItems = normalizedPackageItems
	if err := normalizeProcurementFields(existing); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	// Drop invalid compare-at (must be strictly above sale price to mean anything).
	if existing.CompareAtPrice > 0 && existing.CompareAtPrice <= existing.Price {
		existing.CompareAtPrice = 0
	}
	existing.UpdatedAt = now()

	if err := h.db.PutProduct(r.Context(), existing); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	diff := formatProductUpdateAudit(&beforeSnapshot, existing)
	h.logAudit(r, "update_product", "product", existing.ProductID,
		fmt.Sprintf("Updated product %q (%s). %s", existing.Name, existing.ProductID, diff))
	writeJSON(w, http.StatusOK, existing)
}

func (h *Handlers) AdminDeleteProduct(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "productId")
	if err := h.db.DeleteProduct(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

var reSafeID = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)

// sanitizeS3PathSegment rejects IDs that could form path traversal sequences.
func sanitizeS3PathSegment(id string) (string, error) {
	id = strings.TrimSpace(id)
	if id == "" || !reSafeID.MatchString(id) {
		return "", fmt.Errorf("invalid id: must contain only alphanumeric characters, hyphens, or underscores")
	}
	return id, nil
}

func (h *Handlers) AdminGetProductImageUploadURL(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "productId")
	cleanID := strings.TrimPrefix(id, "PRODUCT#")
	safeID, err := sanitizeS3PathSegment(cleanID)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	key := fmt.Sprintf("products/%s/%s.jpg", safeID, uuid.New().String())
	url, err := h.db.GetPresignedUploadURL(r.Context(), key)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"uploadUrl": url,
		"imageUrl":  h.db.GetPublicURL(key),
	})
}

func (h *Handlers) AdminGetCategoryImageUploadURL(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "categoryId")
	safeID, err := sanitizeS3PathSegment(id)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	key := fmt.Sprintf("categories/%s/%s.jpg", safeID, uuid.New().String())
	url, err := h.db.GetPresignedUploadURL(r.Context(), key)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"uploadUrl": url,
		"imageUrl":  h.db.GetPublicURL(key),
	})
}

func (h *Handlers) AdminGetCategories(w http.ResponseWriter, r *http.Request) {
	categories, err := h.db.GetCategories(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, categories)
}

// categorySortOrderTaken reports whether sortOrder is already used by a category
// other than excludeCategoryID (pass "" when creating).
func categorySortOrderTaken(categories []models.Category, sortOrder int, excludeCategoryID string) bool {
	for _, c := range categories {
		if excludeCategoryID != "" && c.CategoryID == excludeCategoryID {
			continue
		}
		if c.SortOrder == sortOrder {
			return true
		}
	}
	return false
}

func (h *Handlers) AdminCreateCategory(w http.ResponseWriter, r *http.Request) {
	var c models.Category
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	existing, err := h.db.GetCategories(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	for _, e := range existing {
		if strings.EqualFold(strings.TrimSpace(e.Name), strings.TrimSpace(c.Name)) {
			writeError(w, http.StatusConflict, "a category with this name already exists")
			return
		}
	}
	if categorySortOrderTaken(existing, c.SortOrder, "") {
		writeError(w, http.StatusConflict, "another category already uses this sort order")
		return
	}

	c.CategoryID = uuid.New().String()
	if err := h.db.PutCategory(r.Context(), &c); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.logAudit(r, "create_category", "category", c.CategoryID, fmt.Sprintf("Created category: %s", c.Name))
	writeJSON(w, http.StatusCreated, c)
}

func (h *Handlers) AdminUpdateCategory(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "categoryId")

	existing, err := h.db.GetCategory(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "category not found")
		return
	}

	beforeJSON, err := json.Marshal(existing)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to snapshot category")
		return
	}
	var beforeSnapshot models.Category
	if err := json.Unmarshal(beforeJSON, &beforeSnapshot); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to snapshot category")
		return
	}

	var patch struct {
		Name        *string `json:"name"`
		Description *string `json:"description"`
		ImageURL    *string `json:"imageUrl"`
		SortOrder   *int    `json:"sortOrder"`
		IsActive    *bool   `json:"isActive"`
	}
	if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if patch.Name != nil && strings.TrimSpace(*patch.Name) != strings.TrimSpace(existing.Name) {
		allCats, _ := h.db.GetCategories(r.Context())
		for _, e := range allCats {
			if e.CategoryID != id && strings.EqualFold(strings.TrimSpace(e.Name), strings.TrimSpace(*patch.Name)) {
				writeError(w, http.StatusConflict, "a category with this name already exists")
				return
			}
		}
		existing.Name = *patch.Name
	}
	if patch.Description != nil {
		existing.Description = *patch.Description
	}
	if patch.ImageURL != nil {
		existing.ImageURL = *patch.ImageURL
	}
	if patch.SortOrder != nil {
		existing.SortOrder = *patch.SortOrder
	}
	if patch.IsActive != nil {
		existing.IsActive = *patch.IsActive
	}

	allCats, err := h.db.GetCategories(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if categorySortOrderTaken(allCats, existing.SortOrder, existing.CategoryID) {
		writeError(w, http.StatusConflict, "another category already uses this sort order")
		return
	}

	if err := h.db.PutCategory(r.Context(), existing); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	diff := formatCategoryUpdateAudit(&beforeSnapshot, existing)
	h.logAudit(r, "update_category", "category", existing.CategoryID,
		fmt.Sprintf("Updated category %q (%s). %s", existing.Name, existing.CategoryID, diff))
	writeJSON(w, http.StatusOK, existing)
}

func (h *Handlers) AdminDeleteCategory(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "categoryId")
	if err := h.db.DeleteCategory(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.logAudit(r, "delete_category", "category", id, "Deleted category")
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handlers) AdminGetOrders(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	fromDate := strings.TrimSpace(r.URL.Query().Get("from"))
	toDate := strings.TrimSpace(r.URL.Query().Get("to"))
	orders, err := h.db.GetAllOrders(r.Context(), status)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if fromDate != "" || toDate != "" {
		filtered, err := filterOrdersByCreatedDate(orders.Items, fromDate, toDate)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		orders.Items = filtered
		orders.Count = len(filtered)
	}
	writeJSON(w, http.StatusOK, orders)
}

type adminOrderReconciliationRow struct {
	OrderID                  string `json:"orderId"`
	OrderNumber              string `json:"orderNumber"`
	CustomerName             string `json:"customerName,omitempty"`
	CustomerEmail            string `json:"customerEmail,omitempty"`
	Status                   string `json:"status"`
	PaymentStatus            string `json:"paymentStatus,omitempty"`
	CreatedAt                string `json:"createdAt"`
	PaidAt                   string `json:"paidAt,omitempty"`
	Currency                 string `json:"currency"`
	OrderSubtotalCents       int64  `json:"orderSubtotalCents"`
	OrderShippingCents       int64  `json:"orderShippingCents"`
	OrderTaxCents            int64  `json:"orderTaxCents"`
	OrderTotalCents          int64  `json:"orderTotalCents"`
	OrderRefundedCents       int64  `json:"orderRefundedCents"`
	StripePaymentIntentID    string `json:"stripePaymentIntentId,omitempty"`
	StripeChargeID           string `json:"stripeChargeId,omitempty"`
	StripeChargeStatus       string `json:"stripeChargeStatus,omitempty"`
	StripeAmountCents        int64  `json:"stripeAmountCents,omitempty"`
	StripeCapturedCents      int64  `json:"stripeCapturedCents,omitempty"`
	StripeRefundedCents      int64  `json:"stripeRefundedCents,omitempty"`
	StripeFeeCents           int64  `json:"stripeFeeCents,omitempty"`
	StripeNetCents           int64  `json:"stripeNetCents,omitempty"`
	StripeBalanceTxnID       string `json:"stripeBalanceTransactionId,omitempty"`
	StripeBalanceTxnStatus   string `json:"stripeBalanceTransactionStatus,omitempty"`
	StripeBalanceTxnType     string `json:"stripeBalanceTransactionType,omitempty"`
	StripeAvailableOn        string `json:"stripeAvailableOn,omitempty"`
	DiscrepancyCents         int64  `json:"discrepancyCents"`
	EstimatedNetAfterRefunds int64  `json:"estimatedNetAfterRefundsCents"`
	Notes                    string `json:"notes,omitempty"`
}

func moneyCents(v float64) int64 {
	return int64(math.Round(v * 100))
}

func stripeUnixTime(sec int64) string {
	if sec <= 0 {
		return ""
	}
	return time.Unix(sec, 0).UTC().Format(time.RFC3339)
}

func (h *Handlers) AdminGetOrderReconciliation(w http.ResponseWriter, r *http.Request) {
	if !stripeutil.IsInitialized() {
		writeError(w, http.StatusInternalServerError, "stripe is not configured")
		return
	}

	fromDate := strings.TrimSpace(r.URL.Query().Get("from"))
	toDate := strings.TrimSpace(r.URL.Query().Get("to"))
	limit := 200
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n <= 0 {
			writeError(w, http.StatusBadRequest, "limit must be a positive number")
			return
		}
		if n > 500 {
			n = 500
		}
		limit = n
	}

	orders, err := h.db.GetAllOrders(r.Context(), "")
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	items := orders.Items
	if fromDate != "" || toDate != "" {
		items, err = filterOrdersByCreatedDate(items, fromDate, toDate)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	if len(items) > limit {
		items = items[:limit]
	}

	rows := make([]adminOrderReconciliationRow, 0, len(items))
	for _, order := range items {
		customerName := strings.TrimSpace(order.UserName)
		if customerName == "" && strings.TrimSpace(order.UserID) != "" {
			if user, err := h.db.GetUser(r.Context(), order.UserID); err == nil && user != nil {
				customerName = strings.TrimSpace(user.Name)
			}
		}
		row := adminOrderReconciliationRow{
			OrderID:            strings.TrimPrefix(order.OrderID, "ORDER#"),
			OrderNumber:        order.OrderNumber,
			CustomerName:       customerName,
			CustomerEmail:      order.UserEmail,
			Status:             order.Status,
			PaymentStatus:      order.PaymentStatus,
			CreatedAt:          order.CreatedAt,
			PaidAt:             order.PaidAt,
			Currency:           strings.ToUpper(order.Currency),
			OrderSubtotalCents: moneyCents(order.Subtotal),
			OrderShippingCents: moneyCents(order.ShippingFee),
			OrderTaxCents:      moneyCents(order.Tax),
			OrderTotalCents:    moneyCents(order.Total),
			OrderRefundedCents: order.RefundedAmountCents,
		}
		row.StripePaymentIntentID = strings.TrimSpace(order.StripePaymentIntentID)
		row.StripeChargeID = strings.TrimSpace(order.StripeChargeID)

		if row.StripeChargeID == "" && row.StripePaymentIntentID != "" {
			pi, err := paymentintent.Get(row.StripePaymentIntentID, nil)
			if err != nil {
				row.Notes = "Could not load Stripe PaymentIntent: " + err.Error()
				rows = append(rows, row)
				continue
			}
			if pi.LatestCharge != nil {
				row.StripeChargeID = pi.LatestCharge.ID
			}
			if row.StripeChargeID == "" {
				row.Notes = "PaymentIntent has no Stripe charge yet"
				rows = append(rows, row)
				continue
			}
		}

		if row.StripeChargeID == "" {
			row.Notes = "No Stripe charge yet"
			rows = append(rows, row)
			continue
		}

		ch, err := chargeapi.Get(row.StripeChargeID, nil)
		if err != nil {
			row.Notes = "Could not load Stripe charge: " + err.Error()
			rows = append(rows, row)
			continue
		}
		row.StripeChargeStatus = string(ch.Status)
		row.StripeAmountCents = ch.Amount
		row.StripeCapturedCents = ch.AmountCaptured
		row.StripeRefundedCents = ch.AmountRefunded
		row.DiscrepancyCents = row.StripeCapturedCents - row.OrderTotalCents

		if ch.BalanceTransaction != nil && strings.TrimSpace(ch.BalanceTransaction.ID) != "" {
			row.StripeBalanceTxnID = ch.BalanceTransaction.ID
			bt, err := balancetransaction.Get(ch.BalanceTransaction.ID, nil)
			if err != nil {
				row.Notes = "Could not load Stripe balance transaction: " + err.Error()
				rows = append(rows, row)
				continue
			}
			row.StripeFeeCents = bt.Fee
			row.StripeNetCents = bt.Net
			row.StripeBalanceTxnStatus = string(bt.Status)
			row.StripeBalanceTxnType = string(bt.Type)
			row.StripeAvailableOn = stripeUnixTime(bt.AvailableOn)
			row.EstimatedNetAfterRefunds = bt.Net - ch.AmountRefunded
		} else {
			row.Notes = "Stripe charge has no balance transaction yet"
		}

		rows = append(rows, row)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"items": rows,
		"count": len(rows),
		"limit": limit,
	})
}

// filterOrdersByCreatedDate keeps orders whose CreatedAt falls within an inclusive
// UTC calendar-day range. from/to use YYYY-MM-DD; either may be omitted.
func filterOrdersByCreatedDate(orders []models.Order, from, to string) ([]models.Order, error) {
	var fromTime, toTime time.Time
	var err error
	if from != "" {
		fromTime, err = time.ParseInLocation("2006-01-02", from, time.UTC)
		if err != nil {
			return nil, fmt.Errorf("invalid from date: use YYYY-MM-DD")
		}
	}
	if to != "" {
		toTime, err = time.ParseInLocation("2006-01-02", to, time.UTC)
		if err != nil {
			return nil, fmt.Errorf("invalid to date: use YYYY-MM-DD")
		}
		toTime = toTime.Add(24*time.Hour - time.Nanosecond)
	}
	if !fromTime.IsZero() && !toTime.IsZero() && fromTime.After(toTime) {
		return nil, fmt.Errorf("from date must be on or before to date")
	}

	filtered := make([]models.Order, 0, len(orders))
	for _, o := range orders {
		if strings.TrimSpace(o.CreatedAt) == "" {
			continue
		}
		created, err := time.Parse(time.RFC3339, o.CreatedAt)
		if err != nil {
			continue
		}
		created = created.UTC()
		if !fromTime.IsZero() && created.Before(fromTime) {
			continue
		}
		if !toTime.IsZero() && created.After(toTime) {
			continue
		}
		filtered = append(filtered, o)
	}
	return filtered, nil
}

func (h *Handlers) AdminGetOrder(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "orderId")
	order, err := h.db.GetOrder(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, order)
}

// allowedOrderTransitions defines the valid server-side status machine for orders.
// This mirrors the frontend validTransitions map and is the authoritative enforcement
// point — the frontend check can be bypassed by direct API calls.
// "Failed" and "Cancelled" are terminal states set by the system/Stripe webhook;
// admins cannot manually move orders into or out of them via this endpoint.
var allowedOrderTransitions = map[string][]string{
	"Pending":    {"Paid"},
	"Paid":       {"Processing", "Cancelled"},
	"Processing": {"Shipped", "Cancelled"},
	"Shipped":    {"Delivered"},
	"Delivered":  {},
	"Cancelled":  {},
	"Failed":     {},
}

func isValidOrderTransition(from, to string) bool {
	allowed, ok := allowedOrderTransitions[from]
	if !ok {
		return false
	}
	for _, s := range allowed {
		if s == to {
			return true
		}
	}
	return false
}

func (h *Handlers) AdminUpdateOrderStatus(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "orderId")
	order, err := h.db.GetOrder(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	var body struct {
		Status       string `json:"status"`
		CancelReason string `json:"cancelReason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if !isValidOrderTransition(order.Status, body.Status) {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid status transition: %s → %s", order.Status, body.Status))
		return
	}

	if body.Status == "Cancelled" {
		reason := strings.TrimSpace(body.CancelReason)
		if reason == "" {
			writeError(w, http.StatusBadRequest, "cancel reason is required when cancelling an order")
			return
		}
		order.CancelReason = reason
		if strings.TrimSpace(order.CancelledAt) == "" {
			order.CancelledAt = now()
		}
	}

	prevStatus := order.Status
	order.Status = body.Status
	if body.Status == "Delivered" && strings.TrimSpace(order.DeliveredAt) == "" {
		order.DeliveredAt = now()
	}
	// Credit pending reward points the first time an order reaches Delivered.
	if body.Status == "Delivered" && prevStatus != "Delivered" {
		h.recordRewardEarning(r.Context(), order)
	}
	order.UpdatedAt = now()

	if err := h.db.PutOrder(r.Context(), order); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	auditDetail := fmt.Sprintf("Order %s status: %s → %s", order.OrderNumber, prevStatus, body.Status)
	if body.Status == "Cancelled" {
		auditDetail += fmt.Sprintf(" (reason: %s)", order.CancelReason)
	}
	h.logAudit(r, "update_order_status", "order", order.OrderID, auditDetail)
	h.notifyOrderStatus(r.Context(), order, body.Status)
	writeJSON(w, http.StatusOK, order)
}

func (h *Handlers) AdminPatchOrder(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "orderId")
	order, err := h.db.GetOrder(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	var body struct {
		Assignee *string `json:"assignee"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Assignee == nil {
		writeError(w, http.StatusBadRequest, "assignee is required")
		return
	}

	order.Assignee = strings.TrimSpace(*body.Assignee)
	order.UpdatedAt = now()

	if err := h.db.PutOrder(r.Context(), order); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.logAudit(r, "update_order", "order", order.OrderID,
		fmt.Sprintf("Order %s assignee set to %q", order.OrderNumber, order.Assignee))
	writeJSON(w, http.StatusOK, order)
}

func (h *Handlers) AdminFulfillOrder(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "orderId")
	order, err := h.db.GetOrder(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	order.Status = "Shipped"
	order.UpdatedAt = now()

	if err := h.db.PutOrder(r.Context(), order); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.notifyOrderStatus(r.Context(), order, "Shipped")
	writeJSON(w, http.StatusOK, order)
}

// refundWindowDays is the number of days after payment (or order creation if unpaid timestamp missing)
// during which an admin can issue a Stripe refund for a captured charge.
const refundWindowDays = 15

func parseOrderTimestamp(s string) (time.Time, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}, false
	}
	if t, err := time.Parse(time.RFC3339Nano, s); err == nil {
		return t, true
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t, true
	}
	return time.Time{}, false
}

// refundWindowStart returns the instant the refund countdown begins (paid time preferred).
func refundWindowStart(o *models.Order) (time.Time, bool) {
	if o == nil {
		return time.Time{}, false
	}
	if t, ok := parseOrderTimestamp(o.PaidAt); ok {
		return t, true
	}
	if t, ok := parseOrderTimestamp(o.CreatedAt); ok {
		return t, true
	}
	return time.Time{}, false
}

func (h *Handlers) AdminRefundOrder(w http.ResponseWriter, r *http.Request) {
	if !stripeutil.IsInitialized() {
		writeError(w, http.StatusInternalServerError, "stripe is not configured")
		return
	}

	orderID := chi.URLParam(r, "orderId")
	order, err := h.db.GetOrder(r.Context(), orderID)
	if err != nil {
		writeError(w, http.StatusNotFound, "order not found")
		return
	}

	var req models.AdminRefundRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if order.PaymentStatus == "authorized" {
		if strings.TrimSpace(order.StripePaymentIntentID) == "" {
			writeError(w, http.StatusBadRequest, "order has no payment intent")
			return
		}
		if _, err := paymentintent.Cancel(order.StripePaymentIntentID, nil); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to cancel authorized payment")
			return
		}
		order.Status = "Cancelled"
		order.PaymentStatus = "cancelled"
		order.UpdatedAt = now()
		if err := h.db.PutOrder(r.Context(), order); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		cancelDetails := fmt.Sprintf(
			"Authorized payment of %s %.2f cancelled for order %s (customer: %s, %s). Stripe payment intent %s cancelled successfully. Initiated by admin.",
			strings.ToUpper(order.Currency), order.Total,
			order.OrderNumber, order.UserName, order.UserEmail,
			order.StripePaymentIntentID,
		)
		h.logAudit(r, "cancel_authorized_payment", "order", order.OrderID, cancelDetails)
		h.notifyOrderStatus(r.Context(), order, "Cancelled")
		writeJSON(w, http.StatusOK, models.AdminRefundResponse{
			RefundedAmountCents: order.RefundedAmountCents,
			RefundID:            "",
			PaymentStatus:       order.PaymentStatus,
		})
		return
	}

	if order.PaymentStatus != "paid" && order.PaymentStatus != "partially_refunded" {
		writeError(w, http.StatusBadRequest, "refund requires a captured payment")
		return
	}

	windowStart, ok := refundWindowStart(order)
	if !ok {
		writeError(w, http.StatusBadRequest, "order has no payment or creation timestamp for refund eligibility")
		return
	}
	if time.Since(windowStart) > time.Duration(refundWindowDays)*24*time.Hour {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("refund window of %d days from payment has passed", refundWindowDays))
		return
	}

	refundType := strings.ToLower(strings.TrimSpace(req.RefundType))
	if refundType != "full" && refundType != "partial" {
		writeError(w, http.StatusBadRequest, "refund_type is required and must be full or partial")
		return
	}

	paidCents := int64(math.Round(order.Total * 100))
	subtotalCents := int64(math.Round(order.Subtotal * 100))
	remaining := paidCents - order.RefundedAmountCents
	if remaining <= 0 {
		writeError(w, http.StatusBadRequest, "order is already fully refunded")
		return
	}

	var amountCents int64
	switch refundType {
	case "full":
		amountCents = remaining
	case "partial":
		amountCents = req.AmountCents
		if amountCents <= 0 {
			writeError(w, http.StatusBadRequest, "partial refund requires a positive amount_cents")
			return
		}
		if amountCents > subtotalCents {
			writeError(w, http.StatusBadRequest, "partial refund cannot exceed order subtotal")
			return
		}
	}
	if amountCents > remaining {
		writeError(w, http.StatusBadRequest, "refund exceeds remaining paid amount")
		return
	}

	reason := strings.TrimSpace(req.Reason)
	if reason == "" {
		reason = "requested_by_customer"
	}
	if reason != "duplicate" && reason != "fraudulent" && reason != "requested_by_customer" {
		writeError(w, http.StatusBadRequest, "invalid refund reason")
		return
	}

	rp := &stripe.RefundParams{
		Amount: stripe.Int64(amountCents),
		Reason: stripe.String(reason),
	}
	if strings.TrimSpace(order.StripeChargeID) != "" {
		rp.Charge = stripe.String(order.StripeChargeID)
	} else if strings.TrimSpace(order.StripePaymentIntentID) != "" {
		rp.PaymentIntent = stripe.String(order.StripePaymentIntentID)
	} else {
		writeError(w, http.StatusBadRequest, "order has no Stripe payment reference")
		return
	}

	rf, err := refund.New(rp)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "refund request failed")
		return
	}

	order.RefundedAmountCents += amountCents
	if order.RefundedAmountCents >= paidCents {
		order.PaymentStatus = "refunded"
	} else {
		order.PaymentStatus = "partially_refunded"
	}
	order.UpdatedAt = now()

	if err := h.db.PutOrder(r.Context(), order); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Persist a Refund record for the admin Refunds page.
	refundRec := &models.Refund{
		RefundID:       uuid.New().String(),
		OrderID:        order.OrderID,
		OrderNumber:    order.OrderNumber,
		UserID:         order.UserID,
		UserEmail:      order.UserEmail,
		UserName:       order.UserName,
		AmountCents:    amountCents,
		Currency:       order.Currency,
		Reason:         reason,
		StripeRefundID: rf.ID,
		Status:         "Initiated",
		Comments:       strings.TrimSpace(req.Comments),
		InitiatedBy:    middleware.GetUserID(r),
		CreatedAt:      now(),
		UpdatedAt:      now(),
	}
	if err := h.db.PutRefund(r.Context(), refundRec); err != nil {
		log.Printf("failed to persist refund record for order %s: %v", order.OrderID, err)
	}

	// Write a detailed audit log entry so admins can trace this refund back to Stripe.
	refundDetails := fmt.Sprintf(
		"%s refund of %s %.2f issued for order %s (customer: %s, %s). Reason: %s. Stripe confirmed refund with ID %s and status %s.",
		map[string]string{"full": "Full", "partial": "Partial"}[refundType],
		strings.ToUpper(order.Currency), float64(amountCents)/100,
		order.OrderNumber, order.UserName, order.UserEmail,
		reason, rf.ID, string(rf.Status),
	)
	if c := strings.TrimSpace(req.Comments); c != "" {
		refundDetails += fmt.Sprintf(" Admin comments: %q.", c)
	}
	h.logAudit(r, "refund_order", "order", order.OrderID, refundDetails)
	h.notifyOrderRefunded(r.Context(), order, refundType == "partial")

	writeJSON(w, http.StatusOK, models.AdminRefundResponse{
		RefundedAmountCents: amountCents,
		RefundID:            rf.ID,
		PaymentStatus:       order.PaymentStatus,
	})
}

// ─── Admin: Refunds ───

func (h *Handlers) AdminListRefunds(w http.ResponseWriter, r *http.Request) {
	refunds, err := h.db.GetRefunds(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"items": refunds,
		"count": len(refunds),
	})
}

func (h *Handlers) AdminGetRefund(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "refundId")
	rec, err := h.db.GetRefund(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, rec)
}

func (h *Handlers) AdminUpdateRefundStatus(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "refundId")
	rec, err := h.db.GetRefund(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	var body struct {
		Status     string `json:"status"`
		AdminNotes string `json:"adminNotes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	allowed := map[string]bool{"Initiated": true, "Processing": true, "Completed": true, "Failed": true}
	if body.Status != "" && !allowed[body.Status] {
		writeError(w, http.StatusBadRequest, "invalid refund status")
		return
	}
	if body.Status != "" {
		rec.Status = body.Status
	}
	if body.AdminNotes != "" {
		rec.AdminNotes = body.AdminNotes
	}
	rec.UpdatedAt = now()
	if err := h.db.PutRefund(r.Context(), rec); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Audit log: record who updated the refund status and any notes.
	updateDetails := fmt.Sprintf(
		"Refund status for order %s (Stripe refund ID: %s, amount: %s %.2f) updated to %s.",
		rec.OrderNumber, rec.StripeRefundID,
		strings.ToUpper(rec.Currency), float64(rec.AmountCents)/100,
		rec.Status,
	)
	if n := strings.TrimSpace(rec.AdminNotes); n != "" {
		updateDetails += fmt.Sprintf(" Admin notes: %q.", n)
	}
	h.logAudit(r, "update_refund_status", "refund", id, updateDetails)

	writeJSON(w, http.StatusOK, rec)
}

func (h *Handlers) AdminCreateUser(w http.ResponseWriter, r *http.Request) {
	var req models.CreateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if strings.TrimSpace(req.Address.Line1) != "" {
		if err := validateAddress(req.Address); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		if err := validateUSZipCityStateMatch(r.Context(), req.Address.Zip, req.Address.City, req.Address.State); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		req.Address.Country = ensureUSCountryCode(req.Address.Country)
	}

	user, err := h.db.CreateUserAsAdmin(r.Context(), req)
	if err != nil {
		msg := err.Error()
		low := strings.ToLower(msg)
		if strings.Contains(low, "already exists") {
			writeError(w, http.StatusConflict, msg)
			return
		}
		if strings.Contains(low, "required") || strings.Contains(low, "must be") || strings.HasPrefix(low, "address ") || strings.Contains(low, "zip must") || strings.Contains(low, "state must") {
			writeError(w, http.StatusBadRequest, msg)
			return
		}
		log.Printf("AdminCreateUser: %v", err)
		writeError(w, http.StatusInternalServerError, msg)
		return
	}

	h.logAudit(r, "create", "user", user.UserID, "email="+user.Email+" userType="+user.UserType)
	if err := h.db.EnrichUserWithCognitoAuth(r.Context(), user); err != nil {
		log.Printf("AdminCreateUser: cognito enrichment failed: %v", err)
	}
	writeJSON(w, http.StatusCreated, user)
}

func (h *Handlers) AdminGetUsers(w http.ResponseWriter, r *http.Request) {
	users, err := h.db.GetUsers(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if users != nil && len(users.Items) > 0 {
		if err := h.db.EnrichUsersWithCognitoAuth(r.Context(), users.Items); err != nil {
			log.Printf("AdminGetUsers: cognito enrichment failed: %v", err)
		}
	}
	writeJSON(w, http.StatusOK, users)
}

func (h *Handlers) AdminGetUser(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "userId")
	user, err := h.db.GetUser(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	if err := h.db.EnrichUserWithCognitoAuth(r.Context(), user); err != nil {
		log.Printf("AdminGetUser: cognito enrichment failed: %v", err)
	}
	writeJSON(w, http.StatusOK, user)
}

func (h *Handlers) AdminUpdateUser(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "userId")
	user, err := h.db.GetUser(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	// Decode raw map first so we can detect which fields were sent (partial update).
	bodyBytes, _ := io.ReadAll(r.Body)
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(bodyBytes, &raw); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	var updates models.User
	_ = json.Unmarshal(bodyBytes, &updates)

	prevActive := user.IsActive

	if _, ok := raw["name"]; ok && updates.Name != "" {
		user.Name = updates.Name
	}
	if _, ok := raw["phone"]; ok {
		user.Phone = updates.Phone
	}
	if _, ok := raw["userType"]; ok {
		ut := strings.ToUpper(strings.TrimSpace(updates.UserType))
		if ut == "B2B" || ut == "B2C" {
			user.UserType = ut
		}
	}
	if _, ok := raw["address"]; ok {
		addr := updates.Address
		if strings.TrimSpace(addr.Line1) != "" {
			if err := validateAddress(addr); err != nil {
				writeError(w, http.StatusBadRequest, err.Error())
				return
			}
			if err := validateUSZipCityStateMatch(r.Context(), addr.Zip, addr.City, addr.State); err != nil {
				writeError(w, http.StatusBadRequest, err.Error())
				return
			}
			addr.Country = ensureUSCountryCode(addr.Country)
		}
		user.Address = addr
	}
	if v, ok := raw["isActive"]; ok {
		var b bool
		if err := json.Unmarshal(v, &b); err == nil {
			user.IsActive = b
		}
	}

	// Role transitions also sync the Cognito "admin" group so the JWT carries
	// the right claims on next login.
	roleChanged := false
	if _, ok := raw["role"]; ok && updates.Role != "" && updates.Role != user.Role {
		newRole := strings.ToLower(strings.TrimSpace(updates.Role))
		if newRole != "admin" && newRole != "customer" {
			writeError(w, http.StatusBadRequest, "role must be 'admin' or 'customer'")
			return
		}
		previous := user.Role
		user.Role = newRole
		roleChanged = true
		if newRole == "admin" {
			if err := h.db.AddUserToAdminGroup(r.Context(), user.Email); err != nil {
				log.Printf("failed to add user %s to admin group: %v", user.Email, err)
			}
		} else {
			if err := h.db.RemoveUserFromAdminGroup(r.Context(), user.Email); err != nil {
				log.Printf("failed to remove user %s from admin group: %v", user.Email, err)
			}
		}
		_ = previous
	}
	_ = roleChanged

	user.UpdatedAt = now()

	if err := h.db.PutUser(r.Context(), user); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if _, ok := raw["isActive"]; ok && user.IsActive != prevActive {
		if err := h.db.AdminSetUserEnabled(r.Context(), user.Email, user.IsActive); err != nil {
			log.Printf("cognito AdminSetUserEnabled(%v) for %s: %v", user.IsActive, user.Email, err)
		}
	}
	writeJSON(w, http.StatusOK, user)
}

// AdminFixCognitoEmail marks email_verified=true in Cognito (for CONFIRMED users who cannot receive reset codes).
func (h *Handlers) AdminFixCognitoEmail(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "userId")
	user, err := h.db.GetUser(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	msg, err := h.db.AdminRepairCognitoAuth(r.Context(), user.Email)
	if err != nil {
		log.Printf("AdminFixCognitoEmail for %s: %v", user.Email, err)
		writeError(w, http.StatusBadRequest, "could not update Cognito: "+err.Error())
		return
	}
	if err := h.db.EnrichUserWithCognitoAuth(r.Context(), user); err != nil {
		log.Printf("AdminFixCognitoEmail enrich: %v", err)
	}
	h.logAudit(r, "update", "user", user.UserID, "cognito auth repaired")
	writeJSON(w, http.StatusOK, map[string]string{"message": msg})
}

func (h *Handlers) AdminDeleteUser(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "userId")
	if err := h.db.DeleteUser(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// stripeKeyMask is the sentinel value returned to admin clients in place of
// the real Stripe publishable key. If the client sends this value back during
// a config update, the stored key is left unchanged.
const stripeKeyMask = "__stripe_pk_set__"

func (h *Handlers) AdminGetConfig(w http.ResponseWriter, r *http.Request) {
	config, err := h.db.GetConfig(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	// Return a masked copy so the real key is never exposed via the admin API.
	masked := *config
	if masked.StripePublishableKey != "" {
		masked.StripePublishableKey = stripeKeyMask
	}
	writeJSON(w, http.StatusOK, &masked)
}

func (h *Handlers) AdminUpdateConfig(w http.ResponseWriter, r *http.Request) {
	// Decode the raw payload first so we can detect which keys the client
	// actually sent. Anything not present is preserved from the existing
	// stored config — this prevents older form versions or partial updates
	// from accidentally blanking out fields they don't know about (e.g. a
	// newly added heroTagline field would otherwise be wiped on every save
	// from any client that hadn't been redeployed yet).
	raw := map[string]json.RawMessage{}
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Drop the Stripe key from the patch if the client sent back the mask
	// sentinel or an empty string — the stored key must be preserved in both
	// cases. A genuine new value (non-empty, non-sentinel) is allowed through.
	if v, ok := raw["stripePublishableKey"]; ok {
		var s string
		if json.Unmarshal(v, &s) == nil && (s == stripeKeyMask || s == "") {
			delete(raw, "stripePublishableKey")
		}
	}

	existing, err := h.db.GetConfig(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if existing == nil {
		existing = &models.StoreConfig{}
	}

	beforeCfgJSON, err := json.Marshal(existing)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to snapshot config")
		return
	}
	var beforeConfigSnapshot models.StoreConfig
	if err := json.Unmarshal(beforeCfgJSON, &beforeConfigSnapshot); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to snapshot config")
		return
	}

	// Re-marshal incoming keys into the existing struct so only provided
	// fields override stored values.
	if len(raw) > 0 {
		patch, err := json.Marshal(raw)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		if err := json.Unmarshal(patch, existing); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
	}

	// Delivery zones: apply explicitly so ZIP lists are never dropped by partial merges.
	if v, ok := raw["deliveryZipCodes"]; ok {
		var zips []string
		if err := json.Unmarshal(v, &zips); err != nil {
			writeError(w, http.StatusBadRequest, "invalid deliveryZipCodes")
			return
		}
		existing.DeliveryZipCodes = normalizeDeliveryZipCodes(zips)
	}
	if v, ok := raw["deliveryZipCodesEnabled"]; ok {
		var enabled bool
		if err := json.Unmarshal(v, &enabled); err != nil {
			writeError(w, http.StatusBadRequest, "invalid deliveryZipCodesEnabled")
			return
		}
		existing.DeliveryZipCodesEnabled = enabled
	}
	if existing.DeliveryZipCodes == nil {
		existing.DeliveryZipCodes = []string{}
	}

	// Log the configuration being saved (for debugging)
	log.Printf("AdminUpdateConfig: saving config with stripeAutoTaxEnabled=%v, taxRate=%.2f, deliveryZipCodesEnabled=%v, deliveryZipCount=%d",
		existing.StripeAutoTaxEnabled, existing.TaxRate, existing.DeliveryZipCodesEnabled, len(existing.DeliveryZipCodes))

	if err := h.db.PutConfig(r.Context(), existing); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	cfgDiff := formatStoreConfigUpdateAudit(&beforeConfigSnapshot, existing)
	h.logAudit(r, "update_config", "config", "store",
		fmt.Sprintf("Updated store configuration. %s", cfgDiff))
	// Return masked so the updated key is never exposed in the response.
	maskedResp := *existing
	if maskedResp.StripePublishableKey != "" {
		maskedResp.StripePublishableKey = stripeKeyMask
	}
	writeJSON(w, http.StatusOK, &maskedResp)
}

func (h *Handlers) AdminGetLogoUploadURL(w http.ResponseWriter, r *http.Request) {
	key := fmt.Sprintf("config/logo-%s.png", uuid.New().String())
	url, err := h.db.GetPresignedUploadURL(r.Context(), key)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"uploadUrl": url,
		"logoUrl":   h.db.GetPublicURL(key),
	})
}

func (h *Handlers) AdminGetHeroImageUploadURL(w http.ResponseWriter, r *http.Request) {
	key := fmt.Sprintf("config/hero-%s.jpg", uuid.New().String())
	url, err := h.db.GetPresignedUploadURL(r.Context(), key)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"uploadUrl": url,
		"imageUrl":  h.db.GetPublicURL(key),
	})
}

func (h *Handlers) AdminGetPromoBgImageUploadURL(w http.ResponseWriter, r *http.Request) {
	key := fmt.Sprintf("config/promo-bg-%s.jpg", uuid.New().String())
	url, err := h.db.GetPresignedUploadURL(r.Context(), key)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"uploadUrl": url,
		"imageUrl":  h.db.GetPublicURL(key),
	})
}

// ─── Coupons ───

func (h *Handlers) AdminGetCoupons(w http.ResponseWriter, r *http.Request) {
	coupons, err := h.db.GetCoupons(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, models.Paginated[models.Coupon]{Items: coupons, Count: len(coupons)})
}

func (h *Handlers) AdminCreateCoupon(w http.ResponseWriter, r *http.Request) {
	var c models.Coupon
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(c.Code) == "" {
		writeError(w, http.StatusBadRequest, "coupon code is required")
		return
	}
	if err := coupondiscount.NormalizeCreate(&c); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	c.CouponID = "COUPON#" + uuid.New().String()
	c.Code = strings.ToUpper(strings.TrimSpace(c.Code))
	c.CreatedAt = now()
	c.UpdatedAt = now()
	if err := h.db.PutCoupon(r.Context(), &c); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	detail := fmt.Sprintf("New coupon code %s was created.", c.Code)
	if c.Description != "" {
		detail += " " + c.Description
	}
	h.emailPromotionAdmin(r.Context(), "New coupon created", detail)
	writeJSON(w, http.StatusCreated, c)
}

func (h *Handlers) AdminUpdateCoupon(w http.ResponseWriter, r *http.Request) {
	couponID := chi.URLParam(r, "couponId")
	existing, err := h.db.GetCoupon(r.Context(), couponID)
	if err != nil {
		writeError(w, http.StatusNotFound, "coupon not found")
		return
	}
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(body, &raw); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	var updates models.Coupon
	if err := json.Unmarshal(body, &updates); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if _, ok := raw["code"]; ok && strings.TrimSpace(updates.Code) != "" {
		existing.Code = strings.ToUpper(strings.TrimSpace(updates.Code))
	}
	if _, ok := raw["description"]; ok {
		existing.Description = updates.Description
	}
	if _, ok := raw["discountType"]; ok {
		existing.DiscountType = strings.ToLower(strings.TrimSpace(updates.DiscountType))
	}
	if _, ok := raw["discountPercent"]; ok {
		existing.DiscountPercent = updates.DiscountPercent
	}
	if _, ok := raw["discountAmount"]; ok {
		existing.DiscountAmount = updates.DiscountAmount
	}
	if _, ok := raw["discountType"]; ok || raw["discountPercent"] != nil || raw["discountAmount"] != nil {
		if err := coupondiscount.NormalizeCreate(existing); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	if _, ok := raw["isActive"]; ok {
		existing.IsActive = updates.IsActive
	}
	if _, ok := raw["oneTimePerUser"]; ok {
		existing.OneTimePerUser = updates.OneTimePerUser
	}
	if _, ok := raw["allowedUserIds"]; ok {
		existing.AllowedUserIDs = updates.AllowedUserIDs
	}
	if _, ok := raw["expiresAt"]; ok {
		existing.ExpiresAt = strings.TrimSpace(updates.ExpiresAt)
	}
	existing.UpdatedAt = now()
	if err := h.db.PutCoupon(r.Context(), existing); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, existing)
}

func (h *Handlers) AdminDeleteCoupon(w http.ResponseWriter, r *http.Request) {
	couponID := chi.URLParam(r, "couponId")
	if err := h.db.DeleteCoupon(r.Context(), couponID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// couponAllowedForUser returns true if the coupon has no user-scope restriction
// or if the user is in the allowed list.
func couponAllowedForUser(c *models.Coupon, userID string) bool {
	if c == nil || len(c.AllowedUserIDs) == 0 {
		return true
	}
	for _, id := range c.AllowedUserIDs {
		if strings.EqualFold(strings.TrimSpace(id), userID) {
			return true
		}
	}
	return false
}

// couponUsableNow returns true when the coupon is within its optional expiry window (RFC3339 ExpiresAt).
func couponUsableNow(c *models.Coupon) bool {
	if c == nil {
		return false
	}
	exp := strings.TrimSpace(c.ExpiresAt)
	if exp == "" {
		return true
	}
	t, err := time.Parse(time.RFC3339, exp)
	if err != nil {
		return false
	}
	return time.Now().UTC().Before(t)
}

func (h *Handlers) ValidateCoupon(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("code")))
	if code == "" {
		writeError(w, http.StatusBadRequest, "code is required")
		return
	}
	if len(code) > 50 || len(code) < 2 {
		writeError(w, http.StatusBadRequest, "invalid coupon code")
		return
	}
	coupon, err := h.db.GetCouponByCode(r.Context(), code)
	if err != nil || coupon == nil {
		writeError(w, http.StatusNotFound, "invalid coupon code")
		return
	}
	if !coupon.IsActive || !couponUsableNow(coupon) {
		writeError(w, http.StatusBadRequest, "invalid coupon code")
		return
	}
	// Optional per-user checks if the request is authenticated.
	userID := middleware.GetUserID(r)
	if userID != "" {
		if !couponAllowedForUser(coupon, userID) {
			writeError(w, http.StatusBadRequest, "this coupon is not available for your account")
			return
		}
		if coupon.OneTimePerUser {
			already, err := h.db.HasUserRedeemedCoupon(r.Context(), userID, coupon.CouponID)
			if err == nil && already {
				writeError(w, http.StatusBadRequest, "you have already used this coupon")
				return
			}
		}
	}
	writeJSON(w, http.StatusOK, coupon)
}

// GetBestCoupon returns the best (highest-discount) coupon currently available
// to the authenticated user. Returns 404 if none apply.
func couponCompareScore(merchandiseSubtotal, shippingFee float64, c *models.Coupon) float64 {
	return coupondiscount.DiscountAmount(merchandiseSubtotal, shippingFee, c)
}

func (h *Handlers) GetBestCoupon(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	subtotal, _ := strconv.ParseFloat(strings.TrimSpace(r.URL.Query().Get("subtotal")), 64)
	if subtotal < 0 {
		subtotal = 0
	}
	config, err := h.db.GetConfig(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load store configuration")
		return
	}
	estimatedShipping := shippingcalc.Fee(subtotal, config)
	coupons, err := h.db.GetCoupons(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	var redeemed map[string]bool
	if userID != "" {
		reds, err := h.db.GetUserCouponRedemptions(r.Context(), userID)
		if err == nil {
			redeemed = make(map[string]bool, len(reds))
			for _, rd := range reds {
				redeemed[rd.CouponID] = true
			}
		}
	}
	var best *models.Coupon
	for i := range coupons {
		c := &coupons[i]
		if !c.IsActive || !couponUsableNow(c) {
			continue
		}
		if !couponAllowedForUser(c, userID) {
			continue
		}
		if c.OneTimePerUser && redeemed[c.CouponID] {
			continue
		}
		if best == nil || couponCompareScore(subtotal, estimatedShipping, c) > couponCompareScore(subtotal, estimatedShipping, best) {
			best = c
		}
	}
	if best == nil {
		writeError(w, http.StatusNotFound, "no coupon available")
		return
	}
	writeJSON(w, http.StatusOK, best)
}
