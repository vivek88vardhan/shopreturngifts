package router

import (
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"shopreturngifts-api/internal/handlers"
	"shopreturngifts-api/internal/middleware"
)

// allowedOrigins reads ALLOWED_ORIGINS from the environment (comma-separated)
// and falls back to a safe default. A wildcard "*" is never combined with
// AllowCredentials=true because browsers will reject such responses.
func allowedOrigins() []string {
	raw := strings.TrimSpace(os.Getenv("ALLOWED_ORIGINS"))
	if raw == "" {
		// Blocked by default when not explicitly configured.
		return []string{"https://localhost:8080", "http://localhost:8080"}
	}
	parts := strings.Split(raw, ",")
	origins := make([]string, 0, len(parts))
	for _, p := range parts {
		if o := strings.TrimSpace(p); o != "" {
			origins = append(origins, o)
		}
	}
	return origins
}

// New creates the chi router with all routes.
func New(h *handlers.Handlers, auth *middleware.Auth) *chi.Mux {
	r := chi.NewRouter()

	// Global middleware
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.RequestID)
	r.Use(securityHeaders)
	r.Use(chimw.RequestSize(2 * 1024 * 1024)) // 2 MB body limit
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   allowedOrigins(),
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Authorization", "Content-Type"},
		AllowCredentials: false, // must be false when origins are not fully trusted
		MaxAge:           300,
	}))

	r.Route("/api", func(r chi.Router) {
		// Catch-all preflight handler. The cors middleware already handles
		// OPTIONS for known routes, but API Gateway proxies every request to
		// Lambda — including OPTIONS to paths behind auth middleware or paths
		// that only have GET/POST registered. Without this, chi can return
		// 405 (Method Not Allowed) and the browser blocks the request because
		// the response has no CORS headers. Registering a catch-all OPTIONS
		// inside the /api group (NOT at the root as /api/*, which would
		// conflict with r.Route("/api", ...) and panic on Mount) guarantees
		// a 204 + CORS headers response for any preflight.
		r.Options("/*", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusNoContent)
		})

		r.Get("/openapi.json", h.OpenAPISpec)
		r.Get("/docs", h.OpenAPIDocs)

		// ─── Auth routes (rate-limited: 10 req/min per IP) ───
		r.Group(func(r chi.Router) {
			r.Use(middleware.RateLimitMiddleware(10, time.Minute))
			r.Post("/auth/login", h.Login)
			r.Post("/auth/signup", h.Signup)
			r.Post("/auth/confirm", h.ConfirmSignup)
			r.Post("/auth/resend-code", h.ResendVerificationCode)
			r.Post("/auth/forgot-password", h.ForgotPassword)
			r.Post("/auth/confirm-reset", h.ConfirmForgotPassword)
			r.Post("/auth/google", h.GoogleLogin)
			r.Post("/auth/oauth/callback", h.OAuthCallback)
		})

		// ─── Public routes ───
		r.Get("/config/theme", h.GetTheme)
		r.Get("/products", h.GetProducts)
		r.Get("/products/{productId}", h.GetProduct)
		r.Get("/products/{productId}/feedback", h.GetProductFeedback)
		r.Get("/categories", h.GetCategories)
		r.Post("/stripe/webhook", h.StripeWebhook)
		// Contact form (rate-limited to prevent abuse: 5 req/min per IP)
		r.With(middleware.RateLimitMiddleware(5, time.Minute)).Post("/contact", h.SubmitContact)

		// ─── Authenticated routes ───
		r.Group(func(r chi.Router) {
			r.Use(auth.Middleware)

			r.Get("/users/me", h.GetMe)
			r.Put("/users/me", h.UpdateMe)
			r.Put("/users/me/address", h.UpdateAddress)
			r.With(middleware.RateLimitMiddleware(5, time.Minute)).Put("/users/me/password", h.ChangePassword)

			r.Get("/orders", h.GetOrders)
			r.Get("/orders/{orderId}", h.GetOrder)
			// Order creation is rate-limited (20 req/min) to prevent order spam.
			r.With(middleware.RateLimitMiddleware(20, time.Minute)).Post("/orders", h.CreateOrder)
			r.Post("/orders/{orderId}/payment/confirm", h.ConfirmOrderPayment)
			r.Post("/orders/{orderId}/cancel", h.CancelOrder)
			r.Get("/orders/{orderId}/invoice", h.GetInvoice)

			// Authenticated coupon helpers (per-user awareness).
			r.With(middleware.RateLimitMiddleware(30, time.Minute)).Get("/coupons/validate", h.ValidateCoupon)
			r.Get("/coupons/best", h.GetBestCoupon)

			// Rewards: per-user balance, history, and program config.
			r.Get("/users/me/rewards", h.GetMyRewards)

			r.With(middleware.RateLimitMiddleware(30, time.Minute)).Post("/products/{productId}/ratings", h.PostProductRating)
			r.With(middleware.RateLimitMiddleware(30, time.Minute)).Post("/products/{productId}/comments", h.PostProductComment)

			r.Get("/notifications", h.GetNotifications)
			r.Post("/notifications/read-all", h.MarkAllNotificationsRead)
			r.Post("/notifications/mark-read", h.MarkNotificationsReadBatch)
			r.Patch("/notifications/{notificationId}/read", h.MarkNotificationRead)
		})

		// ─── Admin routes ───
		r.Route("/admin", func(r chi.Router) {
			r.Use(auth.Middleware)
			r.Use(auth.AdminMiddleware)

			r.Get("/dashboard", h.AdminGetDashboard)
			r.Get("/audit-logs", h.AdminGetAuditLogs)

			r.Get("/products", h.AdminGetProducts)
			r.Post("/products", h.AdminCreateProduct)
			r.Put("/products/{productId}", h.AdminUpdateProduct)
			r.Delete("/products/{productId}", h.AdminDeleteProduct)
			r.Post("/products/{productId}/image-upload-url", h.AdminGetProductImageUploadURL)

			r.Get("/categories", h.AdminGetCategories)
			r.Post("/categories", h.AdminCreateCategory)
			r.Put("/categories/{categoryId}", h.AdminUpdateCategory)
			r.Delete("/categories/{categoryId}", h.AdminDeleteCategory)
			r.Post("/categories/{categoryId}/image-upload-url", h.AdminGetCategoryImageUploadURL)

			r.Get("/orders", h.AdminGetOrders)
			r.Get("/order-reconciliation", h.AdminGetOrderReconciliation)
			r.Get("/orders/{orderId}", h.AdminGetOrder)
			r.Put("/orders/{orderId}", h.AdminPatchOrder)
			r.Patch("/orders/{orderId}", h.AdminPatchOrder)
			r.Put("/orders/{orderId}/status", h.AdminUpdateOrderStatus)
			r.Put("/orders/{orderId}/fulfill", h.AdminFulfillOrder)
			r.Post("/orders/{orderId}/refund", h.AdminRefundOrder)

			r.Get("/refunds", h.AdminListRefunds)
			r.Get("/refunds/{refundId}", h.AdminGetRefund)
			r.Put("/refunds/{refundId}", h.AdminUpdateRefundStatus)

			r.Get("/rewards", h.AdminListRewards)
			r.Get("/users", h.AdminGetUsers)
			r.Post("/users", h.AdminCreateUser)
			r.Get("/users/{userId}", h.AdminGetUser)
			r.Get("/users/{userId}/rewards", h.AdminGetUserRewards)
			r.Put("/users/{userId}", h.AdminUpdateUser)
			r.Post("/users/{userId}/fix-cognito-email", h.AdminFixCognitoEmail)
			r.Delete("/users/{userId}", h.AdminDeleteUser)

			r.Post("/rewards/sweep", h.AdminSweepRewards)

			r.Post("/notifications/low-stock-email", h.AdminSendLowStockAlert)

			r.Get("/config", h.AdminGetConfig)
			r.Put("/config", h.AdminUpdateConfig)
			r.Post("/config/logo-upload-url", h.AdminGetLogoUploadURL)
			r.Post("/config/hero-image-upload-url", h.AdminGetHeroImageUploadURL)
			r.Post("/config/promo-bg-image-upload-url", h.AdminGetPromoBgImageUploadURL)

			r.Get("/coupons", h.AdminGetCoupons)
			r.Post("/coupons", h.AdminCreateCoupon)
			r.Put("/coupons/{couponId}", h.AdminUpdateCoupon)
			r.Delete("/coupons/{couponId}", h.AdminDeleteCoupon)

			r.Get("/dealers", h.AdminGetDealers)
			r.Post("/dealers", h.AdminCreateDealer)
			r.Get("/dealers/{dealerId}", h.AdminGetDealer)
			r.Put("/dealers/{dealerId}", h.AdminUpdateDealer)
			r.Delete("/dealers/{dealerId}", h.AdminDeleteDealer)
		})
	})

	return r
}

// securityHeaders adds standard HTTP security headers to every response.
func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("X-XSS-Protection", "0") // modern browsers ignore this; CSP is the correct control
		next.ServeHTTP(w, r)
	})
}
