# Playwright E2E Test Triage Guide

## Test Architecture

All E2E tests run against a **mocked backend** — they do not hit AWS or a live Lambda. The mock is defined in `e2e/fixtures/mockApi.ts` and activated in each spec via helper functions like `mockStoreApi(page)`.

This means:
- A failing test is almost never a live infra issue.
- When the API contract changes (new fields, renamed fields, new routes), `mockApi.ts` must be updated to match.

---

## Running Tests

```bash
# Full suite
bunx playwright test

# Single spec file
bunx playwright test e2e/auth.spec.ts

# With browser UI (headed — useful to see what fails)
bunx playwright test --headed

# Show test report after a run
bunx playwright show-report
```

---

## Triage Decision Tree

```
Playwright test fails?
│
├─ 1. Read the failure message carefully.
│       - Locator not found? → selector / UI structure issue
│       - Assertion value mismatch? → business rule / copy change
│       - Network/fetch mock not matched? → API contract change
│       - Timeout? → async flow or missing await
│
├─ 2. Check what changed in the code.
│       - Did UI copy change (button label, heading text)?
│       - Did a route path change?
│       - Did a response shape change (new/renamed field)?
│       - Did the flow change (page redirects, new step)?
│
├─ BUSINESS CHANGE (intentional)
│   Symptoms: Test expects old copy, old flow, or old response values.
│   Action:
│     a. Confirm with user: "The test expected X but the new behavior is Y — is this intentional?"
│     b. If YES → update the test assertions / mock data to reflect the new truth.
│     c. Do NOT silently change the test without flagging it.
│
├─ API CONTRACT CHANGE (mock mismatch)
│   Symptoms: `mockApi.ts` returns a shape that no longer matches updated models.
│   Action:
│     a. Update `e2e/fixtures/mockApi.ts` mock objects to match the new model fields.
│     b. Ensure response arrays have at least one realistic entry.
│     c. Re-run the failing spec to confirm green.
│
└─ CODE REGRESSION (bug)
    Symptoms: Nothing in the business logic changed; test was green before.
    Action:
      a. Fix the implementation code — do NOT modify the test.
      b. If the fix isn't obvious, add a `console.log` or use `--headed` to observe the failure.
      c. Cross-check with related files (router, handler, store layer, frontend component).
```

---

## Spec-by-Spec Notes

### `auth.spec.ts`
- Tests login, signup, email verification flow.
- Uses `mockLoginNeedsVerification` / `mockAuthSuccessPaths` helpers.
- Selectors use `input[type="email"]`, `input[type="password"]` — not label text (shadcn labels often lack `htmlFor`).
- If the heading text on the verify screen changes → update the `getByRole('heading')` assertion.

### `catalog-item-cart.spec.ts`
- Browses `mockProducts` (defined in `mockApi.ts`), adds items to cart.
- If `CartDrawer` subtotal appears in multiple places and strict mode fails → scope assertion to the drawer container.

### `checkout-cards.spec.ts`
- Stripe Payment Element is iframed — interact via `frameLocator` if needed.
- Order creation mock must return a full order object matching `Order` interface in `src/types/index.ts`.
- `invoiceS3Key` may be absent; PDF button should be guarded (not rendered when key is missing).

### `guard-and-checkout.spec.ts`
- Auth guard redirects unauthenticated users to `/login`.
- If the redirect target changes (e.g., adds a `?next=` param), update the URL assertion.

### `discount-promotions-tax.spec.ts`
- Coupon validation, tax calculation based on ZIP code.
- Tax amounts are currency-formatted — scope assertions to the order summary container to avoid collisions with product prices displaying the same dollar amount.

### `account-delivery-cancellation.spec.ts`
- Order detail, invoice download, 24-hour cancellation policy.
- Order ID normalization: raw DynamoDB IDs may be `ORDER#<uuid>`. Mock should use plain UUIDs; the store layer must strip the prefix before returning to the frontend.
- No `invoiceS3Key` → invoice download button must not render (test for its absence).

### `store.spec.ts`
- General store browsing; homepage hero, featured products, category navigation.

---

## Known Platform Gotchas

| Gotcha | How It Manifests | Fix |
|---|---|---|
| shadcn `Label` lacks `htmlFor` | `getByLabel('Email')` finds nothing | Use `page.locator('input[type="email"]')` or scope to a container |
| Same dollar amount in cart + product price | Strict mode `getByText('$4.99')` matches multiple elements | Wrap in `.locator('.cart-summary').getByText(...)` |
| Raw `ORDER#<id>` in order detail URL/display | UI shows `ORDER#abc123` instead of `abc123` | Fix normalization in `backend/internal/store/dynamodb.go` |
| Missing `invoiceS3Key` on new orders | Clicking invoice button errors or goes 404 | Render download button conditionally on key presence |
| Stripe iframe | Filling card fields directly fails | Use `page.frameLocator('iframe[name^=__privateStripeFrame]').locator(...)` |

---

## Updating `mockApi.ts`

When API response shapes change, update the mock objects to match:

```ts
// e2e/fixtures/mockApi.ts

// If a new field is added to Product:
export const mockProducts = [
  {
    productId: 'p1',
    name: 'Organic Apples',
    // ... existing fields ...
    newField: 'value',   // ← add here
  },
  // ...
];
```

Keep mock data realistic (use plausible values, not `null` for everything). Tests that assert on displayed values will break if mock data is unrealistic.

---

## After Fixing

1. Re-run the full suite: `bunx playwright test`
2. If a new failure appears after fixing the first, repeat the triage process.
3. Report final status: all green, or list remaining failures with diagnosis.
