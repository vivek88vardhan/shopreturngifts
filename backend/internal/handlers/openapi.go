package handlers

import (
	"fmt"
	"net/http"
)

type openAPIOperation struct {
	Summary     string
	Description string
	Tags        []string
	RequiresJWT bool
	AdminOnly   bool
	StatusCode  int
	Parameters  []openAPIParameter
}

type openAPIParameter struct {
	Name        string
	In          string
	Description string
	Required    bool
	SchemaType  string
}

func (h *Handlers) OpenAPISpec(w http.ResponseWriter, r *http.Request) {
	scheme := r.Header.Get("X-Forwarded-Proto")
	if scheme == "" {
		scheme = "https"
		if r.TLS == nil {
			scheme = "http"
		}
	}

	serverURL := "/"
	if r.Host != "" {
		serverURL = fmt.Sprintf("%s://%s", scheme, r.Host)
	}

	withSecurity := func(op openAPIOperation) map[string]interface{} {
		statusCode := op.StatusCode
		if statusCode == 0 {
			statusCode = http.StatusOK
		}

		item := map[string]interface{}{
			"summary":     op.Summary,
			"description": op.Description,
			"tags":        op.Tags,
			"responses": map[string]interface{}{
				fmt.Sprintf("%d", statusCode): map[string]interface{}{"description": http.StatusText(statusCode)},
			},
		}

		if len(op.Parameters) > 0 {
			params := make([]map[string]interface{}, 0, len(op.Parameters))
			for _, p := range op.Parameters {
				schemaType := p.SchemaType
				if schemaType == "" {
					schemaType = "string"
				}
				params = append(params, map[string]interface{}{
					"name":        p.Name,
					"in":          p.In,
					"description": p.Description,
					"required":    p.Required,
					"schema": map[string]interface{}{
						"type": schemaType,
					},
				})
			}
			item["parameters"] = params
		}

		if op.RequiresJWT {
			item["security"] = []map[string][]string{{"bearerAuth": {}}}
		}
		if op.AdminOnly {
			item["x-shopreturngifts-role"] = "admin"
		}

		return item
	}

	// withBody attaches a JSON request body schema to an operation descriptor.
	withBody := func(op openAPIOperation, schema map[string]interface{}) map[string]interface{} {
		item := withSecurity(op)
		item["requestBody"] = map[string]interface{}{
			"required": true,
			"content": map[string]interface{}{
				"application/json": map[string]interface{}{
					"schema": schema,
				},
			},
		}
		return item
	}

	// Schema shorthand helpers.
	strProp := map[string]interface{}{"type": "string"}
	numProp := map[string]interface{}{"type": "number"}
	intProp := map[string]interface{}{"type": "integer", "minimum": 1}
	boolProp := map[string]interface{}{"type": "boolean"}

	obj := func(props map[string]interface{}, required ...string) map[string]interface{} {
		s := map[string]interface{}{"type": "object", "properties": props}
		if len(required) > 0 {
			s["required"] = required
		}
		return s
	}

	arr := func(items map[string]interface{}) map[string]interface{} {
		return map[string]interface{}{"type": "array", "items": items}
	}

	// Named request-body schemas.
	addressSchema := obj(map[string]interface{}{
		"line1": strProp, "line2": strProp, "city": strProp,
		"state": strProp, "zip": strProp, "country": strProp,
	}, "line1", "city", "state", "zip")

	productSchema := obj(map[string]interface{}{
		"name":        strProp,
		"description": strProp,
		"price":       numProp,
		"stock":       intProp,
		"category":    strProp,
		"productType": strProp,
		"packageItems": arr(obj(map[string]interface{}{
			"productId": strProp,
			"qty":       intProp,
		}, "productId", "qty")),
		"purchasedFrom":     strProp,
		"originalUnitPrice": numProp,
		"purchasePackQty":   intProp,
		"purchasePackPrice": numProp,
		"isActive":          boolProp,
		"images":            arr(strProp),
	}, "name", "price")

	categorySchema := obj(map[string]interface{}{
		"name":        strProp,
		"description": strProp,
		"slug":        strProp,
		"isActive":    boolProp,
	}, "name", "slug")

	couponSchema := obj(map[string]interface{}{
		"code":           strProp,
		"discountType":   strProp,
		"discountValue":  numProp,
		"minOrderAmount": numProp,
		"maxUses":        intProp,
		"expiresAt":      strProp,
		"isActive":       boolProp,
	}, "code", "discountType", "discountValue")

	orderItemSchema := obj(map[string]interface{}{
		"productId": strProp,
		"qty":       intProp,
	}, "productId", "qty")

	storeConfigSchema := obj(map[string]interface{}{
		"storeName":            strProp,
		"storeEmail":           strProp,
		"storePhone":           strProp,
		"primaryColor":         strProp,
		"logoUrl":              strProp,
		"heroImageUrl":         strProp,
		"heroTitle":            strProp,
		"heroSubtitle":         strProp,
		"taxRate":              numProp,
		"stripeAutoTaxEnabled": boolProp,
	})

	pathParam := func(name, description string) openAPIParameter {
		return openAPIParameter{
			Name:        name,
			In:          "path",
			Description: description,
			Required:    true,
			SchemaType:  "string",
		}
	}

	queryParam := func(name, description string) openAPIParameter {
		return openAPIParameter{
			Name:        name,
			In:          "query",
			Description: description,
			Required:    false,
			SchemaType:  "string",
		}
	}

	spec := map[string]interface{}{
		"openapi": "3.0.3",
		"info": map[string]interface{}{
			"title":       "ShopReturnGifts API",
			"version":     "1.0.0",
			"description": "OpenAPI specification for all ShopReturnGifts Lambda API endpoints.",
		},
		"servers": []map[string]interface{}{
			{"url": serverURL},
		},
		"paths": map[string]interface{}{
			"/api/openapi.json": map[string]interface{}{
				"get": withSecurity(openAPIOperation{Summary: "Get OpenAPI spec", Description: "Returns the OpenAPI JSON document.", Tags: []string{"docs"}}),
			},
			"/api/docs": map[string]interface{}{
				"get": withSecurity(openAPIOperation{Summary: "API docs UI", Description: "Swagger UI for browsing and testing all API endpoints.", Tags: []string{"docs"}}),
			},
			"/api/auth/login": map[string]interface{}{
				"post": withBody(openAPIOperation{
					Summary:     "Login",
					Description: "Authenticate with email + password and receive a JWT token. Rate-limited to 10 req/min per IP.",
					Tags:        []string{"auth"},
				}, obj(map[string]interface{}{"email": strProp, "password": strProp}, "email", "password")),
			},
			"/api/auth/signup": map[string]interface{}{
				"post": withBody(openAPIOperation{
					Summary:     "Signup",
					Description: "Register a new user account. Rate-limited to 10 req/min per IP.",
					Tags:        []string{"auth"},
					StatusCode:  http.StatusCreated,
				}, obj(map[string]interface{}{"email": strProp, "password": strProp, "name": strProp}, "email", "password", "name")),
			},
			"/api/auth/confirm": map[string]interface{}{
				"post": withBody(openAPIOperation{
					Summary:     "Confirm signup",
					Description: "Confirm user signup with the verification code sent to email.",
					Tags:        []string{"auth"},
				}, obj(map[string]interface{}{"email": strProp, "code": strProp}, "email", "code")),
			},
			"/api/auth/resend-code": map[string]interface{}{
				"post": withBody(openAPIOperation{
					Summary:     "Resend code",
					Description: "Resend the email verification code.",
					Tags:        []string{"auth"},
				}, obj(map[string]interface{}{"email": strProp}, "email")),
			},
			"/api/config/theme": map[string]interface{}{
				"get": withSecurity(openAPIOperation{Summary: "Get theme config", Description: "Get public store configuration and theme.", Tags: []string{"config"}}),
			},
			"/api/products": map[string]interface{}{
				"get": withSecurity(openAPIOperation{
					Summary:     "List products",
					Description: "List active products with optional filters.",
					Tags:        []string{"products"},
					Parameters:  []openAPIParameter{queryParam("category", "Filter by category."), queryParam("search", "Full-text search.")},
				}),
			},
			"/api/products/{productId}": map[string]interface{}{
				"get": withSecurity(openAPIOperation{
					Summary:    "Get product",
					Tags:       []string{"products"},
					Parameters: []openAPIParameter{pathParam("productId", "Product identifier.")},
				}),
			},
			"/api/categories": map[string]interface{}{
				"get": withSecurity(openAPIOperation{Summary: "List categories", Tags: []string{"categories"}}),
			},
			"/api/coupons/validate": map[string]interface{}{
				"get": withSecurity(openAPIOperation{
					Summary:     "Validate coupon",
					Description: "Validate a coupon code. Rate-limited to 30 req/min per IP.",
					Tags:        []string{"coupons"},
					Parameters:  []openAPIParameter{queryParam("code", "Coupon code to validate.")},
				}),
			},
			"/api/stripe/webhook": map[string]interface{}{
				"post": withSecurity(openAPIOperation{
					Summary:     "Stripe webhook",
					Description: "Stripe-signed event webhook. Not for direct client use — Stripe calls this automatically.",
					Tags:        []string{"payments"},
				}),
			},
			"/api/users/me": map[string]interface{}{
				"get": withSecurity(openAPIOperation{Summary: "Get current user", Tags: []string{"users"}, RequiresJWT: true}),
				"put": withBody(openAPIOperation{
					Summary:     "Update current user",
					Description: "Update name and/or phone for the authenticated user.",
					Tags:        []string{"users"},
					RequiresJWT: true,
				}, obj(map[string]interface{}{"name": strProp, "phone": strProp})),
			},
			"/api/users/me/address": map[string]interface{}{
				"put": withBody(openAPIOperation{
					Summary:     "Update address",
					Description: "Update the authenticated user's shipping address.",
					Tags:        []string{"users"},
					RequiresJWT: true,
					StatusCode:  http.StatusNoContent,
				}, addressSchema),
			},
			"/api/orders": map[string]interface{}{
				"get": withSecurity(openAPIOperation{Summary: "List user orders", Tags: []string{"orders"}, RequiresJWT: true}),
				"post": withBody(openAPIOperation{
					Summary:     "Create order",
					Description: "Create a new order. Returns a Stripe client_secret for payment. Rate-limited to 20 req/min per IP.",
					Tags:        []string{"orders"},
					RequiresJWT: true,
					StatusCode:  http.StatusCreated,
				}, obj(map[string]interface{}{
					"items":           arr(orderItemSchema),
					"shippingAddress": addressSchema,
					"couponCode":      strProp,
				}, "items", "shippingAddress")),
			},
			"/api/orders/{orderId}": map[string]interface{}{
				"get": withSecurity(openAPIOperation{
					Summary:     "Get user order",
					Tags:        []string{"orders"},
					RequiresJWT: true,
					Parameters:  []openAPIParameter{pathParam("orderId", "Order identifier.")},
				}),
			},
			"/api/orders/{orderId}/payment/confirm": map[string]interface{}{
				"post": withBody(openAPIOperation{
					Summary:     "Confirm payment",
					Description: "Confirm Stripe payment intent and finalize the order.",
					Tags:        []string{"orders", "payments"},
					RequiresJWT: true,
					Parameters:  []openAPIParameter{pathParam("orderId", "Order identifier.")},
				}, obj(map[string]interface{}{"paymentIntentId": strProp}, "paymentIntentId")),
			},
			"/api/orders/{orderId}/invoice": map[string]interface{}{
				"get": withSecurity(openAPIOperation{
					Summary:     "Download invoice",
					Tags:        []string{"orders"},
					RequiresJWT: true,
					Parameters:  []openAPIParameter{pathParam("orderId", "Order identifier.")},
				}),
			},
			"/api/admin/dashboard": map[string]interface{}{
				"get": withSecurity(openAPIOperation{Summary: "Admin dashboard metrics", Tags: []string{"admin", "dashboard"}, RequiresJWT: true, AdminOnly: true}),
			},
			"/api/admin/products": map[string]interface{}{
				"get": withSecurity(openAPIOperation{Summary: "Admin list products", Tags: []string{"admin", "products"}, RequiresJWT: true, AdminOnly: true}),
				"post": withBody(openAPIOperation{
					Summary:     "Admin create product",
					Tags:        []string{"admin", "products"},
					RequiresJWT: true,
					AdminOnly:   true,
					StatusCode:  http.StatusCreated,
				}, productSchema),
			},
			"/api/admin/products/{productId}": map[string]interface{}{
				"put": withBody(openAPIOperation{
					Summary:     "Admin update product",
					Tags:        []string{"admin", "products"},
					RequiresJWT: true,
					AdminOnly:   true,
					Parameters:  []openAPIParameter{pathParam("productId", "Product identifier.")},
				}, productSchema),
				"delete": withSecurity(openAPIOperation{
					Summary:     "Admin delete product",
					Tags:        []string{"admin", "products"},
					RequiresJWT: true,
					AdminOnly:   true,
					StatusCode:  http.StatusNoContent,
					Parameters:  []openAPIParameter{pathParam("productId", "Product identifier.")},
				}),
			},
			"/api/admin/products/{productId}/image-upload-url": map[string]interface{}{
				"post": withSecurity(openAPIOperation{
					Summary:     "Admin product image upload URL",
					Description: "Get a pre-signed S3 URL to upload a product image directly.",
					Tags:        []string{"admin", "products"},
					RequiresJWT: true,
					AdminOnly:   true,
					Parameters:  []openAPIParameter{pathParam("productId", "Product identifier.")},
				}),
			},
			"/api/admin/categories": map[string]interface{}{
				"get": withSecurity(openAPIOperation{Summary: "Admin list categories", Tags: []string{"admin", "categories"}, RequiresJWT: true, AdminOnly: true}),
				"post": withBody(openAPIOperation{
					Summary:     "Admin create category",
					Tags:        []string{"admin", "categories"},
					RequiresJWT: true,
					AdminOnly:   true,
					StatusCode:  http.StatusCreated,
				}, categorySchema),
			},
			"/api/admin/categories/{categoryId}": map[string]interface{}{
				"put": withBody(openAPIOperation{
					Summary:     "Admin update category",
					Tags:        []string{"admin", "categories"},
					RequiresJWT: true,
					AdminOnly:   true,
					Parameters:  []openAPIParameter{pathParam("categoryId", "Category identifier.")},
				}, categorySchema),
				"delete": withSecurity(openAPIOperation{
					Summary:     "Admin delete category",
					Tags:        []string{"admin", "categories"},
					RequiresJWT: true,
					AdminOnly:   true,
					StatusCode:  http.StatusNoContent,
					Parameters:  []openAPIParameter{pathParam("categoryId", "Category identifier.")},
				}),
			},
			"/api/admin/orders": map[string]interface{}{
				"get": withSecurity(openAPIOperation{
					Summary:     "Admin list orders",
					Tags:        []string{"admin", "orders"},
					RequiresJWT: true,
					AdminOnly:   true,
					Parameters: []openAPIParameter{
						queryParam("status", "Filter by order status."),
						queryParam("from", "Inclusive start date (YYYY-MM-DD) on order createdAt."),
						queryParam("to", "Inclusive end date (YYYY-MM-DD) on order createdAt."),
					},
				}),
			},
			"/api/admin/orders/{orderId}": map[string]interface{}{
				"get": withSecurity(openAPIOperation{
					Summary:     "Admin get order",
					Tags:        []string{"admin", "orders"},
					RequiresJWT: true,
					AdminOnly:   true,
					Parameters:  []openAPIParameter{pathParam("orderId", "Order identifier.")},
				}),
				"patch": withBody(openAPIOperation{
					Summary:     "Admin patch order",
					Description: "Update admin-only order fields such as assignee.",
					Tags:        []string{"admin", "orders"},
					RequiresJWT: true,
					AdminOnly:   true,
					Parameters:  []openAPIParameter{pathParam("orderId", "Order identifier.")},
				}, obj(map[string]interface{}{"assignee": strProp}, "assignee")),
			},
			"/api/admin/orders/{orderId}/status": map[string]interface{}{
				"put": withBody(openAPIOperation{
					Summary:     "Admin update order status",
					Description: "Transition order through Pending → Processing → Shipped → Delivered.",
					Tags:        []string{"admin", "orders"},
					RequiresJWT: true,
					AdminOnly:   true,
					Parameters:  []openAPIParameter{pathParam("orderId", "Order identifier.")},
				}, obj(map[string]interface{}{
					"status":       strProp,
					"cancelReason": strProp,
				}, "status", "cancelReason")),
			},
			"/api/admin/orders/{orderId}/fulfill": map[string]interface{}{
				"put": withSecurity(openAPIOperation{
					Summary:     "Admin fulfill order",
					Description: "Mark order fulfilled and notify customer.",
					Tags:        []string{"admin", "orders"},
					RequiresJWT: true,
					AdminOnly:   true,
					Parameters:  []openAPIParameter{pathParam("orderId", "Order identifier.")},
				}),
			},
			"/api/admin/orders/{orderId}/refund": map[string]interface{}{
				"post": withBody(openAPIOperation{
					Summary:     "Admin refund order",
					Description: "Issue a partial or full refund via Stripe and update order payment status.",
					Tags:        []string{"admin", "orders"},
					RequiresJWT: true,
					AdminOnly:   true,
					Parameters:  []openAPIParameter{pathParam("orderId", "Order identifier.")},
				}, obj(map[string]interface{}{
					"refund_type":  strProp,
					"amount_cents": map[string]interface{}{"type": "integer"},
					"reason":       strProp,
					"comments":     strProp,
				}, "refund_type", "amount_cents")),
			},
			"/api/admin/refunds": map[string]interface{}{
				"get": withSecurity(openAPIOperation{
					Summary:     "Admin list refunds",
					Description: "List all refund records across all orders.",
					Tags:        []string{"admin", "refunds"},
					RequiresJWT: true,
					AdminOnly:   true,
				}),
			},
			"/api/admin/refunds/{refundId}": map[string]interface{}{
				"get": withSecurity(openAPIOperation{
					Summary:     "Admin get refund",
					Description: "Retrieve a single refund record by ID.",
					Tags:        []string{"admin", "refunds"},
					RequiresJWT: true,
					AdminOnly:   true,
					Parameters:  []openAPIParameter{pathParam("refundId", "Refund identifier.")},
				}),
				"put": withBody(openAPIOperation{
					Summary:     "Admin update refund status",
					Description: "Update the refund tracking status or add admin notes.",
					Tags:        []string{"admin", "refunds"},
					RequiresJWT: true,
					AdminOnly:   true,
					Parameters:  []openAPIParameter{pathParam("refundId", "Refund identifier.")},
				}, obj(map[string]interface{}{"status": strProp, "adminNotes": strProp})),
			},
			"/api/admin/users": map[string]interface{}{
				"get": withSecurity(openAPIOperation{Summary: "Admin list users", Tags: []string{"admin", "users"}, RequiresJWT: true, AdminOnly: true}),
			},
			"/api/admin/users/{userId}": map[string]interface{}{
				"get": withSecurity(openAPIOperation{
					Summary:     "Admin get user",
					Tags:        []string{"admin", "users"},
					RequiresJWT: true,
					AdminOnly:   true,
					Parameters:  []openAPIParameter{pathParam("userId", "User identifier.")},
				}),
				"put": withBody(openAPIOperation{
					Summary:     "Admin update user",
					Tags:        []string{"admin", "users"},
					RequiresJWT: true,
					AdminOnly:   true,
					Parameters:  []openAPIParameter{pathParam("userId", "User identifier.")},
				}, obj(map[string]interface{}{"name": strProp, "email": strProp, "phone": strProp, "role": strProp})),
				"delete": withSecurity(openAPIOperation{
					Summary:     "Admin delete user",
					Tags:        []string{"admin", "users"},
					RequiresJWT: true,
					AdminOnly:   true,
					StatusCode:  http.StatusNoContent,
					Parameters:  []openAPIParameter{pathParam("userId", "User identifier.")},
				}),
			},
			"/api/admin/config": map[string]interface{}{
				"get": withSecurity(openAPIOperation{Summary: "Admin get config", Tags: []string{"admin", "config"}, RequiresJWT: true, AdminOnly: true}),
				"put": withBody(openAPIOperation{
					Summary:     "Admin update config",
					Description: "Update full store configuration (colors, labels, tax rate, etc.).",
					Tags:        []string{"admin", "config"},
					RequiresJWT: true,
					AdminOnly:   true,
				}, storeConfigSchema),
			},
			"/api/admin/config/logo-upload-url": map[string]interface{}{
				"post": withSecurity(openAPIOperation{
					Summary:     "Admin logo upload URL",
					Description: "Get a pre-signed S3 URL to upload the store logo.",
					Tags:        []string{"admin", "config"},
					RequiresJWT: true,
					AdminOnly:   true,
				}),
			},
			"/api/admin/config/hero-image-upload-url": map[string]interface{}{
				"post": withSecurity(openAPIOperation{
					Summary:     "Admin hero image upload URL",
					Description: "Get a pre-signed S3 URL to upload the hero banner image.",
					Tags:        []string{"admin", "config"},
					RequiresJWT: true,
					AdminOnly:   true,
				}),
			},
			"/api/admin/coupons": map[string]interface{}{
				"get": withSecurity(openAPIOperation{Summary: "Admin list coupons", Tags: []string{"admin", "coupons"}, RequiresJWT: true, AdminOnly: true}),
				"post": withBody(openAPIOperation{
					Summary:     "Admin create coupon",
					Tags:        []string{"admin", "coupons"},
					RequiresJWT: true,
					AdminOnly:   true,
					StatusCode:  http.StatusCreated,
				}, couponSchema),
			},
			"/api/admin/coupons/{couponId}": map[string]interface{}{
				"put": withBody(openAPIOperation{
					Summary:     "Admin update coupon",
					Tags:        []string{"admin", "coupons"},
					RequiresJWT: true,
					AdminOnly:   true,
					Parameters:  []openAPIParameter{pathParam("couponId", "Coupon identifier.")},
				}, couponSchema),
				"delete": withSecurity(openAPIOperation{
					Summary:     "Admin delete coupon",
					Tags:        []string{"admin", "coupons"},
					RequiresJWT: true,
					AdminOnly:   true,
					StatusCode:  http.StatusNoContent,
					Parameters:  []openAPIParameter{pathParam("couponId", "Coupon identifier.")},
				}),
			},
		},
		"components": map[string]interface{}{
			"securitySchemes": map[string]interface{}{
				"bearerAuth": map[string]interface{}{
					"type":         "http",
					"scheme":       "bearer",
					"bearerFormat": "JWT",
				},
			},
		},
	}

	writeJSON(w, http.StatusOK, spec)
}

