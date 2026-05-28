---
name: shopreturngifts-dev
description: "ShopReturnGifts platform development skill. Use when: building features, updating APIs, adding routes, editing frontend/backend code, verifying changes work end-to-end. Covers full-stack knowledge (React frontend, Go Lambda backend, DynamoDB, AWS infra), requires OpenAPI spec update on every API change, and runs Playwright E2E tests after every code change to confirm nothing is broken. Also triages broken tests as business-change vs code regression."
argument-hint: "Describe the feature, bug fix, or code change to implement"
---

# ShopReturnGifts Platform Development Skill

## When to Use
- Implementing any new feature (frontend, backend, or both)
- Fixing a bug in the platform
- Adding or changing an API endpoint
- Updating the data model or DynamoDB access patterns
- Verifying that existing functionality still works after a change

## Mandatory Workflow

Every code change follows this sequence — no exceptions:

```
1. Understand → 2. Plan → 3. Implement → 4. Update OpenAPI → 5. Run Playwright → 6. Triage → 7. Report
```

See details in each section below.

---

## Platform Knowledge Base

Full architecture reference: [platform-knowledge.md](./references/platform-knowledge.md)

### Quick Summary

| Layer | Technology | Key Files |
|---|---|---|
| Frontend | React 18 + Vite/SWC, TypeScript 5 | `src/` |
| Routing (FE) | React Router v6 | `src/App.tsx` |
| State | Zustand (auth/cart) + TanStack Query (server) | `src/stores/`, hooks |
| UI | shadcn/ui + Radix + Tailwind CSS | `src/components/ui/` |
| Forms | React Hook Form + Zod validation | pages, checkout |
| Backend | Go 1.22, Chi router, single Lambda binary | `backend/` |
| DB | DynamoDB single-table (PK/SK + GSI1) | `backend/internal/store/dynamodb.go` |
| Auth | AWS Cognito + JWT (golang-jwt v5) | `backend/internal/middleware/auth.go` |
| Payments | Stripe v82 (authorize → confirm flow) | `backend/internal/stripe/` |
| Infra | AWS SAM, Lambda ARM64, API Gateway HTTP API | `template.yaml` |
| CDN | CloudFront → S3 (static frontend) | `template.yaml` |
| Assets | S3 (images, invoices, store config) | env `S3_BUCKET` |

### Frontend Routes

```
/                   HomePage
/products           ProductsPage
/products/:id       ProductDetailPage
/categories         CategoriesPage
/cart               CartPage
/checkout           CheckoutPage (Stripe Payment Element)
/checkout/success   CheckoutSuccessPage
/orders             OrdersPage (auth required)
/orders/:id         OrderDetailPage (auth required)
/profile            ProfilePage (auth required)
/login              LoginPage
/signup             SignupPage
/admin/*            Admin panel (admin role required)
```

### Backend API Surface

All routes under `/api`. Full OpenAPI served at `GET /api/openapi.json`.

**Public (no auth)**
- `POST /api/auth/login` · `POST /api/auth/signup` · `POST /api/auth/confirm` · `POST /api/auth/resend-code`
- `GET /api/config/theme`
- `GET /api/products` · `GET /api/products/{productId}`
- `GET /api/categories`
- `GET /api/coupons/validate`
- `POST /api/stripe/webhook`

**Authenticated (Bearer JWT)**
- `GET/PUT /api/users/me` · `PUT /api/users/me/address`
- `GET /api/orders` · `GET /api/orders/{orderId}` · `POST /api/orders`
- `POST /api/orders/{orderId}/payment/confirm`
- `GET /api/orders/{orderId}/invoice`

**Admin (Bearer JWT + Cognito admin group)**
- `GET /api/admin/dashboard`
- Products CRUD + image upload URL
- Categories CRUD
- Orders list, detail, status update, fulfill, refund
- Users list, detail, update, delete
- Coupons CRUD
- Config read/update + logo/hero upload URL
- Notifications log

### DynamoDB Key Patterns

| Entity | PK | SK | GSI1PK | GSI1SK |
|---|---|---|---|---|
| Product | `PRODUCT#<id>` | `PRODUCT#<id>` | `CAT#<catId>` | `PRODUCT#<id>` |
| Category | `CAT#<id>` | `CAT#<id>` | — | — |
| User | `USER#<id>` | `USER#<id>` | `USER#<email>` | `<email>` |
| Order | `ORDER#<id>` | `ORDER#<id>` | `USER#<userId>` | `ORDER#<date>` |
| Config | `CONFIG` | `CONFIG` | — | — |
| Coupon | `COUPON#<code>` | `COUPON#<code>` | — | — |

> **Known gotcha:** DynamoDB can surface order IDs as `ORDER#<id>` from raw queries. Always strip the prefix before returning to the frontend.

### AWS Infrastructure

- **Lambda:** `provided.al2023`, ARM64, 30 s timeout, single binary compiled with `GOOS=linux GOARCH=arm64 CGO_ENABLED=0 -tags lambda.norpc`
- **API Gateway:** HTTP API (not REST API)
- **Cognito:** User Pool for auth; admin group checked in middleware
- **S3 buckets:** store assets (images, invoices) + config JSON; CloudFront in front of frontend bucket
- **DynamoDB:** pay-per-request, TTL on `expiresAt` (coupons, promos), Streams enabled
- **SAM template:** `template.yaml` — single source of truth for all infra
- **ALLOWED_ORIGINS env var:** comma-separated list; never use `*` in production (CORS middleware will block)
- **Rate limits:** Auth 10 req/min · Orders 20 req/min · Coupons 30 req/min (in-memory per Lambda instance)

### Key Env Vars

