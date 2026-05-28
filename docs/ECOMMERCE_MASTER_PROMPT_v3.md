# eCommerce Platform — Master Requirements Prompt
**Version:** 2.2  
**Location:** Phoenix, Arizona, USA  
**Stack:** Go · Next.js 14 SSG (S3+CloudFront) · Lambda · API Gateway · DynamoDB · DynamoDB Streams · Cognito · Secrets Manager · IAM · ACM · AWS SAM · GitHub Actions · Stripe · Playwright  
**Purpose:** This document is the single source of truth for the platform. It defines every requirement, feature, data model, API contract, UI specification, test case, and business rule. There is no code in this document — only requirements. Hand this file to any developer, AI coding assistant, or QA engineer as the complete project context.

---

## Table of Contents

1. [Project Identity & Business Context](#1-project-identity--business-context)
2. [Technology Stack Decisions](#2-technology-stack-decisions)
3. [Configuration System — store.config.json](#3-configuration-system--storeconfigjson)
4. [Data Model — DynamoDB Single-Table Design](#4-data-model--dynamodb-single-table-design)
5. [User Registration & Authentication](#5-user-registration--authentication)
6. [Homepage & Storefront](#6-homepage--storefront)
7. [Product Catalog & Inventory](#7-product-catalog--inventory)
8. [Shopping Cart](#8-shopping-cart)
9. [Tax Engine — ZIP Code Based](#9-tax-engine--zip-code-based)
10. [Coupon & Discount Code System](#10-coupon--discount-code-system)
11. [Checkout Flow](#11-checkout-flow)
12. [Payment Processing — Stripe with Delayed Capture](#12-payment-processing--stripe-with-delayed-capture)
13. [Order Management](#13-order-management)
14. [Order Cancellation Policy](#14-order-cancellation-policy)
15. [Delivery & Fulfillment Routing](#15-delivery--fulfillment-routing)
16. [Promotion Banners — Auto-Expiry & Price Revert](#16-promotion-banners--auto-expiry--price-revert)
17. [Subscription — Email & WhatsApp with QR](#17-subscription--email--whatsapp-with-qr)
18. [Notification System — Email & SMS (Async)](#18-notification-system--email--sms-async)
19. [Role-Based Access Control](#19-role-based-access-control)
20. [Analytics & Search Tracking](#20-analytics--search-tracking)
21. [Admin Panel — All Sections](#21-admin-panel--all-sections)
22. [API Reference — All Endpoints](#22-api-reference--all-endpoints)
23. [Test Automation — Cross-Browser Playwright Suite](#23-test-automation--cross-browser-playwright-suite)
24. [Infrastructure & Deployment](#24-infrastructure--deployment)
25. [Cost Estimation](#25-cost-estimation)
26. [Project Structure, Configuration Files & Secret Management](#26-project-structure-configuration-files--secret-management)

---

## 1. Project Identity & Business Context

### 1.1 What This Is

A generic, config-driven eCommerce platform built for a retail store based in **Phoenix, Arizona, USA**. The platform is designed to sell grocery items initially but is architected so that any product category — grocery, clothing, electronics, books, or anything else — can be configured without changing a single line of code. Everything domain-specific lives in the store configuration file.

### 1.2 Business Location

- **City:** Phoenix, Arizona
- **State:** Arizona (AZ)
- **Country:** United States of America
- **Currency:** US Dollars (USD, $)
- **Timezone:** America/Phoenix (MST, UTC−7, no daylight saving time)
- **Phone format:** US E.164 (+1XXXXXXXXXX)
- **Date format:** MM/DD/YYYY
- **ZIP code format:** 5-digit US ZIP (e.g., 85001 for Phoenix downtown)
- **Tax jurisdiction:** Arizona state tax + Maricopa County tax (details in Section 9)

### 1.3 Design Philosophy — Config Over Code

No code change should ever be needed to switch the store's product vertical, change a label, update branding, or onboard a new configuration. Every UI string, every feature flag, every product attribute field, every business rule threshold — all of it lives in a single configuration file called `store.config.json`. A developer updates this file and redeploys it to S3. The platform picks it up within 5 minutes with no code deployment.

The codebase uses only generic vocabulary: `item` (not product), `collection` (not category), `attribute` (not field name). The human-readable labels that appear in the UI — "Product", "Category", "Add to Cart", "Promo Code" — are all values read from the configuration file at runtime.

### 1.4 Initial Product Scope

- Catalog size at launch: approximately 40 to 50 items
- Primary vertical: grocery and fresh produce
- Target customer base: Phoenix metro area residents
- Expected order volume at launch: low to medium (under 5,000 orders per month)
- Growth target: scale to support up to 100,000 orders per month without architecture changes

### 1.5 Phase Plan

**Phase 1 (Launch):** Full storefront (Next.js SSG → S3 + CloudFront), cart, ZIP-based tax, Stripe payments with delayed capture, order management, coupon and discount codes, loyalty points program, inventory tracking with bulk order protection (50% of available stock threshold), 24-hour cancellation policy, Google and Facebook social login support, delivery routing for 25 Phoenix-area ZIP codes, admin panel, role-based access, and analytics event tracking.

**Phase 2 (Post-Launch):** Referral system, Instagram OAuth (pending platform approval), advanced analytics dashboard (Athena/OpenSearch), SQS/SES/SNS notifications, Amazon MCF API integration, Firebase FCM push notifications, and additional payment methods.

---

## 2. Technology Stack Decisions

### 2.1 Backend — Go on AWS Lambda

The backend is written entirely in Go (version 1.22). Each API endpoint is deployed as an individual AWS Lambda function using the `provided.al2023` runtime on the ARM64 architecture. Go was chosen because its binary cold start time is approximately 5 milliseconds — far faster than Node.js or Python for Lambda workloads. Each Lambda binary is 5 to 15 megabytes. No Lambda Layers are used; shared internal packages are compiled into each binary via Go modules.

### 2.2 Database — DynamoDB Single-Table Design

All data lives in a single DynamoDB table per store. DynamoDB was chosen over PostgreSQL because the platform targets low-to-medium traffic (under 50,000 orders per month) where DynamoDB's serverless, pay-per-request model is significantly cheaper than keeping a relational database running at all times. DynamoDB TTL (time-to-live) is used to automatically expire promotion banners and discount codes, triggering price reverts via DynamoDB Streams.

### 2.3 Frontend — React

The frontend is a Next.js 14 application using static site generation (SSG) and static export (`next export`). At build time, Next.js generates static HTML files for all public pages (homepage, catalog, item detail pages). These static files are deployed to S3 and served via CloudFront — no Node.js server is required at runtime. Dynamic pages (cart, checkout, account, admin) are client-side rendered using React hydration. It loads the store configuration on startup and injects it into all components via a React context called ConfigContext. No UI label is hardcoded in the React source — every visible string reads from the configuration.

### 2.4 Payments — Stripe

Stripe is the sole payment processor. The platform uses Stripe's authorize-now/capture-later model: the customer's card is authorized at order time, and the actual charge happens after a configurable delay (default 5 hours). All Stripe operations happen inside Go Lambda functions — the browser never sees the Stripe secret key.

### 2.5 Other Services

- **AWS API Gateway (HTTP API):** Routes all /api/* requests to Lambda functions
- **AWS Cognito:** Manages user accounts, JWT tokens, and authentication flows
- **AWS S3 + CloudFront:** Hosts the Next.js static frontend, stores item images, receipts, QR code images, CSV imports and exports, and the store configuration file
- **AWS SAM (Serverless Application Model):** Defines all infrastructure as code
- **GitHub Actions:** Runs Go unit tests, builds Go Lambda binaries with GOOS=linux GOARCH=arm64, runs sam deploy for the backend, builds the Next.js static bundle, syncs the out/ directory to S3, and invalidates the CloudFront distribution on merge to main
- **Phase 2 services noted for later enablement:** SES/SNS notification delivery, SQS-based notification processing, OpenSearch/Athena analytics expansion, Amazon MCF API integration, and Firebase FCM push notifications

---

## 3. Configuration System — store.config.json

### 3.1 Purpose

This file is the single configuration that makes the platform work for Phoenix, Arizona. It is stored in S3, versioned, and cached in each Lambda's memory for 5 minutes. The React app fetches it from a public Lambda endpoint on startup.

### 3.2 Top-Level Structure — Phoenix Grocery Store

The configuration for the Phoenix store contains the following top-level sections. The values shown are the actual production values for the Phoenix, Arizona launch:

**Store identity:** store ID is "phoenix-grocery", name is the store's display name, domain is the website URL, timezone is "America/Phoenix".

**Branding:** logo URL, favicon URL, primary color (green theme appropriate for grocery), secondary color, accent color, font family (Inter), promotion banner background color (dark green), and banner text color (white).

**Locale:** currency is "USD", currency symbol is "$", language is "en-US", date format is "MM/DD/YYYY", weight unit is "lb" (pounds, appropriate for US grocery).

**Labels (all UI-visible strings):**
- item_singular: "Product"
- item_plural: "Products"
- collection_singular: "Category"
- collection_plural: "Categories"
- cart: "Cart"
- checkout: "Checkout"
- order: "Order"
- orders: "My Orders"
- wishlist: "Wishlist"
- wallet: "Store Credit"
- discount_code: "Promo Code"
- add_to_cart: "Add to Cart"
- buy_now: "Buy Now"
- out_of_stock: "Out of Stock"
- in_stock: "In Stock"
- low_stock: "Only {n} left!"
- delivery_estimate: "Estimated delivery"
- subscribe_title: "Stay in the Loop!"
- subscribe_subtitle: "Get exclusive Phoenix deals and fresh arrivals"
- email_subscribe_cta: "Subscribe via Email"
- whatsapp_cta: "Join our WhatsApp Community"
- whatsapp_qr_alt: "Scan to join our WhatsApp group for deals and updates"
- review_tab: "Reviews"
- description_tab: "Description"
- nutrition_tab: "Nutrition Info"
- ingredients_tab: "Ingredients"

**Item schema attributes** (grocery-specific, all configurable):
- brand (text, filterable)
- weight_lb (number, filterable, unit "lb", required)
- unit_of_sale (select: piece / lb / oz / dozen / pack, required)
- organic (boolean, filterable)
- usda_certified (boolean, filterable)
- country_of_origin (text, filterable)
- allergens (tags, filterable)
- shelf_life_days (number, not filterable)

**Variant dimensions:** pack_size only (e.g., 1 lb / 5 lb / 10 lb bags). No color or size variants for grocery.

**Taxonomy labels:**
- level_1_label: "Department" (e.g., Produce, Dairy, Bakery)
- level_2_label: "Category" (e.g., Fresh Fruits, Leafy Greens)
- level_3_label: "Sub-category" (e.g., Tropical Fruits)

**Homepage sections** (in order, all toggleable):
1. promotion_ticker (enabled)
2. hero_banners (enabled, max 3 slides)
3. featured_collections (enabled, max 8)
4. deal_items (enabled, max 12)
5. new_arrivals (enabled, max 10)
6. subscription_bar (enabled)

**Promotion banner defaults:**
- enabled: true
- scroll_speed_ms: 3000
- background_color: dark green
- text_color: white
- Fallback messages (shown when no active promotions): "Free delivery on orders over $49", "Fresh produce restocked daily by 8 AM", "Use code WELCOME10 for 10% off your first order"

**Subscription:**
- Email: enabled, provider SES, double opt-in required
- WhatsApp: enabled, group_invite_url (configurable), qr_image_url (configurable S3 path), qr_image_alt text

**Discount codes:** enabled, max 1 use per user by default, label "Promo Code"

**Order statuses** (fully configurable including label and allowed transitions):
- placed → confirmed or cancelled
- confirmed → packed or cancelled
- packed → dispatched
- dispatched → delivered
- delivered → returned
- cancelled → (terminal)
- returned → (terminal)
- pending_cancellation → cancelled or confirmed (used for bulk order admin review)

**Shipping:**
- Internal ZIP codes: up to 25 Phoenix metro ZIP codes (see Section 15)
- Overflow provider: amazon_mcf
- Free delivery threshold: $49.00
- Standard delivery fee: $4.99

**Tax engine:**
- Mode: zip_based
- Arizona state base rate: 5.6%
- Maricopa County additional: 0.7%
- Phoenix city additional: 2.0% (varies by ZIP — see Section 9)
- Some grocery items exempt from state tax under Arizona Revised Statutes

**Payment:**
- Stripe (publishable key stored in config, secret key in AWS Secrets Manager)
- Accepted methods: card, Apple Pay, Google Pay
- Capture mode: delayed
- Capture delay: 5 hours (configurable by admin, max 7 days)

**Order policy:**
- Cancellation window: 24 hours
- Bulk order threshold: 50% of the total available stock of any single item in the order. If a customer orders more than 50% of the current available stock of any line item, the order is classified as a bulk order and requires admin approval for cancellation.
- Bulk cancellation requires admin approval: true
- No minimum order amount

**Registration:**
- Required fields: first_name, and either email or phone (not both required)
- Social login: Google and Facebook support is available in Phase 1 behind `features.social_login`; Instagram remains Phase 2
- OTP login: enabled

**Notifications (per event, per channel):**
- order_placed: email + SMS
- order_confirmed: email + SMS + push
- order_dispatched: email + SMS + push
- order_delivered: email + push
- order_cancelled: email + SMS
- payment_captured: email only

**Features (all boolean toggles):**
- guest_checkout: true
- wishlist: true
- reviews: true
- wallet: true (store credit)
- loyalty_points: true
- referral: false (Phase 2)
- social_login: false by default at launch (Google/Facebook support exists in Phase 1; Instagram remains Phase 2)
- otp_login: true
- infinite_scroll: true
- promotion_banner: true
- subscription: true
- discount_codes: true
- tax_engine: true
- delayed_capture: true
- analytics: true
- rbac: true

**SEO:**
- Default meta title: store name + tagline
- Meta description: short description of the store
- OG image: store's social sharing image URL

### 3.3 How Labels Flow

Every React component reads labels via a custom `useConfig()` hook. The button on the item page that reads "Add to Cart" renders the value of `config.labels.add_to_cart` — not the literal string "Add to Cart". Changing that label in the config file changes the text on every button across the entire site immediately. The same principle applies to every piece of visible text: headings, field labels, badge text, toast messages, CTA copy, empty state messages, form placeholders.

---

## 4. Data Model — DynamoDB Single-Table Design

### 4.1 Table Setup

One DynamoDB table per store, named `ecommerce-{store_id}`. Billing mode is on-demand (pay per request). TTL is enabled on the `ttl` attribute (Unix timestamp). DynamoDB Streams are enabled with NEW_AND_OLD_IMAGES so that deletions caused by TTL expiry can trigger Lambda functions for price revert and payment capture.

### 4.2 Global Secondary Indexes

Two GSIs are defined:
- **GSI1:** Partition key = GSI1-PK, Sort key = GSI1-SK. Used for reverse lookups (e.g., find all orders for a user, find all items in a collection)
- **GSI2:** Partition key = GSI2-PK (used for email and SKU lookups)

### 4.3 Entity Key Patterns

Every entity follows the pattern `ENTITY_TYPE#{identifier}` for primary keys. Related items belonging to the same entity share the same partition key and use sort key prefixes to differentiate types. This keeps related reads to a single DynamoDB Query rather than multiple GetItem calls.

The entities and their key patterns are:

**Item (product):** PK = ITEM#{id}, SK = META. GSI1 groups items by collection. Variant records share the same PK but use SK = VARIANT#{variant_id}. Image records use SK = IMG#{image_id}. Review records use SK = REVIEW#{review_id}.

**Collection:** PK = COLL#{id}, SK = META. GSI1 builds the full collection tree under STORE#root.

**User:** PK = USER#{id}, SK = PROFILE. GSI2 allows lookup by email. Address records share PK but use SK = ADDR#{addr_id}. Wishlist items use SK = WISH#{item_id}. Wallet uses SK = WALLET. Wallet transactions use SK = WTXN#{timestamp}.

**Cart:** PK = CART#{user_id or session_id}, SK = META for the cart header, SK = ITEM#{item_id}#{variant_id} for each line item. Cart records have a TTL set to 7 days. Guest carts use a session ID stored in the browser.

**Order:** PK = ORDER#{id}, SK = META for the order header. GSI1 allows listing all orders for a user via USER#{user_id}. Line items use SK = ITEM#{line_id}. Status history events use SK = EVENT#{timestamp}. The order header stores a snapshot of the delivery address and a snapshot of each item's name and price at time of purchase — so historical orders always show the price the customer paid even if the item price changes later.

**Banner / Promotion:** PK = BANNER#{id}, SK = META. GSI1 groups all banners under STORE#banners. The `ttl` attribute is set to the Unix timestamp of `expires_at`. When DynamoDB TTL fires, it removes the record and triggers the Streams Lambda to revert prices. The record stores `original_prices` as a map of item_id → price_before_promotion, which the revert Lambda uses to restore prices.

**Discount Code:** PK = DISC#{code}, SK = META. GSI1 groups all codes under STORE#discounts. Usage records for per-user limit tracking use SK = USAGE#{user_id}#{order_id}. The `ttl` attribute matches `expires_at` for automatic expiry.

**Capture Job (delayed payment):** PK = CAPJOB#{order_id}, SK = META. The `ttl` is set to the scheduled capture time. When DynamoDB TTL fires, the Streams Lambda captures the Stripe payment intent.

**ZIP Tax Rate:** PK = TAX#ZIP#{zip_code}, SK = CAT#{tax_category}. Stores the tax rate as a decimal (e.g., 0.086 for 8.6%). A separate record TAXCAT#{key} defines each tax category.

**Subscriber:** PK = SUB#{email or phone}, SK = META. GSI1 groups all subscribers under STORE#subs.

**Analytics Event:** PK = EVENT#{user_or_session_id}, SK = {timestamp}#{event_type}. Daily aggregates are written to S3 by a scheduled Lambda.

### 4.4 Data Integrity Rules

Stock reservation happens atomically using DynamoDB conditional expressions when an order is created — if the stock is insufficient, the TransactWrite fails and the order is not created. The `reserved_stock` counter is incremented at order creation and decremented when payment is captured or the order is cancelled. `available_stock` is always computed as `stock` minus `reserved_stock` and is never stored directly.

---

## 5. User Registration & Authentication

### 5.1 Registration Requirements

Registration must feel instant — the goal is completion in under 3 seconds from form submit to logged-in state. The only required fields at sign-up are:

- First name
- Either an email address or a US mobile phone number (at least one is mandatory; both can be provided but neither is required if the other is present)
- Password (minimum 8 characters, at least one uppercase, one number)

Last name, delivery address, and all other profile data are collected lazily — at first checkout or via the profile settings page. No lengthy forms, no optional fields shown upfront, no friction.

### 5.2 Authentication Paths

**Email + password:** The standard path. After sign-up, a confirmation token is generated and stored in DynamoDB. Email delivery is Phase 2 (SES). Phase 1 returns the token in the API response for testing. The user can browse and add to cart without verifying, but must verify before placing an order.

**Phone + OTP:** The user enters their US mobile number. A 6-digit OTP is generated and stored in DynamoDB (10-minute TTL). Phase 1 returns the OTP directly in the API response for development/testing. SNS SMS delivery is Phase 2. The OTP is valid for 10 minutes. After verifying, the account is active. No password is required for OTP-registered users — they always sign in with OTP.

**Social login (Phase 1):** Google and Facebook OAuth via Cognito hosted UI. Cognito handles the OAuth flow, token exchange, and user pool creation for social sign-ins. The frontend shows Google and Facebook login buttons when `features.social_login` is true. Instagram OAuth remains wired for a later phase pending platform approval.

### 5.3 Session Management

AWS Cognito issues a JWT access token (valid 1 hour) and a refresh token (valid 30 days). The React app stores tokens in memory (not localStorage — for XSS security). On page reload, the app uses the refresh token stored in a secure httpOnly cookie to get a new access token. Guest sessions use a randomly generated session ID stored in sessionStorage.

### 5.4 User Profile

A user profile stores: user ID (UUID), first name, last name (optional), email (nullable), mobile number (nullable, E.164 US format), email_verified flag, phone_verified flag, registration method, registration date, role (customer / supervisor / admin / super_admin), account status (active / blocked / deleted).

### 5.5 Multi-Role System

See Section 19 for full RBAC specification. Every user has exactly one role. The default role for a new registration is "customer".

---

## 6. Homepage & Storefront

### 6.1 Page Structure

The homepage renders sections in the order defined by `homepage_sections` in the config. Sections that are disabled in config do not render. The order can be rearranged without code changes.

### 6.2 Promotion Ticker (Full Width Strip)

A full-width scrolling strip sits above the main navigation header and is always visible on all pages, not just the homepage. It cycles through messages from active promotions. The scroll speed is configurable. Each message can optionally be a hyperlink to a catalog or item page. When a promotion expires, its message is automatically removed from the ticker. If no active promotions exist, the ticker displays the static fallback messages defined in the config. The ticker can be dismissed by the user by clicking an X button — the dismissed state is stored in sessionStorage so it reappears on a new browser session. If `features.promotion_banner` is false, the ticker does not render at all.

### 6.3 Hero Banner Carousel

Up to 3 hero banner slides. Each slide has an image, an optional headline, an optional subheadline, and an optional call-to-action button with a configurable link. Slides auto-advance every 5 seconds. Manual navigation arrows and dot indicators are present. On mobile, the carousel is touch-swipeable.

### 6.4 Featured Collections Grid

A grid of collection cards showing the store's top-level departments (up to 8). Each card shows the collection image and name. Clicking navigates to the catalog page filtered to that collection.

### 6.5 Deal Items Row

A horizontal scrolling row of up to 12 items currently on promotion. Each item card shows the item image, name, original price struck through, promotion price, and discount percentage badge. Tapping the card navigates to the item detail page.

### 6.6 New Arrivals Row

A horizontal scrolling row of up to 10 recently added items, sorted by creation date descending.

### 6.7 Subscription Bar

See Section 17 for full specification.

---

## 7. Product Catalog & Inventory

### 7.1 Item Card

Each item is displayed as a card containing: primary image, item name, brand (if configured as visible), selling price, original/compare price (shown struck through if a promotion is active), discount percentage badge, unit of sale label, add-to-cart button, and a wishlist heart icon. Low stock items show a "Only N left!" badge using the label from config. Out-of-stock items show the out_of_stock label and the add-to-cart button is disabled.

### 7.2 Catalog / Browse Page

The catalog page supports filtering, sorting, and pagination. Filters are generated dynamically from the item schema attributes in the config — only attributes marked `filterable: true` appear as filters. There is always a price range slider filter regardless of the item schema. A toggle filter for "In Stock Only" is always present.

Sort options: Relevance (default), Price: Low to High, Price: High to Low, Newest, Best Selling, Highest Rated. Sort options are configurable in the config.

Pagination is configurable between traditional page numbers and infinite scroll via the `infinite_scroll` feature flag.

### 7.3 Item Detail Page

The item detail page contains:
- Image gallery: primary image large, thumbnails below, tap to switch, pinch-to-zoom on mobile
- Item name, brand (if shown)
- Selling price (current), compare price (struck through if different from selling price), discount badge
- Dynamic attribute display: all attributes from the item schema render here. For grocery this means weight, unit of sale, organic badge, USDA certified badge, country of origin, allergens. For a different vertical configured later, completely different attributes render without any code changes.
- Variant selectors: one dropdown or button group per variant dimension in the config. For grocery this is pack size only.
- Quantity stepper: increment/decrement, respects the item's `max_order_qty` as the upper limit, minimum 1, disabled at minimum
- Add to Cart button (primary CTA)
- Buy Now button (secondary CTA — adds to cart and immediately redirects to checkout)
- Stock status indicator
- Wishlist toggle button
- Delivery estimate checker: postcode input + check button shows estimated delivery window based on ZIP zone config
- Tab navigation: Description, Nutrition Info, Ingredients, Reviews (tab names and presence configured per store)
- Reviews section: aggregate star rating, star distribution chart, review list with pagination, review submission form (authenticated users only)
- Related items row (same collection or shared attributes)

### 7.4 Inventory Fields Per Item Variant

Every item variant tracks:
- `stock`: current quantity on hand
- `reserved_stock`: quantity reserved by in-progress orders (not yet paid or cancelled)
- `max_order_qty`: maximum units a single customer can order in one transaction for this variant (0 means unlimited). Overrides the global `inventory.global_max_order_qty` from config.
- `low_stock_threshold`: when stock minus reserved_stock falls below this number, the low stock badge shows
- `track_inventory`: boolean — if false, the item always shows as in stock regardless of stock value

### 7.5 Inventory Enforcement

The maximum order quantity per item is enforced at two points:
1. On the frontend: the quantity stepper is capped at `min(available_stock, max_order_qty)`. The user physically cannot set a quantity higher than the limit.
2. On the backend Go Lambda: when adding to cart and again when creating an order, the Lambda checks that the requested quantity does not exceed the available stock minus reserved stock and does not exceed `max_order_qty`. A request that bypasses the frontend UI (e.g., a direct API call) is rejected with an appropriate error code.

### 7.6 Stock Reservation

When an order is created (before payment is confirmed), the ordered quantity is added to `reserved_stock` for each variant. This prevents two customers from ordering the last unit simultaneously. If the order is cancelled or payment fails, the reserved stock is released. If payment is captured successfully, `stock` is decremented by the ordered quantity and `reserved_stock` is decremented by the same amount.

---

## 8. Shopping Cart

### 8.1 Cart Behavior

The cart is persistent: logged-in users have their cart stored in DynamoDB and it follows them across devices. Guest users have their cart stored in DynamoDB keyed to a session ID stored in the browser's sessionStorage. Guest carts expire after 7 days via DynamoDB TTL. When a guest logs in, their guest cart is merged with their account cart.

### 8.2 Cart Contents

Each cart line item stores: item ID, variant ID, quantity, and a snapshot of the unit price at the time it was added (to prevent price changes from silently altering the cart total — the customer sees what they agreed to add). When the customer reaches checkout, the current price is re-fetched and if it differs, the customer is notified with the updated amount.

### 8.3 Cart Totals

All totals are computed server-side by the cart Lambda on every cart modification. The cart object returned to the frontend contains:
- Line items with unit price, quantity, and line total
- Subtotal (sum of all line totals)
- Discount amount (from applied coupon or promotion, broken down by line item if scope is limited)
- Estimated shipping fee (based on default ZIP or last used ZIP, waived if subtotal exceeds the free delivery threshold)
- Estimated tax (based on last used ZIP and item tax categories)
- Grand total
- Applied coupon code and discount scope description if a coupon is applied

### 8.4 No Minimum Order Amount

There is no minimum cart value required to proceed to checkout. This is configured via `order_policy.no_minimum_order_amount: true`.

---

## 9. Tax Engine — ZIP Code Based

### 9.1 Why ZIP-Based Tax

Under Arizona law, sales tax rates vary by city, county, and taxing district. Phoenix has a combined rate different from Scottsdale, Tempe, or Chandler, even though they are all in Maricopa County. Items must be taxed at the rate of the delivery address ZIP code, not the store's location. Additionally, certain food items are exempt from Arizona state sales tax under ARS §42-5102 — but prepared food is not exempt. This makes the tax engine one of the highest-risk components from a compliance perspective.

### 9.2 Tax Categories

The platform defines tax categories that each item is assigned to:
- `standard`: Taxable at full combined rate (applies to non-food, prepared food, snacks)
- `grocery_exempt`: Exempt from Arizona state portion of sales tax but subject to city/county rates (applies to unprepared food eligible under ARS §42-5102)
- `fully_exempt`: Zero tax (applies to items like certain medical or WIC-eligible products)

### 9.3 ZIP Tax Rate Records

For each ZIP code that the store delivers to, the admin defines a tax rate record per tax category. For example:
- ZIP 85001, category standard: 8.6% (5.6% state + 0.7% county + 2.3% city of Phoenix)
- ZIP 85001, category grocery_exempt: 2.3% (city rate only — state exempt, county rate varies)
- ZIP 85281, category standard: 8.05% (Tempe city rate differs)

If a ZIP code is not in the database, the system uses the fallback rate defined in config (default 0% — safe but may undercharge; admin should populate all served ZIPs).

### 9.4 Tax Calculation Process

Tax is computed at checkout when the delivery address ZIP is known. The calculation is done by a dedicated Lambda. For each cart line item: the item's tax category is looked up, the ZIP rate for that category is looked up, and the tax amount is `line_total × rate`. The total tax is the sum across all line items. The breakdown per item is stored on the order for audit purposes. Tax is never estimated using the store's own ZIP — it always uses the delivery ZIP.

### 9.5 Per-Item Tax Settings

Each item in the catalog has two tax-related fields set by the admin:
- `taxable`: boolean. If false, the item always has zero tax regardless of ZIP or tax category.
- `tax_category`: one of the defined tax categories (standard, grocery_exempt, fully_exempt).

### 9.6 Admin Tax Management

The admin panel has a dedicated Tax section (`/admin/tax`) where the admin can:
- Look up the current tax rates for any ZIP code
- Add a new ZIP-to-tax-rate mapping
- Edit an existing mapping
- Bulk-import ZIP tax rates from a CSV file (downloaded template matches the required format)
- Export all ZIP tax rate records as a CSV
- View which items are configured as each tax category

---

## 10. Coupon & Discount Code System

### 10.1 Overview

Discount codes are unique alphanumeric strings entered by the customer at cart or checkout. Each code has a precisely defined scope, value, and set of validation rules. Codes are generated by the admin and can optionally be auto-linked to a promotion banner. The system is designed specifically to prevent fraud and bulk-order abuse.

### 10.2 Discount Types

- **Percentage discount:** Reduces the applicable subtotal by a percentage (e.g., 10% off)
- **Fixed amount discount:** Reduces the applicable subtotal by a fixed dollar amount (e.g., $5 off)
- **Free shipping:** Waives the delivery fee regardless of subtotal

### 10.3 Scope — What the Discount Applies To

Each discount code defines what items it applies to:
- **All items:** The discount applies to every item in the cart
- **Specific collection(s):** The discount applies only to items belonging to one or more specified collections
- **Specific items:** The discount applies only to a list of specified item IDs

If the cart contains a mix of in-scope and out-of-scope items, the discount applies only to the in-scope items. The out-of-scope items pay full price.

### 10.4 Product Exclusion Rules — Critical

Certain items are never eligible for coupon discounts. Specifically:
- Items tagged as `featured` in the catalog cannot receive coupon discounts unless the coupon explicitly includes them in its scope
- Each coupon can define an `excluded_item_ids` list of items that are explicitly ineligible even if they fall within the coupon's general scope
- Each coupon can define an `excluded_collection_ids` list of collections ineligible for that coupon

This addresses the meeting requirement: "Coupons CANNOT be applied to existing/featured products."

The `conflict_behavior` field on each coupon controls what happens when a cart contains both eligible and excluded items:
- `apply_to_remaining`: Apply the discount to eligible items only, ignore excluded items
- `reject_if_excluded`: Reject the coupon entirely if any excluded item is in the cart

### 10.5 Validation Rules (All Enforced Server-Side)

Every coupon validation is performed by the Go Lambda — never by the frontend alone. A coupon is valid only when all of the following conditions are true:

1. The code exists in the database and `is_active` is true
2. The current time is between `starts_at` and `expires_at`
3. `used_count` is less than `max_uses_total` (if `max_uses_total` is greater than zero)
4. The cart subtotal is greater than or equal to `min_order_amount`
5. If `first_order_only` is true: the user must have zero prior orders
6. If `max_uses_per_user` is greater than zero: the number of times this user has used this code is less than that limit
7. After applying exclusion rules, at least one item in the cart is eligible for the discount (not all items can be excluded)
8. No individual item's quantity in the cart exceeds `max_qty_per_item` for this coupon
9. The total number of units in the cart does not exceed `max_total_units` for this coupon (prevents bulk order abuse)

### 10.6 Validation Error Codes

When validation fails, the API returns a specific error code so the UI can show a clear, human-readable message:

| Error Code | Meaning | User-Facing Message |
|---|---|---|
| INVALID_CODE | Code not found or inactive | "This promo code is invalid" |
| CODE_EXPIRED | Past expires_at | "This promo code has expired" |
| CODE_NOT_STARTED | Before starts_at | "This promo code isn't active yet" |
| CODE_FULLY_REDEEMED | Hit max_uses_total | "This promo code has been fully redeemed" |
| MIN_ORDER_NOT_MET | Below min_order_amount | "Add $X more to use this code" |
| ALREADY_USED | Hit max_uses_per_user | "You've already used this code" |
| FIRST_ORDER_ONLY | User has prior orders | "This code is for first-time customers only" |
| ITEM_EXCLUDED | All cart items are excluded | "This code doesn't apply to the items in your cart" |
| QTY_EXCEEDS_LIMIT | Item qty over max_qty_per_item | "Reduce quantity to use this code" |
| BULK_ORDER_LIMIT | Total units over max_total_units | "Your order is too large to use this code" |

### 10.7 Discount Code Fields

Each discount code record stores: the unique code string, a description (admin-facing), discount type, discount value, applies_to scope definition, excluded_item_ids, excluded_collection_ids, conflict_behavior, min_order_amount, max_uses_total, used_count (atomic counter), max_uses_per_user, first_order_only flag, max_qty_per_item, max_total_units, starts_at, expires_at, TTL (matches expires_at for automatic DynamoDB cleanup), is_active flag, linked_promo_id (if created by a promotion), created_by admin ID, created_at timestamp.

### 10.8 Usage Tracking

Every successful use of a discount code creates a USAGE record under the DISC# key storing the user ID, order ID, discount amount applied, and timestamp. This is used for per-user limit checking and for admin analytics.

### 10.9 Bulk Code Generation

The admin can generate a batch of unique discount codes in one action — for example, generate 500 single-use codes for a marketing campaign where each code is different but shares the same discount configuration (type, value, scope, expiry).

---

## 11. Checkout Flow

### 11.1 Checkout Steps

Checkout is a linear 3-step flow: Address → Payment → Confirmation. No steps are skippable. The user must be signed in (or check out as a guest if `features.guest_checkout` is true) before reaching the address step.

### 11.2 Step 1 — Delivery Address

The customer selects a saved address or enters a new one. A new address form collects: full name, US phone number, address line 1, address line 2 (optional), city, state (US state, defaults to Arizona), ZIP code (5-digit), country (defaults to United States).

After entering or selecting an address, the system checks the ZIP code against the delivery zones. If the ZIP is in the internal delivery zone (up to 25 Phoenix-area ZIPs), it shows "Same-day or next-day delivery available." If the ZIP is outside the internal zone, it shows "Standard delivery via carrier — estimated 3–5 business days." Either way, the customer can continue.

No ZIP code is rejected as unserviceable — orders to non-internal ZIPs route to Amazon MCF. Only if Amazon MCF is disabled and the ZIP is outside the internal zone would the customer be blocked.

### 11.3 Step 2 — Payment

The order summary (read-only) is shown: items, subtotal, discount if applied, shipping fee, tax breakdown, and grand total. If the cart contains both taxable and tax-exempt items, the tax line shows the blended amount with a "Tax calculated for [ZIP code]" note.

The Stripe Payment Element is embedded. It automatically shows the payment methods configured in the store config (card, Apple Pay, Google Pay). The customer completes payment entry.

When the customer clicks "Place Order," the Go Lambda creates the order record and a Stripe PaymentIntent with `capture_method: manual` (authorize-only, no charge yet). The Stripe client secret is returned to the browser, which calls Stripe's JavaScript SDK to confirm the payment method. On Stripe confirmation success, the browser calls the payment-confirm Lambda which sets the order status to AUTHORIZED and creates the CAPJOB record with a TTL set to `now + capture_delay_hours`.

If Stripe declines the card, the error message from Stripe is displayed inline. The order record is not created for a failed authorization.

### 11.4 Step 3 — Order Confirmation

After payment authorization, the customer is redirected to the confirmation page showing: animated success indicator, order reference number, estimated delivery date, ordered items summary, delivery address, payment method used, and two CTAs — "Track Your Order" and "Continue Shopping."

A receipt download link is also shown (presigned S3 URL to a PDF generated by the order Lambda).

### 11.5 Guest Checkout

If `features.guest_checkout` is true, the checkout flow shows an option to "Continue as Guest" after the auth gate. The guest provides their email address. The order is created without a user ID. After the order is placed, the confirmation page offers "Create an account to track your order" — if the guest creates an account with the same email, their order history is linked.

---

## 12. Payment Processing — Stripe with Delayed Capture

### 12.1 Delayed Capture Model

This is one of the most important business rules in the entire platform. The customer's card is **authorized** (a hold placed) at order time. The card is **not charged** until after the configurable delay. This gives the business time to confirm inventory, process the order, and optionally cancel without any financial transaction occurring.

The default delay is 5 hours. The admin can change this in the admin settings panel. The maximum allowed delay is 7 days (Stripe's maximum for authorized holds).

### 12.2 What Happens to the Customer

The customer sees "Order placed" and their card shows a pending authorization (a hold, not a charge). The hold amount matches the order total. After the delay period, the hold converts to an actual charge. If the order is cancelled within the 24-hour cancellation window and the cancellation happens before the capture job fires, the hold is released — the customer is never charged.

### 12.3 The Capture Job

When an order is authorized, the system creates a CAPJOB DynamoDB record with a TTL set to `current_time + capture_delay_hours`. When DynamoDB TTL fires and removes the CAPJOB record, DynamoDB Streams triggers the payment-capture Go Lambda. That Lambda checks whether the order has been cancelled. If cancelled, it calls Stripe's cancel API — no charge. If not cancelled, it calls Stripe's capture API — the charge is made. Then it updates the order status to PAID, sends the order confirmation email and SMS, and notifies the admin.

### 12.4 Multiple Payment Gateways (Future)

The config structure supports a `gateway` field per payment method configuration, enabling future support for additional gateways (PayPal, Square, etc.) without architectural changes. For Phase 1, Stripe is the only gateway.

### 12.5 Fraud Detection

Stripe Radar is enabled on the Stripe account. The platform passes the customer's email, billing ZIP, and order metadata to Stripe with every PaymentIntent to maximize Radar's effectiveness. The platform also enforces its own fraud prevention:
- Per-order item quantity limits prevent bulk inventory purchases
- Coupon `max_total_units` prevents coupon abuse on large orders
- The 24-hour cancellation window with admin review for bulk orders prevents order manipulation

### 12.6 Chargebacks

When Stripe notifies the platform of a chargeback via webhook, the `stripe-webhook` Lambda updates the order status to DISPUTED and notifies the admin via email. The admin panel shows disputed orders in a separate filter tab.

### 12.7 Stripe Webhook Security

The webhook endpoint (`POST /api/stripe/webhook`) verifies the Stripe signature on every request before processing. Requests without a valid signature return 400 immediately without any processing. The webhook handler is idempotent — processing the same event twice does not double-charge or double-update an order.

---

## 13. Order Management

### 13.1 Order Record

Every order stores: order ID (UUID), order reference number (human-readable, e.g., PHX-2025-00001), user ID (nullable for guest orders), guest email (nullable for registered user orders), status, all ordered items as snapshots (name, SKU, price, quantity at time of purchase), delivery address snapshot, applied discount code and discount amount, shipping fee, tax breakdown, grand total, currency (USD), payment method, Stripe payment intent ID, payment status (authorized / captured / cancelled / disputed / refunded), fulfillment provider (internal or amazon_mcf), carrier tracking number (if available), estimated delivery date, created_at, updated_at.

### 13.2 Order Reference Numbers

Order reference numbers follow the format: `{store_prefix}-{year}-{sequential_number}` padded to 5 digits. For the Phoenix store: `PHX-2025-00001`. These are displayed to customers and in all communications. The underlying order ID is a UUID used for API calls.

### 13.3 Order Status Flow

Status transitions are defined in the config's `order_statuses` array. Only configured transitions are allowed — the Go Lambda rejects any attempt to move an order to a status not in the allowed transitions for the current status. The status history is stored as immutable EVENT records appended to the ORDER# partition key.

### 13.4 Order Tracking

The customer's order detail page shows a visual timeline of status events. Each event shows the status label, the timestamp, and optionally a note (e.g., "Carrier picked up your order" or "Out for delivery — estimated by 6 PM"). If a carrier tracking number has been entered by the admin, a "Track with carrier" link is shown.

### 13.5 Reorder

On any completed order, a "Reorder" button repopulates the cart with all items from that order at current prices. If any item is out of stock or no longer exists, it is skipped and the customer is notified which items could not be reordered.

---

## 14. Order Cancellation Policy

### 14.1 Standard Cancellation Window

Customers can cancel their own orders **within 24 hours of order placement only**. The cancellation button is visible on the order detail page only if:
1. The order status allows cancellation (placed or confirmed — not packed, dispatched, or delivered)
2. The time since order creation is less than 24 hours
3. The order is not a bulk order requiring admin review

After 24 hours, the cancel button is hidden and replaced with a message: "This order can no longer be cancelled. Contact customer support if you need assistance."

The 24-hour window is configurable in the config under `order_policy.cancellation_window_hours`.

### 14.2 Bulk Order Cancellation

Orders where any single line item's ordered quantity meets or exceeds **50% of that item's available stock at the time of order placement** are classified as bulk orders and cannot be self-cancelled. This threshold is defined in config as `order_policy.bulk_order_threshold_pct: 0.5`. For example, if Basmati Rice has 40 units available and a customer orders 20 or more, that order is a bulk order. The threshold applies per item, not across the total cart. When a customer attempts to cancel a bulk order within the 24-hour window, the order is set to `pending_cancellation` status and the admin is notified. The admin then approves or rejects the cancellation in the admin panel.

If approved: the Stripe payment intent is cancelled (if still in AUTHORIZED state), stock reservation is released, and the order is marked CANCELLED. The customer receives an email and SMS confirmation.

If rejected: the order returns to its previous status and the customer receives an email explaining the rejection.

### 14.3 Payment Interaction

If the order is cancelled before the capture job fires (within the delayed capture window), the Stripe authorization is cancelled and the customer is never charged. If the capture has already fired (the charge has been made), cancellation triggers a full refund via Stripe's refund API. Partial refunds can only be issued by an admin.

---

## 15. Delivery & Fulfillment Routing

### 15.1 Internal Delivery Zone — Phoenix Metro

The store handles direct delivery to up to 25 ZIP codes within the Phoenix metropolitan area. These are configured in `fulfillment.internal_zip_codes`. The initial launch covers core Phoenix and nearby ZIP codes including areas of Scottsdale, Tempe, Chandler, and Gilbert that are closest to the store's fulfillment location.

Examples of internal ZIPs (actual values set by admin at launch):
- 85001 through 85008 (central Phoenix)
- 85251, 85254 (Scottsdale)
- 85281, 85282 (Tempe)
- 85224, 85225 (Chandler)

The admin panel shows the current internal ZIP list with a counter showing "X of 25 configured." Adding a 26th ZIP shows a warning: "You have reached the maximum of 25 internal delivery zones. Orders beyond these zones route to Amazon MCF automatically."

### 15.2 Non-Internal ZIP Handling (Phase 1)

Any order with a delivery ZIP code not in the internal list is automatically routed to Amazon Multi-Channel Fulfillment. The `fulfillment_provider` field on the order record is set to `amazon_mcf`. Phase 1: the admin manually arranges fulfillment for non-internal ZIP orders. MCF API integration is Phase 2.

The customer is never shown which fulfillment provider is handling their order — they see only the delivery status and estimated dates.

### 15.3 Delivery Estimate

When a customer enters a ZIP code on the item detail page or during checkout, the system returns:
- Internal zone: "Delivery in 1–2 business days"
- Non-internal ZIP: "Delivery in 3–5 business days (processed manually)"
- Weekend orders: "Processing begins next business day"

---

## 16. Promotion Banners — Auto-Expiry & Price Revert

### 16.1 What a Promotion Is

A promotion is a time-bounded discount applied at the item level. The admin creates a promotion that specifies which items or collections receive a discounted price, by what amount or percentage, and for how long. The discounted price is written directly to the item records. When the promotion expires, the prices are automatically reverted to their original values — no admin action required.

### 16.2 Promotion Scope

The promotion can apply to:
- All items in the store
- All items in one or more specific collections
- A specific list of individual items

### 16.3 Promotion Creation Flow

When an admin creates a promotion, the system:
1. Records the current price of every affected item in an `original_prices` map on the promotion record
2. Writes the new discounted price to each affected item record
3. Creates the promotion BANNER record with a TTL set to the Unix timestamp of `expires_at`
4. If the promotion is linked to a discount code, updates that code's `is_active` to true
5. If the promotion has a ticker message, the message appears in the scrolling banner immediately

### 16.4 Automatic Expiry and Price Revert

When `expires_at` arrives, DynamoDB TTL automatically removes the BANNER record. This triggers a DynamoDB Streams event (REMOVE type) which invokes the `promotions-expire` Go Lambda. That Lambda:
1. Reads the `original_prices` map from the deleted record's old image
2. Writes back the original price to every affected item
3. Marks any linked discount code as inactive
4. Sends an admin notification: "Promotion [name] has expired. Prices reverted for [N] items."

This process is idempotent — writing the original price back twice produces the same result, so retries are safe.

### 16.5 Promotion and Discount Code Interaction

A promotion can optionally auto-generate a discount code. This code gives the same discount as the promotion but must be entered manually by the customer. The code is automatically deactivated when the promotion expires.

Promotions apply at the item price level (the price shown on the item is already the discounted price). Discount codes apply at checkout as a subtraction from the cart total. A customer can potentially benefit from both if the item price has been reduced by a promotion AND they enter a discount code — whether this is allowed or not depends on the discount code's exclusion rules.

### 16.6 Hero Banner Promotions

A promotion can also have an associated hero banner image. The admin uploads an image, and the hero carousel automatically includes that slide for the duration of the promotion. When the promotion expires, the slide is automatically removed.

---

## 17. Subscription — Email & WhatsApp with QR

### 17.1 The Subscription Section

A section on the homepage offers customers two ways to stay connected with the store. The section renders only if `features.subscription` is true. Its position in the page is determined by its position in the `homepage_sections` config array.

The section shows:
- A title (from `config.labels.subscribe_title`): "Stay in the Loop!"
- A subtitle (from `config.labels.subscribe_subtitle`): "Get exclusive Phoenix deals and fresh arrivals"
- Two side-by-side cards on desktop, stacked vertically on mobile

### 17.2 Email Subscription Card

- An email address input field
- A subscribe button (label from `config.labels.email_subscribe_cta`)
- On submit: a POST request to the subscription API creates a subscriber record with status "pending"
- An AWS SES email is sent with a confirmation link (double opt-in)
- The card shows a success state: "Check your inbox to confirm your subscription"
- If the email is already subscribed and confirmed: "You're already subscribed!"
- If the email is already subscribed but pending: "Check your inbox — we sent you a confirmation link"

### 17.3 WhatsApp Subscription Card

- A QR code image loaded from the URL in `config.subscription.whatsapp.qr_image_url`
- Alt text from `config.subscription.whatsapp.qr_image_alt`
- A "Join our WhatsApp Community" button (label from `config.labels.whatsapp_cta`) that is an anchor tag linking to `config.subscription.whatsapp.group_invite_url`
- The button opens the WhatsApp link in a new tab

The WhatsApp card renders only if `config.subscription.whatsapp.enabled` is true.

### 17.4 Updating the WhatsApp Group (Zero Developer Work)

When the WhatsApp group invite link changes (e.g., old group archived, new one created):
1. Create the new WhatsApp group and copy the invite link
2. Generate a QR code image for that URL using any QR code generator
3. Log into the admin panel → Settings → Subscription
4. Upload the new QR image (goes to S3, config is updated with the new URL)
5. Paste the new invite URL into the "WhatsApp Group Invite URL" field
6. Click Save — the config in S3 is updated, the frontend picks it up within 5 minutes
7. No code change, no deployment, no developer needed

### 17.5 Subscriber Data

Each subscriber record stores: channel (email or whatsapp), address (email or phone), status (pending / confirmed / unsubscribed), confirmation token and expiry (for email), source (homepage / checkout / footer), created_at, confirmed_at.

### 17.6 Unsubscribe

Every marketing email sent by the platform includes a one-click unsubscribe link. Clicking it calls the unsubscribe Lambda with a token, which sets the subscriber's status to "unsubscribed". Unsubscribed users are never sent marketing communications again.

---

## 18. Notification System — Email & SMS (Async)

### 18.1 Architecture — Non-Blocking

Notifications are never on the critical path of any user-facing operation. The pattern is:

1. A primary Lambda (e.g., orders-create) completes its core database work
2. It logs a notification intent to DynamoDB (NOTIF# record) as the very last step
3. It returns success to the user immediately — it does not wait for the notification to send
4. A scheduled Lambda (runs every 5 minutes) picks up pending NOTIF# records — Phase 1 placeholder; replaced by SQS queue in Phase 2
5. Phase 1: notification records are stored for future processing. Email and SMS delivery via SES/SNS is a Phase 2 feature.

If notification processing fails, the operation is retried by the scheduler with backoff and can be reviewed by admins. A notification failure **never causes the order or any other core operation to fail**.

### 18.2 Notification Events

The following events trigger notifications. The channels used for each event are configured per-store in the notifications section of the config:

- **order_placed**: Email to customer with order summary. SMS with order reference number. No push (app may not be installed at order time).
- **order_confirmed**: Email + SMS + push. The message tells the customer their order has been confirmed and provides an estimated packing time.
- **order_dispatched**: Email + SMS + push. Includes carrier tracking number if available.
- **order_delivered**: Email + push. Thank-you message with a link to leave a review.
- **order_cancelled**: Email + SMS. Includes reason and, if already captured, refund timeline.
- **payment_captured**: Email only. Confirms the charge has been made and provides final receipt.
- **payment_failed**: Email + SMS. Informs the customer the capture failed and asks them to update payment info.
- **return_request_received**: Email to customer acknowledging the return request.
- **subscription_confirmation**: Email with double opt-in confirmation link.

### 18.3 SMS Specifics

SMS is sent only to US phone numbers in E.164 format (`+1XXXXXXXXXX`). Messages are kept under 160 characters where possible to avoid multi-part SMS charges. SMS opt-out is handled via SNS's built-in STOP keyword support.

---

## 19. Role-Based Access Control

### 19.1 Roles

There are four roles in the system. Every user account has exactly one role.

**Customer:** Can access their own orders, cart, wishlist, profile, wallet, and order history. Cannot access any admin pages.

**Supervisor:** Can view all admin pages including order list, catalog list, reports, and customer list — but in read-only mode. Cannot create, edit, or delete any records. Cannot change order statuses. Cannot access Settings or Promotions pages. This role is for store staff who need visibility but not edit access.

**Admin:** Full access to all admin pages. Can create and edit products, manage promotions and discount codes, change order statuses, manage customers, and update settings. Cannot create or modify other admin accounts.

**Super Admin:** All admin permissions plus the ability to manage admin accounts (promote customers to admin or supervisor, revoke admin access). Also has access to platform-level settings like store config management.

### 19.2 Enforcement

Role enforcement is done in the Go Lambda middleware layer. Every Lambda function that requires authentication calls the auth middleware to verify the JWT and extract the role. Protected admin routes require the `admin` or `super_admin` role. Supervisor-accessible routes require any of `supervisor`, `admin`, or `super_admin`. Any request with insufficient role returns a 403 FORBIDDEN response immediately without executing any business logic.

### 19.3 Admin User Management

The admin panel has a Users section (`/admin/users`) accessible only to super_admin accounts. It shows all user accounts with their name, email, role, and last login date. A super_admin can:
- Change a customer's role to supervisor or admin
- Change a supervisor's role to admin or back to customer
- Revoke an admin's access (return them to customer role)
- Block a customer account (blocked customers cannot sign in)

---

## 20. Analytics & Search Tracking

### 20.1 What Is Tracked

The platform captures user behavior events asynchronously. Events are captured using the browser's `navigator.sendBeacon` API — a fire-and-forget mechanism that does not block the UI and does not fail if the server is unavailable. The events captured are:

- **page_view**: Which page was visited, referrer, and timestamp
- **search**: Search query string, number of results returned, and which item (if any) was clicked from the results
- **item_view**: Item ID, collection it belongs to, and source (search result / catalog browse / direct link / related items)
- **add_to_cart**: Item ID, variant, quantity, price
- **remove_from_cart**: Item ID
- **checkout_started**: Cart value and number of items
- **order_placed**: Order ID, total, number of items, ZIP code, payment method
- **coupon_applied**: Code, discount amount, cart value at time of application
- **coupon_failed**: Code, error code returned

### 20.2 Search Tracking Purpose

Understanding what customers search for helps the admin decide which new products to add, which items to feature prominently, and how to name items so they match customer vocabulary. For example, if customers frequently search "millets" and find no results, the admin knows to add millet products. If customers search "organic apples" and bounce, the item name might need updating.

### 20.3 Data Storage

Events are stored in DynamoDB with a 90-day retention TTL. Daily aggregates are computed by a scheduled Lambda (runs at midnight MST) and written to S3 as JSON files. The S3 files can be queried via AWS Athena for historical analysis.

### 20.4 Analytics Dashboard

The admin analytics page (`/admin/analytics`) shows:
- Top 10 search terms (last 7 or 30 days, selectable)
- Items viewed most often (last 7 or 30 days)
- View-to-cart conversion rate per item
- Cart-to-order conversion rate
- Revenue by ZIP code (map view of Phoenix metro)
- Coupon performance: each code's usage count, total discount given, and revenue from orders that used it
- All charts have a date range picker (defaults to last 30 days)

---

## 21. Admin Panel — All Sections

### 21.1 Navigation Structure

The admin panel is a separate area of the site accessible only to authenticated users with admin, supervisor, or super_admin roles. It is reached at `/admin`. The sidebar navigation shows the sections appropriate to the signed-in user's role (supervisors see read-only sections only).

### 21.2 Dashboard (`/admin`)

The main dashboard shows at a glance:
- Revenue KPI cards: today, this week, this month (actual charges, not just authorizations)
- Orders by status: a donut chart showing counts per status
- Revenue trend: a line chart covering the last 30 days
- Top 5 selling items by revenue
- Low stock alerts: a list of variants where available stock has dropped below the configured threshold
- Recent orders: a live feed of the last 10 orders
- Date range picker refreshes all widgets simultaneously

### 21.3 Catalog Management (`/admin/catalog`)

Displays all items in a data table with columns for: name, SKU, collection, price, stock status, active/inactive status, and last updated date. 

Features:
- Search by item name or SKU
- Filter by collection, stock status, active status
- Sort by any column
- Inline active/inactive toggle — changes take effect immediately
- "Add Item" button opens the item creation form
- Bulk actions: activate selected, deactivate selected, delete selected (soft delete)
- Import from CSV: downloads a template whose columns exactly match the item schema (static fields plus all dynamic attributes from the config's item schema)
- Export to CSV: same format as the import template

**Item creation/editing form:** Contains fixed fields (name, description, SKU, price, compare price, collection assignment, images) plus dynamic fields generated from `item_schema.attributes` in the config. Adding a new attribute to the config immediately adds a new field to this form without any code change. Variant configuration matches the `variant_dimensions` from config.

### 21.4 Collections Management (`/admin/collections`)

A tree view of the collection hierarchy. Collections can be nested to any depth. Drag-and-drop reordering within a level. Each collection has: name, slug (URL-friendly identifier), parent collection, description, image, visibility toggle, SEO fields.

### 21.5 Orders Management (`/admin/orders`)

A table of all orders with columns: order reference, customer name, date, total, payment status, fulfillment status, and items. Filter tabs: All, New, Processing, Dispatched, Delivered, Cancelled, Disputed. Date range filter. Search by order reference or customer email.

Clicking an order opens the order detail panel showing all order information, the status timeline, the payment status, and action buttons. Available actions depend on the current order status and the admin's role. Actions include:
- Change status (to allowed transitions only)
- Add tracking number and carrier name
- Process refund (opens a form with amount pre-filled to the order total but editable for partial refunds)
- Download invoice
- Approve or reject bulk cancellation requests

### 21.6 Inventory (`/admin/inventory`)

A table of all item variants with their stock level, reserved stock, available stock, and alert threshold. The available stock column highlights red when below the threshold. The admin can:
- Edit stock inline (click a cell to edit)
- Set the alert threshold per variant
- Bulk-update stock via CSV upload
- View the stock adjustment history for any variant (log of all changes with timestamps and reasons)

### 21.7 Promotions & Banners (`/admin/promotions`)

Shows all promotions (active and past) in a table. Active promotions show an expiry countdown. Expired promotions show a "Prices Reverted" badge.

Creating a promotion: title, ticker message text, type (ticker-only / hero banner / both), hero image upload (if applicable), discount type and value, scope (all / collection / items), applies-to selector, starts_at, expires_at (required — no indefinite promotions), and an optional auto-generate discount code toggle.

A preview shows which items will have their prices reduced and by how much.

### 21.8 Discount Codes (`/admin/discounts`)

Table of all discount codes with columns: code, type, value, scope, used/cap, expiry, and status.

Creating a code: all the fields described in Section 10.7, plus an auto-generate button that creates a random alphanumeric code. The code must be unique — the form validates uniqueness on blur.

Bulk generate: enter count, shared configuration fields, and click generate. The system creates N unique codes and shows a download CSV of the generated codes.

Usage report: click a code to see which users have used it, with order IDs and amounts.

### 21.9 Tax Management (`/admin/tax`)

See Section 9.6 for full specification.

### 21.10 Customer Management (`/admin/customers`)

Table of all customers with: name, email, phone, order count, lifetime spend, registration date, and account status (active / blocked).

Clicking a customer shows their profile, order history, saved addresses, and wallet balance.

Actions: block/unblock account, send a manual notification, view all orders.

### 21.11 Subscriptions (`/admin/subscriptions`)

Table of all subscribers with: contact (email or phone), channel (email / whatsapp), status (pending / confirmed / unsubscribed), and subscription date.

Filter by channel and status. Export as CSV.

Send broadcast: compose a subject and body, preview, and send to all confirmed email subscribers. The system shows a count before sending ("You are about to send to N subscribers").

WhatsApp settings: upload a new QR code image and paste a new invite URL. These update the config in S3 immediately.

### 21.12 Analytics (`/admin/analytics`)

See Section 20.4 for full specification.

### 21.13 Store Settings (`/admin/settings`)

The settings panel has tabs covering every section of `store.config.json` that the admin should be able to update without developer help:

- **Branding:** Logo upload, colors, font choice
- **Store Info:** Store name, support email, support phone number
- **Item Schema:** Add, edit, or remove dynamic attributes (the fields that appear on every item). Removing an attribute does not delete data — it just hides the field.
- **Variant Dimensions:** Define how items vary (e.g., pack size, color)
- **Taxonomy:** Rename the collection hierarchy labels
- **Shipping:** Manage internal ZIP codes (add/remove, counter shows X of 25), set delivery fee and free delivery threshold, configure Amazon MCF credentials
- **Tax:** See Section 9.6
- **Payment:** Capture delay hours, enabled payment methods (Stripe publishable key is read-only here; the secret is managed in AWS Secrets Manager)
- **Order Policy:** Cancellation window hours, bulk order threshold, bulk cancellation admin approval toggle
- **Promotions:** Promotion ticker scroll speed, fallback messages
- **Subscription:** WhatsApp QR image upload, invite URL
- **Notifications:** Toggle each notification event per channel
- **Features:** Toggle all boolean feature flags
- **SEO:** Default meta title, description, OG image
- **Users:** (super_admin only) Manage admin and supervisor accounts

---

## 22. API Reference — All Endpoints

### 22.1 API Conventions

- Base URL: `/api/v1`
- All responses follow the envelope format: `{ success, data, meta, error: { code, message } }`
- Authentication: Bearer JWT token in Authorization header for protected routes
- Tenant context: extracted from the JWT (all Lambdas are store-aware)
- All timestamps: ISO 8601 UTC
- All currency amounts: integers in cents (e.g., 4999 = $49.99) — never floats

### 22.2 Auth Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | /auth/signup | None | Create new account (email or phone) |
| POST | /auth/signin | None | Email + password sign in |
| POST | /auth/otp/send | None | Send OTP to US phone number |
| POST | /auth/otp/verify | None | Verify OTP, return JWT |
| POST | /auth/refresh | Refresh token | Get new access token |
| POST | /auth/signout | User | Invalidate refresh token |
| POST | /auth/forgot-password | None | Send password reset email |
| POST | /auth/reset-password | Reset token | Set new password |
| POST | /auth/change-password | User | Change password (authenticated) |
| GET | /auth/verify-email | Email token | Confirm email address |

### 22.3 Catalog Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | /items | None | List items (filterable, sortable, paginated) |
| GET | /items/:id | None | Item detail with variants and attributes |
| GET | /items/:id/reviews | None | Paginated reviews for an item |
| POST | /items/:id/reviews | User | Submit a review |
| GET | /search | None | Full-text search |
| GET | /collections | None | Full collection tree |
| GET | /collections/:slug | None | Single collection |
| GET | /catalog/filters | None | Dynamic filter options for a collection |
| GET | /banners | None | Active banners |
| GET | /banners/ticker | None | Active ticker messages |
| GET | /config | None | Public store config (non-secret fields) |

### 22.4 Cart Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | /cart | User / Guest | Full cart with computed totals |
| POST | /cart/items | User / Guest | Add item to cart |
| PATCH | /cart/items/:id | User / Guest | Update quantity |
| DELETE | /cart/items/:id | User / Guest | Remove item |
| DELETE | /cart | User / Guest | Clear entire cart |
| POST | /cart/discount | User / Guest | Apply discount code |
| DELETE | /cart/discount | User / Guest | Remove discount code |
| POST | /cart/reorder | User | Populate cart from previous order |

### 22.5 Tax Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | /tax/calculate | None | Compute tax for a cart given ZIP |
| GET | /shipping/estimate | None | Delivery estimate for a ZIP |
| GET | /shipping/zones | None | Check if ZIP is in internal zone |

### 22.6 Order & Payment Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | /orders | User | Create order + Stripe PaymentIntent |
| GET | /orders | User | User's order history |
| GET | /orders/:id | User | Order detail with tracking |
| POST | /orders/:id/cancel | User | Cancel order (within 24h) |
| POST | /orders/:id/return | User | Submit return request |
| POST | /orders/:id/rating | User | Rate order experience |
| GET | /orders/:id/receipt | User | Presigned S3 URL to PDF receipt |
| POST | /orders/:id/payment/confirm | User | Confirm Stripe authorization |
| POST | /stripe/webhook | Stripe sig | Stripe event receiver |

### 22.7 Account Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | /users/me | User | Current user profile |
| PATCH | /users/me | User | Update profile |
| DELETE | /users/me | User | Delete account (soft) |
| PATCH | /users/me/notifications | User | Update notification preferences |
| GET | /addresses | User | List saved addresses |
| POST | /addresses | User | Add new address |
| PUT | /addresses/:id | User | Update address |
| DELETE | /addresses/:id | User | Delete address |
| GET | /wishlist | User | User wishlist |
| POST | /wishlist | User | Add to wishlist |
| DELETE | /wishlist/:item_id | User | Remove from wishlist |
| POST | /wishlist/move-to-cart | User | Move all wishlist items to cart |
| GET | /wallet | User | Wallet balance and transactions |
| POST | /wallet/topup | User | Add store credit via Stripe |
| GET | /wallet/transactions | User | Transaction history |

### 22.8 Subscription Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | /subscriptions | None | Subscribe via email |
| GET | /subscriptions/confirm | Email token | Confirm subscription |
| POST | /subscriptions/unsubscribe | Token | Unsubscribe |

### 22.9 Admin Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | /admin/dashboard | Admin+ | KPIs and charts |
| GET | /admin/items | Admin+ | All items (paginated) |
| POST | /admin/items | Admin | Create item |
| PUT | /admin/items/:id | Admin | Update item |
| PATCH | /admin/items/:id | Admin | Toggle active status |
| DELETE | /admin/items/:id | Admin | Soft delete item |
| POST | /admin/items/import | Admin | Bulk CSV import |
| GET | /admin/items/export | Admin | Export CSV |
| POST | /admin/items/:id/images | Admin | Upload images to S3 |
| GET | /admin/inventory | Admin+ | All variant stock levels |
| PATCH | /admin/inventory/:id | Admin | Update stock |
| POST | /admin/inventory/bulk | Admin | Bulk stock update CSV |
| GET | /admin/inventory/:id/log | Admin+ | Stock change history |
| GET | /admin/collections | Admin+ | Full collection tree |
| POST | /admin/collections | Admin | Create collection |
| PUT | /admin/collections/:id | Admin | Update collection |
| PATCH | /admin/collections/reorder | Admin | Reorder collections |
| DELETE | /admin/collections/:id | Admin | Delete collection (if empty) |
| GET | /admin/orders | Admin+ | All orders (filtered) |
| GET | /admin/orders/:id | Admin+ | Order detail |
| PATCH | /admin/orders/:id/status | Admin | Change order status |
| POST | /admin/orders/:id/refund | Admin | Process refund via Stripe |
| PATCH | /admin/orders/:id/tracking | Admin | Add tracking number |
| GET | /admin/orders/:id/invoice | Admin+ | Download invoice PDF |
| POST | /admin/orders/:id/cancellation/approve | Admin | Approve bulk cancellation |
| POST | /admin/orders/:id/cancellation/reject | Admin | Reject bulk cancellation |
| GET | /admin/banners | Admin+ | All banners and promotions |
| POST | /admin/banners | Admin | Create promotion/banner |
| PUT | /admin/banners/:id | Admin | Update promotion |
| DELETE | /admin/banners/:id | Admin | Delete (triggers price revert) |
| GET | /admin/discounts | Admin+ | All discount codes |
| POST | /admin/discounts | Admin | Create discount code |
| PUT | /admin/discounts/:code | Admin | Update discount code |
| DELETE | /admin/discounts/:code | Admin | Deactivate discount code |
| POST | /admin/discounts/bulk | Admin | Generate bulk codes |
| GET | /admin/discounts/:code/usage | Admin | Usage report for a code |
| GET | /admin/tax/zip/:zip | Admin+ | Tax rates for a ZIP |
| POST | /admin/tax/zip | Admin | Add or update ZIP tax rate |
| POST | /admin/tax/zip/import | Admin | Bulk import ZIP rates CSV |
| GET | /admin/tax/zip/export | Admin | Export all ZIP rates CSV |
| GET | /admin/customers | Admin+ | Customer list |
| GET | /admin/customers/:id | Admin+ | Customer profile |
| PATCH | /admin/customers/:id | Admin | Block/unblock or change role |
| POST | /admin/notifications/send | Admin | Send manual notification |
| GET | /admin/subscriptions | Admin+ | Subscriber list |
| GET | /admin/subscriptions/export | Admin | Export subscribers CSV |
| POST | /admin/subscriptions/broadcast | Admin | Email broadcast to all confirmed |
| GET | /admin/analytics | Admin+ | Analytics data |
| GET | /admin/reports/export | Admin | Revenue report CSV |
| GET | /admin/settings | Admin+ | Full store config |
| PATCH | /admin/settings/branding | Admin | Update branding |
| PATCH | /admin/settings/item-schema | Admin | Update item attributes |
| PATCH | /admin/settings/shipping | Admin | Update shipping and ZIPs |
| PATCH | /admin/settings/tax | Admin | Update tax config |
| PATCH | /admin/settings/payment | Admin | Update payment config |
| PATCH | /admin/settings/order-policy | Admin | Update order policy |
| PATCH | /admin/settings/features | Admin | Toggle feature flags |
| PATCH | /admin/settings/subscription | Admin | Update WhatsApp QR and URL |
| PATCH | /admin/settings/notifications | Admin | Update notification config |
| GET | /admin/users | Super Admin | Admin user list |
| PATCH | /admin/users/:id/role | Super Admin | Change user role |

---

## 23. Test Automation — Cross-Browser Playwright Suite

### 23.1 Framework and Browser Coverage

All tests are written in Playwright 1.44+. Every test suite runs against all six browser configurations simultaneously:
- Chromium engine (Google Chrome)
- Microsoft Edge (msedge channel)
- Firefox
- WebKit engine (Apple Safari)
- Mobile Chrome (Pixel 7 viewport)
- Mobile Safari (iPhone 14 viewport)

Tests that require Stripe payment entry use Stripe's official test card numbers and interact with the embedded Stripe iFrame using Playwright's `frameLocator` API.

### 23.2 Test Data Strategy

A global setup script runs before all tests. It seeds the DynamoDB test table via direct API calls with a known set of users, items, discount codes, promotions, and ZIP tax rates. All test IDs are predictable (e.g., `item-001`, `disc-WELCOME10`, `zip-85001`). A global teardown script cleans up after the test run.

The seed data includes:
- **Users:** testuser@example.com (customer), admin@example.com (admin), supervisor@example.com (supervisor), newuser@example.com (customer, no prior orders), guest session ID for guest checkout tests
- **Items:** At least 6 items covering: in-stock, low stock, out-of-stock, max_order_qty limited, tax-exempt, and promotion-affected
- **Discount codes:** WELCOME10 (first order, 10% off all), FRUIT20 (20% off Fruits collection), RICE50 ($50 off specific items), EXPIRED (past expires_at), MAXUSED (usedCount = maxUsesTotal), MINORDER ($1000 min order), ONEPERUSER (1 use per user), FREESHIP (free shipping)
- **Promotions:** One active promotion affecting the Fruits collection with a 2-minute expiry (for the auto-expiry test)
- **ZIP tax rates:** 85001 (Phoenix, standard: 8.6%), 85001 (Phoenix, grocery_exempt: 2.3%), 85281 (Tempe, standard: 8.05%)

### 23.3 Page Object Models

**StorefrontPage:** Wraps the homepage. Provides helpers for: navigating to the homepage, asserting the promotion ticker is visible and contains specified text, quick-adding an item by index, reading the cart count, scrolling to the subscription bar.

**CatalogPage:** Wraps the catalog. Provides helpers for: applying a filter by attribute key, changing sort order, reading the item count, clicking an item card by index.

**ItemDetailPage:** Wraps the item detail page. Provides helpers for: selecting a variant, incrementing/decrementing quantity, reading the displayed quantity, clicking add-to-cart, clicking buy-now, reading the stock status, toggling wishlist.

**CartPage:** Wraps the cart. Provides helpers for: reading the subtotal, applying a discount code, reading the discount error message, reading the discount amount, removing the discount code, proceeding to checkout.

**CheckoutPage:** Wraps the 3-step checkout. Provides helpers for: selecting a saved address by index, adding a new US address (all fields), continuing to payment, filling the Stripe card element (using frameLocator), placing the order, reading the confirmation page order ID.

**AdminPage:** Wraps the admin panel. Provides helpers for: navigating to admin sections, creating a promotion with all fields, creating a discount code with all fields, changing an order status, approving or rejecting a bulk cancellation, updating the WhatsApp settings.

### 23.4 Test Suites and Cases

#### Suite: Authentication (12 tests)

1. User can register with email only (no phone)
2. User can register with US phone only (no email)
3. Registration fails when neither email nor phone is provided
4. Registration error is shown for duplicate email
5. OTP is sent to valid US phone number and OTP screen appears
6. OTP verification completes registration and redirects to home
7. Sign-in with correct email and password succeeds
8. Sign-in with wrong password shows error without revealing whether email exists
9. Password show/hide toggle changes input type between password and text
10. Signup page fully renders in under 3 seconds
11. Forgot password link navigates to the forgot password page
12. Signing out clears the session and shows the sign-in link

#### Suite: Homepage (14 tests)

13. Promotion ticker is visible and contains active promotion message
14. Promotion ticker shows config fallback messages when no promotions are active
15. Promotion ticker dismisses when X button is clicked
16. Promotion ticker dismissed state persists on navigate-away-and-return within same session
17. Hero carousel renders with visible slides
18. Hero carousel advances to next slide on arrow click
19. Hero carousel auto-advances after 5 seconds
20. Collection grid renders and each card is clickable and navigates to catalog
21. Quick-add button on item card updates cart count to 1
22. Config label "Add to Cart" renders from configuration (not hardcoded)
23. Subscription bar renders when scrolled into view
24. WhatsApp QR code image renders with non-empty src attribute
25. WhatsApp join button links to the configured group invite URL
26. Email subscription form shows success state after valid email submission

#### Suite: Catalog & Search (11 tests)

27. Catalog renders with item cards
28. Filter panel renders only attributes marked filterable in the item schema
29. Price range filter is always present regardless of item schema
30. Applying organic filter reduces the item count
31. Applied filter creates a dismissible chip above the results
32. Clicking a filter chip removes that filter
33. Clear all filters button resets to full catalog
34. Sort by price ascending reorders items from cheapest to most expensive
35. Clicking a collection card navigates to catalog filtered to that collection
36. Search query returns results matching the query string
37. Search with no matching results shows the empty state component

#### Suite: Item Detail (12 tests)

38. Item detail page shows name, price, and stock status
39. Selecting a pack size variant updates the displayed price
40. Quantity stepper starts at 1 and minimum is 1 (minus button disabled at 1)
41. Quantity stepper cannot exceed the item's max_order_qty
42. Quantity stepper cannot exceed available stock
43. Add to cart button updates the header cart count
44. Add to cart shows a success toast
45. Buy Now adds item and navigates directly to checkout
46. Out-of-stock item shows the out_of_stock label and the add-to-cart button is disabled
47. Low stock item shows the low stock label with the remaining count
48. Wishlist button toggles and shows active state for authenticated users
49. Review form is visible on the Reviews tab and submits successfully for authenticated users

#### Suite: Cart (14 tests)

50. Cart shows all added items with correct names and prices
51. Cart subtotal matches the sum of all line totals
52. Increasing an item quantity updates the subtotal
53. Decreasing an item quantity updates the subtotal
54. Removing an item removes it from the cart
55. Removing the last item shows the empty cart state
56. WELCOME10 code applies 10% discount for first-order users
57. FRUIT20 code applies discount only to Fruits collection items when cart contains mixed items
58. RICE50 code applies fixed dollar discount only to the specified items
59. EXPIRED code shows CODE_EXPIRED error message
60. MAXUSED code shows CODE_FULLY_REDEEMED error message
61. MINORDER code shows MIN_ORDER_NOT_MET error with required remaining amount
62. Applied discount code is removable and total reverts to pre-discount amount
63. Free shipping is applied when subtotal exceeds the configured threshold

#### Suite: Checkout — Full Flow (10 tests)

64. Complete checkout with Stripe test card 4242424242424242 succeeds
65. Order confirmation page shows order reference number after checkout
66. Order confirmation page shows estimated delivery date
67. Track order button navigates to the order detail page
68. Continue shopping button navigates to the home page
69. Stripe declined card (4000000000000002) shows payment error inline
70. Adding a new US address during checkout saves and selects the address
71. Guest checkout flow completes successfully when guest_checkout feature is enabled
72. Checkout with discount code applied reflects the discount in the order total
73. Order placed shows AUTHORIZED status (not PAID — delayed capture model)

#### Suite: Tax (8 tests)

74. Taxable item shows a non-zero tax amount for a Phoenix ZIP (85001)
75. Tax-exempt item shows zero tax regardless of ZIP
76. Different ZIP codes produce different tax amounts for the same item
77. Tax breakdown shows per-item tax line items in the order summary
78. Unknown ZIP code uses the fallback rate (zero) without throwing an error
79. Tax is recalculated when the delivery ZIP is changed during checkout
80. Order confirmation shows the tax amount that was charged
81. Admin can add a new ZIP tax rate and the new rate is used in checkout

#### Suite: Promotions & Auto-Expiry (9 tests)

82. Active promotion message appears in the promotion ticker
83. Item affected by a collection promotion shows the discounted price with the original price struck through
84. Discounted price is the correct percentage less than the original price
85. Promotion expiry causes the ticker message to disappear (tested with 2-minute expiry promotion)
86. Promotion expiry causes the item price to revert to the original price (tested with 2-minute expiry promotion)
87. Admin can create a new promotion via the admin promotions page
88. Admin-deleted promotion immediately triggers price revert and the original price appears on the item page
89. Promotion expiry countdown shows on the admin promotions table row
90. Expired promotions show a "Prices Reverted" badge on the admin promotions table

#### Suite: Discount Code Admin (8 tests)

91. Admin can create a new percentage discount code
92. Admin can create a collection-scoped discount code
93. Admin can create an item-specific discount code
94. Admin bulk generation creates the specified number of unique codes
95. Coupon does not apply to featured/excluded items when all cart items are excluded
96. Coupon applies to eligible items and excludes ineligible items in a mixed cart
97. Coupon fails with BULK_ORDER_LIMIT error when cart total units exceed the configured limit
98. Admin usage report shows which users redeemed a specific code

#### Suite: Cancellation Policy (6 tests)

99. Cancel button is visible on an order placed within the last 24 hours
100. Cancel button is not visible on an order placed more than 24 hours ago and a cancellation-expired message shows instead
101. Cancelling a standard order within 24h sets status to CANCELLED
102. Bulk order (50%+ of available stock on any item) cancellation request sets status to PENDING_CANCELLATION, not CANCELLED
103. Admin can approve a pending cancellation and order becomes CANCELLED
104. Admin can reject a pending cancellation and order returns to previous status

#### Suite: Delivery & Fulfillment (6 tests)

105. Internal Phoenix ZIP code shows same-day or next-day delivery estimate
106. Non-internal ZIP code shows standard carrier delivery estimate
107. Checkout completes for a non-internal ZIP (flagged for manual fulfillment, customer is not blocked)
108. Admin internal ZIP count shows "X of 25 configured"
109. Admin cannot add a 26th internal ZIP (warning is shown)
110. Admin ZIP lookup tool correctly identifies internal vs overflow ZIPs

#### Suite: Account Pages (12 tests)

111. Order history page shows all user orders
112. Order status filter shows only orders matching the selected status
113. Reorder button repopulates cart with all items from a previous order
114. Order detail page shows the status timeline
115. Return request form appears on a delivered order
116. Invoice download link is present on the order detail page
117. Profile page shows the signed-in user's name
118. Profile name update saves and persists after page reload
119. Wishlist shows items added via the wishlist button
120. Add-to-cart from wishlist updates the cart count
121. Remove from wishlist removes the item from the list
122. Move all to cart adds all wishlist items to the cart

#### Suite: Notifications (Async) (3 tests)

123. Order confirmation NOTIF# record is written to DynamoDB after successful checkout (Phase 1 — SQS queue in Phase 2)
124. A notification logging failure does not cause the order creation to fail
125. Email subscription confirmation token is stored in DynamoDB after subscription form submission (Phase 1 — SES delivery in Phase 2)

#### Suite: Role-Based Access Control (6 tests)

126. Supervisor can view the admin orders page in read-only mode
127. Supervisor cannot see or use the status change buttons on an order
128. Supervisor cannot access the admin settings page (redirected with access denied message)
129. Customer account cannot access any /admin path (redirected to sign-in or home)
130. Admin can promote a customer to the supervisor role via the admin users page
131. Super Admin can revoke an admin's role and return them to customer

#### Suite: Analytics Tracking (4 tests)

132. A search query sends an analytics event via navigator.sendBeacon
133. Viewing an item detail page sends an item_view event
134. Adding an item to cart sends an add_to_cart event
135. Analytics events do not block or delay checkout (analytics endpoint failure is transparent to user)

#### Suite: Config-Driven Labels (6 tests)

136. "Add to Cart" button text renders from config.labels.add_to_cart
137. "Out of Stock" label renders from config.labels.out_of_stock
138. Low stock label with quantity renders correctly from config.labels.low_stock
139. "Promo Code" label on cart page renders from config.labels.discount_code
140. Collection hierarchy level labels render from config.taxonomy labels
141. Subscription section title and subtitle render from config.labels

#### Suite: Mobile & Cross-Browser Specific (9 tests)

142. Hamburger menu opens mobile navigation drawer
143. Filter panel opens as a bottom sheet on mobile viewports
144. Subscription bar stacks vertically on mobile viewports
145. Stripe Elements card input renders correctly in all browser engines
146. CSS custom properties (brand colors from config) apply correctly in all browsers
147. Guest cart persists after page reload (stored in DynamoDB via session ID)
148. Session-dismissed ticker does not reappear on navigate-and-return within the same session
149. Checkout completes successfully on mobile Safari viewport
150. All buttons and interactive elements are accessible via keyboard Tab and Enter

### 23.5 Test Run Commands

Install Playwright and browsers:
- Run `npm install -D @playwright/test` to install the test framework
- Run `npx playwright install --with-deps` to download all browser binaries including Safari's WebKit

Run all tests on all browsers:
- `npx playwright test`

Run on a specific browser only:
- `npx playwright test --project=chromium` for Chrome
- `npx playwright test --project=edge` for Edge
- `npx playwright test --project=firefox` for Firefox
- `npx playwright test --project=webkit` for Safari
- `npx playwright test --project=mobile-chrome` for mobile Chrome
- `npx playwright test --project=mobile-safari` for mobile Safari

Run a specific suite:
- `npx playwright test tests/e2e/cart/` to run only the cart suite

Run tests matching a name pattern:
- `npx playwright test -g "discount"` to run all tests whose names contain "discount"

Open headed mode (browser window visible):
- `npx playwright test --headed`

Debug mode (step through tests interactively):
- `npx playwright test --debug`

View the HTML report after a run:
- `npx playwright show-report`

### 23.6 Test Count Summary

| Suite | Tests |
|---|---|
| Authentication | 12 |
| Homepage | 14 |
| Catalog & Search | 11 |
| Item Detail | 12 |
| Cart | 14 |
| Checkout — Full Flow | 10 |
| Tax Engine | 8 |
| Promotions & Auto-Expiry | 9 |
| Discount Code Admin | 8 |
| Cancellation Policy | 6 |
| Delivery & Fulfillment | 6 |
| Account Pages | 12 |
| Notifications (Async) | 3 |
| Role-Based Access Control | 6 |
| Analytics Tracking | 4 |
| Config-Driven Labels | 6 |
| Mobile & Cross-Browser | 9 |
| **Total** | **150 tests** |

All 150 tests run on all 6 browser configurations = **900 test executions per full suite run.**

---

## 24. Infrastructure & Deployment

### 24.1 AWS Services Used

**API Gateway HTTP API:** Routes all `/api/*` requests to the appropriate Go Lambda function. Cognito User Pool JWT authorizer is attached to all protected routes. No API key or additional authentication mechanism is needed — the JWT carries role information.

**AWS Lambda (Go, arm64):** Approximately 65 individual functions. Configured with 128–256 MB RAM and a 10-second timeout. Cart, item detail, and orders-create functions are configured with provisioned concurrency (minimum 1 warm instance) to eliminate cold start latency on the most frequently accessed endpoints. All other functions accept the occasional cold start.

**DynamoDB:** One table per store. On-demand billing. TTL enabled on the `ttl` attribute. Streams enabled with NEW_AND_OLD_IMAGES for the promotions-expire and payment-capture Lambda triggers.

**DynamoDB Streams + Lambda:** Two stream-triggered Lambdas: `promotions-expire` (handles REMOVE events from expired promotion records, reverts prices) and `payment-capture` (handles REMOVE events from expired CAPJOB records, captures Stripe charges). Both have retry logic built into the stream processor. SQS DLQ support is added in Phase 2.

**Search (Phase 1):** DynamoDB scan with filter expressions. Sufficient for 40–50 items at launch. OpenSearch added in Phase 2.

**AWS S3:** Three buckets: one for the Next.js static frontend (served via CloudFront), one for store assets (images, receipts, CSVs — also via CloudFront with presigned URLs for private files), and one for the store configuration file (private, accessed only by Lambda functions).

**AWS CloudFront:** CDN for the frontend and assets. Cache invalidation is triggered automatically on every deploy.

**AWS Cognito User Pool:** Manages user sign-up, sign-in, JWT issuance, and password flows. Email and SMS verification configured. Google and Facebook OAuth are available in Phase 1 when enabled by config.

**AWS SES:** All transactional emails. DKIM and SPF configured for the store's domain. Sending limits verified with AWS. Unsubscribe links included in all marketing emails.

**AWS Secrets Manager:** Stores the Stripe secret key, Cognito client secret, and any other sensitive credentials. Lambda functions read secrets on cold start and cache in memory.

**Logging (Phase 1):** Lambda stdout logs are automatically captured in CloudWatch Logs. No custom alarms or X-Ray tracing in Phase 1.

**AWS SAM (Serverless Application Model):** All infrastructure is defined as SAM code. One SAM stack per environment (development, staging, production). The test environment uses DynamoDB Local running in Docker.

### 24.2 Environments

**Development:** Runs locally. DynamoDB Local in Docker. Stripe test mode keys.

**Staging:** Identical to production architecture. Stripe test mode keys. Used for Playwright E2E runs and pre-release validation.

**Production:** Phoenix, Arizona. Deployed to us-west-2 region (Oregon — closest AWS region with full service availability, as Phoenix does not have its own AWS region). Stripe live mode keys from Secrets Manager.

### 24.3 CI/CD Pipeline — GitHub Actions

On every pull request: run Go unit and integration tests, run Playwright tests against staging, build the React app, and run SAM diff to preview infrastructure changes.

On merge to main: all the above, then deploy the SAM stacks to production, sync the React build to the S3 frontend bucket, and invalidate the CloudFront distribution.

The Playwright test report (HTML with screenshots and videos for failures) is uploaded as a GitHub Actions artifact for every run.

---

## 25. Cost Estimation

### 25.1 Build Cost — One-Time

The platform is built once and reused for multiple stores by updating the configuration file. The table below covers the initial build of the complete platform.

| Developer Level | With AI Coding Tools (~330 hours) | Without AI Tools (~890 hours) |
|---|---|---|
| India Junior ($6–10/hr) | $1,980 – $3,300 | $5,340 – $8,900 |
| India Mid-Level ($12–18/hr) | $3,960 – $5,940 | $10,680 – $16,020 |
| India Senior ($20–30/hr) | $6,600 – $9,900 | $17,800 – $26,700 |
| US Freelancer ($60–100/hr) | $19,800 – $33,000 | $53,400 – $89,000 |

### 25.2 AWS Monthly Running Cost

| Service | Low (1,000 orders/mo) | Medium (10,000 orders/mo) | High (100,000 orders/mo) |
|---|---|---|---|
| Lambda (Go, arm64) | ~$1–3 | ~$8–15 | ~$50–100 |
| API Gateway | ~$1 | ~$5 | ~$35 |
| DynamoDB | ~$3–8 | ~$25–50 | ~$150–300 |
| DynamoDB Streams | ~$0.50 | ~$2 | ~$10 |
| S3 + CloudFront | ~$3 | ~$8 | ~$25 |
| Cognito | $0 (first 50k MAU free) | $0 | ~$11 |
| Secrets Manager | ~$0.50 | ~$0.50 | ~$1 |
| **Total (Phase 1)** | **~$10–15** | **~$45–75** | **~$250–480** |

*All costs in USD. Region: us-west-2 (Oregon). Costs are estimates based on AWS public pricing as of early 2025.*

### 25.3 Onboarding a New Store (After Platform Is Built)

| Task | Time | Cost (India Senior) |
|---|---|---|
| Create store.config.json | 2 hours | ~$50 |
| SAM deploy for new store | 1 hour | ~$25 |
| Seed initial product catalog via CSV | 1–4 hours | ~$25–100 |
| DNS and domain configuration | 0.5 hours | ~$12 |
| Playwright smoke test run | 0.5 hours | ~$12 |
| **Total per new store** | **~5–8 hours** | **~$124–199** |

---

*End of Document — eCommerce Platform Master Requirements Prompt v2.2*  
*Location: Phoenix, Arizona, USA · Currency: USD · Stack: Go · AWS Lambda · DynamoDB · Stripe · React · Playwright*  
*150 test cases · 6 browsers · 900 total test executions per full suite run*

---

## 26. Project Structure, Configuration Files & Secret Management

### 26.1 Monorepo Layout — Three Top-Level Directories

The entire platform lives in a single Git repository organised into exactly three top-level directories: `backend`, `frontend`, and `infra`. Nothing else sits at the root except repository-wide files (`.gitignore`, `README.md`, `CODEOWNERS`, `.github/` for CI/CD workflows, and a root `Makefile` with top-level convenience commands that delegate to each subdirectory).

The three directories are completely independent build units. The backend compiles to Go binaries. The frontend compiles to a static React bundle. The infra directory contains AWS SAM code. None of them import from each other at build time. They communicate only at runtime through the deployed API.

---

### 26.2 Backend Directory Structure

The `backend/` directory contains all Go source code for every Lambda function and every shared internal package. The structure is:

```
backend/
├── application.yml          ← Backend app configuration (non-secret)
├── .env                     ← Local-only secrets (git-ignored)
├── .env.example             ← Committed template showing all required secret keys
├── go.mod
├── go.sum
├── Makefile
├── cmd/
│   ├── auth-signin/
│   ├── auth-signup/
│   ├── auth-otp-send/
│   ├── auth-otp-verify/
│   ├── auth-refresh/
│   ├── auth-forgot-password/
│   ├── auth-reset-password/
│   ├── auth-change-password/
│   ├── auth-verify-email/
│   ├── items-list/
│   ├── items-get/
│   ├── items-search/
│   ├── items-reviews-list/
│   ├── items-reviews-create/
│   ├── collections-list/
│   ├── collections-get/
│   ├── filters-get/
│   ├── banners-list/
│   ├── banners-ticker/
│   ├── cart-get/
│   ├── cart-items-add/
│   ├── cart-items-update/
│   ├── cart-items-delete/
│   ├── cart-clear/
│   ├── cart-discount-apply/
│   ├── cart-discount-remove/
│   ├── cart-reorder/
│   ├── tax-calculate/
│   ├── shipping-estimate/
│   ├── shipping-zones/
│   ├── orders-create/
│   ├── orders-list/
│   ├── orders-get/
│   ├── orders-cancel/
│   ├── orders-return/
│   ├── orders-rating/
│   ├── orders-receipt/
│   ├── payment-confirm/
│   ├── stripe-webhook/
│   ├── payment-capture/         ← DynamoDB Stream trigger (CAPJOB TTL expiry)
│   ├── promotions-expire/       ← DynamoDB Stream trigger (BANNER TTL expiry)
│   ├── addresses-list/
│   ├── addresses-create/
│   ├── addresses-update/
│   ├── addresses-delete/
│   ├── wishlist-get/
│   ├── wishlist-add/
│   ├── wishlist-remove/
│   ├── wishlist-to-cart/
│   ├── wallet-get/
│   ├── wallet-topup/
│   ├── wallet-transactions/
│   ├── users-me-get/
│   ├── users-me-update/
│   ├── users-me-delete/
│   ├── users-notifications/
│   ├── subscriptions-create/
│   ├── subscriptions-confirm/
│   ├── subscriptions-unsubscribe/
│   ├── notifications-log/       ← Writes NOTIF# records to DynamoDB (Phase 2: replaced by SQS processor)
│   ├── analytics-track/
│   ├── config-get/              ← Public endpoint: returns non-secret config fields
│   ├── admin-dashboard/
│   ├── admin-items-list/
│   ├── admin-items-create/
│   ├── admin-items-update/
│   ├── admin-items-toggle/
│   ├── admin-items-delete/
│   ├── admin-items-import/
│   ├── admin-items-export/
│   ├── admin-items-images/
│   ├── admin-inventory/
│   ├── admin-inventory-update/
│   ├── admin-inventory-bulk/
│   ├── admin-inventory-log/
│   ├── admin-collections-list/
│   ├── admin-collections-create/
│   ├── admin-collections-update/
│   ├── admin-collections-reorder/
│   ├── admin-collections-delete/
│   ├── admin-orders-list/
│   ├── admin-orders-get/
│   ├── admin-orders-status/
│   ├── admin-orders-refund/
│   ├── admin-orders-tracking/
│   ├── admin-orders-invoice/
│   ├── admin-orders-cancel-approve/
│   ├── admin-orders-cancel-reject/
│   ├── admin-banners-list/
│   ├── admin-banners-create/
│   ├── admin-banners-update/
│   ├── admin-banners-delete/
│   ├── admin-discounts-list/
│   ├── admin-discounts-create/
│   ├── admin-discounts-update/
│   ├── admin-discounts-delete/
│   ├── admin-discounts-bulk/
│   ├── admin-discounts-usage/
│   ├── admin-tax-zip-get/
│   ├── admin-tax-zip-create/
│   ├── admin-tax-zip-import/
│   ├── admin-tax-zip-export/
│   ├── admin-customers-list/
│   ├── admin-customers-get/
│   ├── admin-customers-update/
│   ├── admin-customers-notify/
│   ├── admin-subscriptions-list/
│   ├── admin-subscriptions-export/
│   ├── admin-subscriptions-broadcast/
│   ├── admin-analytics/
│   ├── admin-reports-export/
│   ├── admin-settings-get/
│   ├── admin-settings-branding/
│   ├── admin-settings-item-schema/
│   ├── admin-settings-shipping/
│   ├── admin-settings-tax/
│   ├── admin-settings-payment/
│   ├── admin-settings-order-policy/
│   ├── admin-settings-features/
│   ├── admin-settings-subscription/
│   ├── admin-settings-notifications/
│   ├── admin-users-list/
│   └── admin-users-role/
├── internal/
│   ├── config/
│   │   ├── loader.go        ← Reads application.yml + merges secrets
│   │   ├── model.go         ← AppConfig struct matching application.yml schema
│   │   └── secrets.go       ← Secret resolution: .env locally, AWS Secrets Manager on AWS
│   ├── dynamo/
│   │   ├── client.go        ← DynamoDB client singleton
│   │   ├── queries.go       ← All DynamoDB read/write helpers
│   │   └── models.go        ← All DynamoDB entity structs
│   ├── auth/
│   │   ├── middleware.go    ← JWT verification and role extraction
│   │   └── claims.go        ← JWT claims struct and helpers
│   ├── stripe/
│   │   ├── client.go        ← Stripe Go SDK wrapper
│   │   └── webhook.go       ← Webhook signature verification
│   ├── response/
│   │   ├── envelope.go      ← Standard { success, data, meta, error } builder
│   │   └── errors.go        ← All error code constants
│   ├── email/
│   │   └── logger.go        ← Logs email intents to DynamoDB NOTIF# records (Phase 2: replaced by ses.go)
│   ├── storage/
│   │   └── s3.go            ← S3 upload, presigned URL, config read helpers
│   └── logger/
│       └── logger.go           ← Structured JSON logger (stdout — captured by Lambda logs)
└── dist/                    ← Compiled Lambda binaries (git-ignored)
    └── {function-name}/
        └── bootstrap        ← The Go binary (GOOS=linux GOARCH=arm64)
```

Every `cmd/{function-name}/` directory contains exactly one file: `main.go`. That file imports from `internal/` packages and wires together the Lambda handler. No business logic lives in `main.go` — only handler registration and dependency injection. All shared business logic lives in the appropriate `internal/` package.

---

### 26.3 Backend application.yml — Full Schema

`backend/application.yml` contains all **non-secret** configuration for the backend application. It is committed to Git. Secret values (passwords, API keys, tokens) are never written into this file.

The file is structured as follows and covers every configuration dimension the application needs:

**app section:** The application name (`ecommerce-backend`), version string, and the environment name. The environment name is one of `local`, `staging`, or `production` and is set via the `APP_ENV` environment variable at Lambda startup. The `application.yml` provides a default of `local` so local development works without any extra setup.

**server section:** The HTTP port used when running the Go binary locally for integration testing (`8080` by default). On Lambda this is unused — API Gateway handles routing — but the local server allows running individual Lambda functions as a standard HTTP service during development.

**aws section (non-secret):** The AWS region (`us-west-2`), the DynamoDB table name pattern (`ecommerce-{store_id}`), the S3 bucket names for assets and config, the Cognito User Pool ID and the Cognito App Client ID (not secret — these are public identifiers), Phase 2 adds: SQS queue URLs, OpenSearch endpoint, CloudWatch alarm ARNs. None of these are secrets.

**store section:** The store ID (`phoenix-grocery`) and the S3 key path where `store.config.json` is stored. The backend loads the store config from S3 on cold start and caches it in Lambda memory for 5 minutes.

**cache section:** The config cache TTL in seconds (300 = 5 minutes), and whether config caching is enabled (can be disabled in local development for immediate config reloads).

**dynamodb section:** The table name, the names of the two GSI indexes (GSI1 and GSI2), the TTL attribute name (`ttl`), and stream ARNs.

**stripe section (non-secret portion):** The Stripe webhook endpoint path (`/api/stripe/webhook`), and which Stripe events the webhook handler listens for (the list of event type strings). The Stripe API keys themselves are secrets and live in `.env` locally or AWS Secrets Manager on AWS.

**notifications section (Phase 1):** Notification event flags stored for future use. Phase 1 only logs intent records. SES sender address and SMS config are Phase 2.

**payment section (non-secret portion):** The capture delay default in hours (5), the maximum allowed capture delay in hours (168), and whether delayed capture is enabled.

**fulfillment section:** Internal ZIP codes list, max_internal_zips (25), overflow_provider flag ("manual" for Phase 1, "amazon_mcf" for Phase 2).

**tax section:** The fallback tax rate to use when a ZIP code is not found in the database (0.0 means the customer is not charged tax — conservative safe default).

**logging section:** Log level (`info` for production, `debug` for local), log format (`json` for Lambda/CloudWatch, `pretty` for local terminal), and whether to include request/response bodies in debug logs.

**security section:** JWT algorithm (`RS256`), JWT expiry in seconds (3600 = 1 hour), refresh token expiry in days (30), OTP expiry in minutes (10), OTP length (6 digits), and password minimum requirements.

**analytics section:** Whether analytics tracking is enabled, the DynamoDB TTL for raw events in days (90), the S3 prefix for daily aggregate files.

---

### 26.4 Backend .env File — Local Secrets Only

`backend/.env` is **never committed to Git**. It is listed in `.gitignore`. It exists only on developer machines for local development and local test runs.

The file provides values for every secret key the application needs. The `backend/.env.example` file IS committed to Git and contains the same keys with empty or placeholder values — this serves as the documentation of which secrets are required and what format they should be in.

The secrets that must appear in `.env` for local development are:

**AWS credentials (local only):** `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` for a developer IAM user with DynamoDB, S3, and Cognito permissions. On AWS Lambda these are never needed — Lambda has an IAM execution role that provides credentials automatically.

**Stripe secret key:** `STRIPE_SECRET_KEY` starting with `sk_test_` for local development. On staging use a different test key. On production use the live key (`sk_live_`).

**Stripe webhook secret:** `STRIPE_WEBHOOK_SECRET` starting with `whsec_`. The webhook secret is used to verify that incoming webhook calls genuinely came from Stripe. For local development, use the Stripe CLI to forward webhooks and copy the signing secret it provides.

**Cognito client secret:** `COGNITO_CLIENT_SECRET` — the secret associated with the Cognito App Client, required to call Cognito's token endpoint.

**Database URL (if using DynamoDB Local):** `DYNAMODB_ENDPOINT_OVERRIDE` set to `http://localhost:8000` to point the DynamoDB client to the local Docker container instead of AWS. This key is only read when `APP_ENV=local`.

---

### 26.5 Backend Secret Resolution Logic

The `internal/config/secrets.go` package contains all logic for resolving secret values. The resolution follows a strict priority order:

**Step 1 — Read APP_ENV:** The application reads the `APP_ENV` environment variable. If it is `local` (or unset), the application is running locally. If it is `staging` or `production`, the application is running on AWS Lambda.

**Step 2 — Local mode:** When `APP_ENV=local`, the config loader reads the `.env` file from the backend directory root and loads all key-value pairs as environment variables for the current process. It then reads each secret from the environment variable of the same name. If any required secret is missing, the application logs a clear error message listing the missing key and exits immediately — the developer should not have to guess why something is broken.

**Step 3 — AWS mode:** When `APP_ENV=staging` or `APP_ENV=production`, the config loader calls AWS Secrets Manager using the Lambda execution role (no credentials needed — IAM handles it). All secrets are stored in a single Secrets Manager secret named `ecommerce/{environment}/backend`. That secret is a JSON object containing all secret key-value pairs. The loader fetches it once on cold start, parses the JSON, and caches the values in memory. Subsequent invocations of the same warm Lambda instance reuse the cached secrets. There is no `.env` file on AWS — if one is accidentally present, it is ignored in non-local environments.

**Step 4 — Merging:** The resolved secrets are merged with the non-secret values from `application.yml` into a single `AppConfig` struct. Every Lambda function accesses configuration exclusively through this struct — never through direct `os.Getenv()` calls scattered through the codebase. This makes the configuration surface predictable, auditable, and testable.

---

### 26.6 Frontend Directory Structure

The `frontend/` directory contains the entire Next.js 14 application. The structure is:

```
frontend/
├── application.yml          ← Frontend app configuration (non-secret)
├── .env                     ← Local-only secrets (git-ignored)
├── .env.example             ← Committed template for required secret keys
├── .env.staging             ← Staging environment overrides (non-secret only)
├── .env.production          ← Production environment overrides (non-secret only)
├── package.json
├── next.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── next.config.ts
├── playwright.config.ts
├── index.html
├── public/
│   └── assets/
├── src/
│   ├── app/                 ← Next.js 14 App Router
│   │   ├── layout.tsx       ← Root layout (header, footer, ConfigContext)
│   │   ├── page.tsx         ← Homepage (SSG — static at build time)
│   │   ├── globals.css
│   │   └── ...
│   ├── pages/               ← Legacy pages dir (not used — App Router preferred)
│   ├── config/
│   │   ├── loader.ts        ← Fetches store.config.json from /api/config at startup
│   │   └── types.ts         ← TypeScript types matching store.config.json schema
│   ├── context/
│   │   ├── ConfigContext.tsx ← React context providing config to all components
│   │   └── CartContext.tsx
│   ├── hooks/
│   │   ├── useConfig.ts     ← Hook to read config from ConfigContext
│   │   ├── useCart.ts
│   │   ├── useAuth.ts
│   │   └── useAnalytics.ts
│   ├── pages/
│   │   ├── Home.tsx
│   │   ├── Catalog.tsx
│   │   ├── ItemDetail.tsx
│   │   ├── Search.tsx
│   │   ├── Cart.tsx
│   │   ├── SignIn.tsx
│   │   ├── SignUp.tsx
│   │   ├── ForgotPassword.tsx
│   │   ├── ResetPassword.tsx
│   │   ├── checkout/
│   │   │   ├── Address.tsx
│   │   │   ├── Payment.tsx
│   │   │   └── Confirmation.tsx
│   │   ├── account/
│   │   │   ├── Orders.tsx
│   │   │   ├── OrderDetail.tsx
│   │   │   ├── Profile.tsx
│   │   │   ├── Wishlist.tsx
│   │   │   └── Wallet.tsx
│   │   └── admin/
│   │       ├── Dashboard.tsx
│   │       ├── Catalog.tsx
│   │       ├── Collections.tsx
│   │       ├── Orders.tsx
│   │       ├── Inventory.tsx
│   │       ├── Promotions.tsx
│   │       ├── Discounts.tsx
│   │       ├── Tax.tsx
│   │       ├── Customers.tsx
│   │       ├── Subscriptions.tsx
│   │       ├── Analytics.tsx
│   │       └── Settings.tsx
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── Footer.tsx
│   │   │   ├── PromotionTicker.tsx
│   │   │   └── AdminSidebar.tsx
│   │   ├── catalog/
│   │   │   ├── ItemCard.tsx
│   │   │   ├── ItemGrid.tsx
│   │   │   ├── FilterPanel.tsx
│   │   │   ├── SortControl.tsx
│   │   │   └── ActiveFilterChips.tsx
│   │   ├── item/
│   │   │   ├── ImageGallery.tsx
│   │   │   ├── VariantSelector.tsx
│   │   │   ├── QuantityStepper.tsx
│   │   │   ├── PriceDisplay.tsx
│   │   │   ├── StockStatus.tsx
│   │   │   ├── DynamicAttributes.tsx ← Renders attrs from config item_schema
│   │   │   └── ReviewForm.tsx
│   │   ├── cart/
│   │   │   ├── CartDrawer.tsx
│   │   │   ├── CartItemRow.tsx
│   │   │   ├── OrderSummary.tsx
│   │   │   └── DiscountCodeInput.tsx
│   │   ├── checkout/
│   │   │   ├── AddressForm.tsx
│   │   │   ├── AddressSelector.tsx
│   │   │   └── StripePaymentElement.tsx
│   │   ├── homepage/
│   │   │   ├── HeroCarousel.tsx
│   │   │   ├── CollectionsGrid.tsx
│   │   │   ├── ItemsRow.tsx
│   │   │   └── SubscriptionBar.tsx
│   │   ├── admin/
│   │   │   ├── DataTable.tsx        ← Generic admin table with sort/filter
│   │   │   ├── DynamicItemForm.tsx  ← Form generated from config item_schema
│   │   │   ├── StatusBadge.tsx
│   │   │   ├── DateRangePicker.tsx
│   │   │   └── ExpiryCountdown.tsx
│   │   └── shared/
│   │       ├── Button.tsx
│   │       ├── Input.tsx
│   │       ├── Modal.tsx
│   │       ├── Toast.tsx
│   │       ├── AuthGuard.tsx        ← Redirects unauthenticated users
│   │       ├── RoleGuard.tsx        ← Hides content for insufficient roles
│   │       └── FeatureGate.tsx      ← Hides content when feature flag is off
│   ├── api/
│   │   ├── client.ts        ← Axios/fetch wrapper with base URL and auth header
│   │   ├── auth.ts
│   │   ├── items.ts
│   │   ├── cart.ts
│   │   ├── orders.ts
│   │   ├── tax.ts
│   │   ├── subscriptions.ts
│   │   ├── analytics.ts
│   │   └── admin/
│   │       ├── catalog.ts
│   │       ├── orders.ts
│   │       ├── discounts.ts
│   │       ├── promotions.ts
│   │       ├── tax.ts
│   │       ├── customers.ts
│   │       ├── subscriptions.ts
│   │       ├── analytics.ts
│   │       └── settings.ts
│   ├── stores/
│   │   ├── cartStore.ts     ← Zustand cart state
│   │   └── authStore.ts     ← Zustand auth state (token in memory)
│   └── utils/
│       ├── price.ts         ← formatPrice($, currency from config)
│       ├── date.ts          ← formatDate(MM/DD/YYYY, timezone from config)
│       ├── validation.ts    ← US phone, email, ZIP format validators
│       └── tax.ts           ← Client-side tax display helpers
├── tests/
│   └── e2e/
│       ├── auth/
│       ├── homepage/
│       ├── catalog/
│       ├── items/
│       ├── cart/
│       ├── checkout/
│       ├── account/
│       ├── promotions/
│       ├── admin/
│       ├── tax/
│       ├── config/
│       ├── crossbrowser/
│       ├── pages/           ← Page Object Models
│       └── fixtures/        ← Seed data and test helpers
└── out/                     ← Next.js static export output (git-ignored)
                              Built by `next build` — pure HTML/CSS/JS, no Node server
```

---

### 26.7 Frontend application.yml — Full Schema

`frontend/application.yml` contains all **non-secret** configuration for the Next.js application. It is committed to Git. It is read at build time by the Vite build process and baked into the bundle as environment variables prefixed with `NEXT_PUBLIC_`. Secret values are never placed here.

The file covers:

**app section:** Application name (`ecommerce-frontend`), version string, and default environment (`local`). The environment is set by the `NEXT_PUBLIC_APP_ENV` variable which Vite injects at build time.

**api section:** The base URL for all API calls. For local development this is `http://localhost:3000` (where a local API Gateway emulator or individual Lambda runs). For staging this is the staging API Gateway URL. For production this is the production API Gateway URL. These URLs are not secrets — they are public endpoints. They are set here as defaults and overridden by the environment-specific `.env` files.

**stripe section (non-secret):** The Stripe publishable key prefix validation pattern (to confirm that the key injected at runtime starts with `pk_test_` in non-production environments and `pk_live_` in production). The actual publishable key comes from the store config loaded at runtime from the `/api/config` endpoint — it is not baked into the frontend build. This design means rotating the Stripe publishable key requires only a config update, not a frontend redeploy.

**auth section:** The Cognito hosted UI URL for OAuth flows (Phase 2), the OAuth redirect URI (the frontend URL + `/auth/callback`), and the Cognito User Pool region. None of these are secrets.

**analytics section:** Whether analytics event tracking is enabled (can be disabled in local development to reduce noise), the debounce delay for scroll events in milliseconds, and the beacon endpoint path.

**features section:** A local override map for feature flags. In local development a developer can set `features.social_login: true` here to test the Phase 2 social login UI without waiting for a full deployment. These local overrides take lower priority than the flags returned by the live `/api/config` endpoint.

**assets section:** The CloudFront CDN base URL for item images and other S3 assets. In local development this points to a local file server or S3 with CORS configured for localhost. This is not a secret.

**sentry section:** The Sentry DSN for frontend error tracking. This is a non-secret public identifier. Error monitoring is disabled in local development by default.

---

### 26.8 Frontend .env File — Local Secrets and Environment Overrides

`frontend/.env` is **never committed to Git**. `frontend/.env.example` is committed and documents all required keys with placeholder values.

The keys in the frontend `.env` are:

**NEXT_PUBLIC_APP_ENV:** Set to `local` for local development. Overridden to `staging` or `production` by the build pipeline.

**NEXT_PUBLIC_API_BASE_URL:** The backend API base URL for local development (`http://localhost:3000`). This overrides the value in `application.yml` for the local environment.

**NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:** The Stripe publishable key for local testing. This starts with `pk_test_`. This is technically not a secret (publishable keys are meant to be public), but it is placed in `.env` to keep the build process consistent and to avoid accidentally committing a live key. In staging and production, the publishable key is loaded at runtime from the `/api/config` endpoint (which reads it from the store config in S3), not baked into the build.

**NEXT_PUBLIC_COGNITO_USER_POOL_ID and NEXT_PUBLIC_COGNITO_CLIENT_ID:** The Cognito identifiers for local development. These are public identifiers, not secrets, but keeping them out of the committed `application.yml` avoids confusion about which pool is used in each environment.

`frontend/.env.staging` and `frontend/.env.production` are committed to Git because they contain only non-secret values (API URLs, Cognito pool IDs for those environments). They are loaded automatically by Vite when building for the corresponding environment.

---

### 26.9 Frontend Secret Resolution Logic

The frontend has a simpler secret resolution story than the backend because browsers cannot safely access AWS Secrets Manager — all frontend secrets are either truly public (Stripe publishable key) or loaded at runtime from the authenticated API.

The resolution works as follows:

**At build time:** Next.js reads `.env`, `.env.{environment}`, and `application.yml` in that priority order. Non-secret values from these files are baked into the bundle as `NEXT_PUBLIC_*` constants.

**At runtime — initial load:** The React app's root component calls the `/api/config` endpoint (a public Lambda that returns the non-secret portion of `store.config.json`). This includes: all UI labels, feature flags, branding colors, taxonomy labels, shipping config, Stripe publishable key, and subscription settings. This config is injected into ConfigContext and is available to all components.

**At runtime — authenticated calls:** After sign-in, the JWT access token is stored in memory (in the Zustand auth store). Every API call from `src/api/client.ts` automatically attaches the Bearer token from the auth store. There is no localStorage, no cookie-based token storage for access tokens (only the refresh token uses a httpOnly cookie managed by the auth service).

**No secrets are ever in the frontend bundle.** The Stripe publishable key is the only quasi-sensitive value, and it is genuinely designed by Stripe to be public. The Stripe secret key never touches the browser — it lives only in AWS Secrets Manager and is accessed only by the Go Lambda functions.

---

### 26.10 Infra Directory Structure

The `infra/` directory contains all AWS SAM code that defines the platform's infrastructure. It is a TypeScript SAM project.

```
infra/
├── package.json
├── tsconfig.json
├── samconfig.toml           ← SAM context cache (git-ignored for security)
├── .env                     ← Local SAM deploy secrets (git-ignored)
├── .env.example             ← Documents required deploy-time secrets
├── bin/
│   └── app.ts               ← SAM app entry: instantiates stacks per environment
└── lib/
    ├── stacks/
    │   ├── networking-stack.ts   ← VPC, subnets (if needed), security groups
    │   ├── auth-stack.ts         ← Cognito User Pool, App Client, domain
    │   ├── database-stack.ts     ← DynamoDB table, GSIs, TTL, Streams
    │   ├── storage-stack.ts      ← S3 buckets (frontend, assets, config)
    │   ├── cdn-stack.ts          ← CloudFront distributions, OAC, cache policies
    │   ├── search-stack.ts       ← OpenSearch Serverless collection and policies
    │   ├── messaging-stack.ts    ← SQS queues (notifications, DLQs)
    │   ├── secrets-stack.ts      ← Secrets Manager secrets (creates the secret shells)
    │   ├── lambda-stack.ts       ← All Lambda functions, IAM roles, environment variables
    │   ├── api-stack.ts          ← API Gateway HTTP API, routes, JWT authorizer
    │   └── monitoring-stack.ts   ← CloudWatch alarms, X-Ray, dashboards
    └── constructs/
        ├── GoLambda.ts       ← Reusable construct: Go Lambda + IAM + env vars
        ├── StreamTrigger.ts  ← Reusable construct: DynamoDB Streams → Lambda
        └── SqsTrigger.ts     ← Reusable construct: SQS queue → Lambda
```

The infra `.env` file provides AWS account ID, AWS region, and any deploy-time tokens needed by SAM (not application secrets — those are created in Secrets Manager by the `secrets-stack`). The actual secret values (Stripe keys, etc.) are populated into Secrets Manager manually or via a separate secrets rotation script, never via SAM code.

---

### 26.11 Environment Variable Naming Conventions

A consistent naming convention prevents confusion between the three directories:

**Backend Go (read via `internal/config`):** All environment variables consumed by Go Lambda functions use `SCREAMING_SNAKE_CASE` without a prefix. Examples: `APP_ENV`, `AWS_REGION`, `DYNAMODB_TABLE_NAME`, `STRIPE_SECRET_KEY`, `COGNITO_USER_POOL_ID`.

**Frontend React (read via Vite):** All environment variables consumed by the React build use `NEXT_PUBLIC_` prefix followed by `SCREAMING_SNAKE_CASE`. Examples: `NEXT_PUBLIC_APP_ENV`, `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. Next.js build system enforces this prefix — any variable without `NEXT_PUBLIC_` is not accessible in the browser bundle.

**Infra SAM (read at deploy time):** SAM deploy-time variables use `SAM_` prefix. Examples: `AWS_ACCOUNT_ID`, `AWS_DEFAULT_REGION`. These are never part of the deployed application — they only control the SAM deployment process.

---

### 26.12 AWS Secrets Manager Secret Structure

On AWS (staging and production), all backend secrets live in a single Secrets Manager secret per environment:

- Secret name: `ecommerce/local/backend` (for staging, `ecommerce/staging/backend`; for production, `ecommerce/production/backend`)
- Secret type: JSON string
- Contents: A single JSON object with the following keys matching the `.env.example` secret keys: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `COGNITO_CLIENT_SECRET`

The Lambda execution IAM role is granted `secretsmanager:GetSecretValue` permission scoped to only the secret ARN matching its environment. It cannot read secrets from other environments.

The store configuration (`store.config.json`) is stored separately in S3 — not in Secrets Manager — because it is not a secret. It contains no credentials, only business configuration. The S3 bucket for config is private (no public access), and Lambda reads it using the same IAM execution role.

---

### 26.13 Local Development Startup Sequence

To run the full platform locally, a developer follows these steps in order:

**Step 1 — Start DynamoDB Local:** Run the DynamoDB Local Docker container on port 8000. This provides a local DynamoDB instance with no AWS account required.

**Step 2 — Seed the local database:** Run the seed script (`backend/Makefile` target: `make seed`) which creates the DynamoDB table schema and populates it with test items, users, discount codes, and ZIP tax rates matching the Playwright test fixtures.

**Step 3 — Configure backend secrets:** Copy `backend/.env.example` to `backend/.env` and fill in the Stripe test keys, local Cognito credentials, and set `DYNAMODB_ENDPOINT_OVERRIDE=http://localhost:8000`.

**Step 4 — Start the backend:** Run `make serve` in the `backend/` directory. This starts a local HTTP server on port 3000 that emulates API Gateway by routing paths to the corresponding Lambda handler functions. The Go binary is compiled once and the server handles hot-reloading on file save.

**Step 5 — Configure frontend:** Copy `frontend/.env.example` to `frontend/.env`, set `NEXT_PUBLIC_API_BASE_URL=http://localhost:3000`, and set the Stripe test publishable key.

**Step 6 — Start the frontend:** Run `npm run dev` in the `frontend/` directory. Next.js dev server starts on port 5173 with hot module replacement.

**Step 7 — Run tests:** Run `npx playwright test` from the `frontend/` directory against the local servers.

No AWS account credentials are required for local development. DynamoDB Local covers all data storage needs. Email and SMS notifications are logged to console only in Phase 1.

---

### 26.14 Configuration Precedence Summary

The table below shows which configuration source wins for each type of value in each environment:

| Value Type | Local (APP_ENV=local) | Staging/Production (AWS) |
|---|---|---|
| Non-secret app config | `application.yml` | `application.yml` (same file, committed) |
| Non-secret env overrides | `backend/.env` (non-secret keys) | Lambda environment variables set by SAM |
| Secrets | `backend/.env` (git-ignored) | AWS Secrets Manager |
| Store configuration | S3 (or local file override) | S3 |
| Frontend non-secret config | `application.yml` + `frontend/.env` | `application.yml` + `.env.{environment}` |
| Frontend secrets (Stripe pub key) | `frontend/.env` | Runtime from `/api/config` endpoint |

The golden rule: **if a value would cause security, financial, or compliance harm if exposed in a Git commit or a browser bundle, it is a secret and must never appear in `application.yml`, `.env.staging`, `.env.production`, or any committed file.** All such values live in `backend/.env` locally and in AWS Secrets Manager on AWS.