func (h *Handlers) OpenAPIDocs(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ShopReturnGifts API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
    <style>
      .auth-banner {
        background: #1a1a2e; color: #e0e0e0; font-family: 'Google Sans', system-ui, sans-serif;
        padding: 14px 20px; font-size: 14px; line-height: 1.6;
      }
      .auth-banner strong { color: #f0c040; }
      .auth-banner code {
        background: #2d2d4e; border-radius: 3px; padding: 1px 5px;
        font-family: monospace; color: #7ec8e3;
      }
    </style>
  </head>
  <body style="margin:0;">
    <div class="auth-banner">
      <strong>How to authenticate:</strong>
      1. Call <code>POST /api/auth/login</code> with <code>{"email":"...","password":"..."}</code> &mdash;
      copy the <code>token</code> from the response.
      &nbsp;&nbsp;
      2. Click the <strong>Authorize 🔒</strong> button above and paste the token.
      &nbsp;&nbsp;
      Admin endpoints are marked <code>x-shopreturngifts-role: admin</code> and require a user in the Cognito <code>admin</code> group.
    </div>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: '/api/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        persistAuthorization: true,
        tryItOutEnabled: true,
        validatorUrl: null,
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
        layout: 'BaseLayout'
      });
    </script>
  </body>
</html>`))
}