| Variable | Purpose |
|---|---|
| `TABLE_NAME` | DynamoDB table (e.g., `shopreturngifts-prod`) |
| `S3_BUCKET` | Asset bucket name |
| `COGNITO_USER_POOL_ID` | Auth pool |
| `COGNITO_APP_CLIENT_ID` | Auth client |
| `AWS_REGION` | Deployment region |
| `STRIPE_SECRET_KEY` | Stripe server-side key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `ALLOWED_ORIGINS` | CORS allowed origins (comma-separated) |

---

## Step 1 — Understand the Request

1. Read the relevant source files before touching anything.
2. Check `src/types/index.ts` for existing TypeScript interfaces.
3. Check `backend/internal/models/models.go` for existing Go structs.
4. Check `backend/internal/router/router.go` for existing routes.
5. Check `backend/internal/handlers/openapi.go` for existing operations registered in the live spec.

---

## Step 2 — Plan

- Identify which layers are affected: frontend only / backend only / both.
- List every file that needs to change.
- Note any new API routes or modified request/response shapes.
- Flag any DynamoDB access pattern changes (new GSI use, new PK/SK, etc.).

---

## Step 3 — Implement

Follow project conventions:

**Frontend**
- Functional components only; no class components.
- Use `useQuery` / `useMutation` from TanStack Query for all API calls — never raw `fetch` in render.
- Zustand for cart (`shopreturngifts-cart`) and auth (`shopreturngifts-auth`); React Query for server data.
- Tailwind CSS only — no inline styles, no CSS-in-JS.
- Zod schema + React Hook Form for all forms.
- Import shadcn/ui components from `@/components/ui/*`.
- All API calls go through `src/lib/api.ts`; auth token auto-injected from Zustand.

**Backend**
- Handler signature: `func (h *Handlers) Name(w http.ResponseWriter, r *http.Request)`
- Always decode body with error check; validate all inputs at the boundary.
- Use `writeJSON` / `writeError` helpers — never write raw bytes.
- Read env vars with `os.Getenv`; never hardcode secrets.
- New routes go in `backend/internal/router/router.go` in the correct group (public / authed / admin).
- New DB methods go in `backend/internal/store/dynamodb.go`.
- New request/response types go in `backend/internal/models/models.go`.

---

## Step 4 — Update OpenAPI Spec (MANDATORY)

**After every API change** (new route, changed request/response, new parameter, status code change), update `backend/internal/handlers/openapi.go`.

See full guide: [openapi-update.md](./references/openapi-update.md)

**Quick checklist:**
- [ ] New route → add an `openAPIOperation` entry in the appropriate section.
- [ ] Changed request params → update `Parameters` slice.
- [ ] Changed response shape → update `description` and `StatusCode`.
- [ ] Removed route → delete its entry.
- [ ] Run `GET /api/openapi.json` mentally: does the spec match the router exactly?

---

## Step 5 — Run Playwright E2E Tests

After implementation and OpenAPI update, run the full E2E suite:

```bash
bunx playwright test
```

Or a targeted spec:

```bash
bunx playwright test e2e/<spec-file>.spec.ts
```

E2E test files:

| File | Covers |
|---|---|
| `e2e/auth.spec.ts` | Login, signup, verification flow |
| `e2e/catalog-item-cart.spec.ts` | Browse products, add to cart |
| `e2e/checkout-cards.spec.ts` | Stripe card input, order creation |
| `e2e/guard-and-checkout.spec.ts` | Auth guard redirects, checkout flow |
| `e2e/discount-promotions-tax.spec.ts` | Coupons, tax calculation |
| `e2e/account-delivery-cancellation.spec.ts` | Profile, orders, cancellation |
| `e2e/store.spec.ts` | General store browsing |

All tests use `e2e/fixtures/mockApi.ts` to mock the backend — **they do not hit a live API**.

---

## Step 6 — Triage Failures

If any tests fail, follow the triage guide: [playwright-triage.md](./references/playwright-triage.md)

**Quick decision tree:**

```
Test fails?
├── Is the test asserting exact UI copy or a business rule that changed?
│   └── YES → Business change. Update the test to match new expected behavior.
│       Confirm with user: "The test expected X, but the new behavior is Y — is that intentional?"
└── NO
    ├── Is there a new mock shape mismatch? (e.g., field renamed, new required field)
    │   └── YES → Update mockApi.ts to match updated model/response shape.
    └── Unexpected JS error / selector not found / timing issue?
        └── YES → Code regression. Fix the implementation, not the test.
```

**Known platform-specific gotchas:**
- shadcn `Label` components often lack `htmlFor` — use scoped sibling input locators, not `getByLabel`.
- Cart / order totals appear in multiple places — scope assertions to a container to avoid strict-mode collisions.
- Order IDs from raw DynamoDB can appear as `ORDER#<id>` — verify normalization in the store layer.
- `invoiceS3Key` may be absent on newly created orders — guard the PDF download button accordingly.

---

## Step 7 — Report to User

After tests pass or after triage:

1. **If all green:** Summarize what changed (files, routes, OpenAPI ops) and confirm tests passed.
2. **If failures need user input:** Provide the triage diagnosis clearly:
   - What failed and why.
   - Whether it looks like a **business change** (needs intentional test update) or a **code regression** (needs fix).
   - The specific assertion that broke and what the new behavior is.
3. Never silently ignore a failing test.

---

## Quick Build Reference

```bash
# Frontend dev server
bun run dev

# Frontend build
bun run build

# Frontend unit tests
bun run test

# Playwright E2E
bunx playwright test

# Backend build (Lambda-ready)
cd backend && make build
# Produces: backend/bootstrap (ARM64 Linux binary)

# Backend tests
cd backend && go test ./...

# Backend tidy
cd backend && go mod tidy
```
