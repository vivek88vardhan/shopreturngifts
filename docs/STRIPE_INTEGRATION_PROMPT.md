# Stripe Integration — Implementation Prompt
**Platform:** Phoenix, AZ eCommerce (Go Lambda backend · Next.js 14 Static Export · AWS)  
**Payment model:** Authorize now → Capture after configurable delay (default 5 hours)  
**Rule:** Publishable key (`pk_*`) in frontend only · Secret key (`sk_*`) in Go Lambda via AWS Secrets Manager only  

---

## Test Card Numbers

> Use any future expiry date, any 3-digit CVC, and any 5-digit ZIP.

**✅ Succeeds — happy path tests**
```
4242 4242 4242 4242
```

**❌ Card declined — failure tests**
```
4000 0000 0000 0002
```

**🔐 Requires 3D Secure — auth tests**
```
4000 0025 0000 3155
```

**💸 Insufficient funds**
```
4000 0000 0000 9995
```

---

## 1. Context — How This Platform Works

The platform uses a **delayed capture model**. When a customer places an order:
1. The Go Lambda creates a Stripe PaymentIntent with `capture_method: "manual"` — the card is **authorized** (hold placed) but **not charged**
2. A `CAPJOB#` DynamoDB record is created with a TTL set to `now + capture_delay_hours`
3. When the TTL fires, DynamoDB Streams triggers the `payment-capture` Lambda, which calls `stripe.Capture()` — **this is when the card is actually charged**
4. If the order is cancelled before capture, the Lambda calls `stripe.Cancel()` instead — the customer is never charged

This means a customer who cancels within 24 hours is never billed, even though their card showed a pending hold.

---

## 2. Keys — Where Each One Lives

### Publishable Key (`pk_live_...` / `pk_test_...`)
- Loaded at runtime by the Next.js frontend from the `/api/config` endpoint
- Stored in `store.config.json` → `payments.stripe_publishable_key`
- Also in `frontend/.env` as `STRIPE_PUBLISHABLE_KEY` (local dev fallback)
- Safe to be public — cannot charge cards on its own
- Used by: `loadStripe()`, `<Elements>` provider, `stripe.confirmPayment()`

### Secret Key (`sk_live_...` / `sk_test_...`)
- Stored in AWS Secrets Manager: secret name `ecommerce/production/backend`, JSON key `STRIPE_SECRET_KEY`
- Loaded into Go Lambda at cold start via `internal/config/secrets.go`
- Locally: `backend/.env` (git-ignored), key `STRIPE_SECRET_KEY`
- Never appears in frontend code, logs, or Git
- Used by: `paymentintent.New()`, `paymentintent.Capture()`, `paymentintent.Cancel()`, `refund.New()`

### Webhook Signing Secret (`whsec_...`)
- Stored in AWS Secrets Manager: same secret object, JSON key `STRIPE_WEBHOOK_SECRET`
- Locally: `backend/.env`, key `STRIPE_WEBHOOK_SECRET`
- Used only by the `stripe-webhook` Lambda to verify incoming event signatures
- Never exposed outside the Lambda

---

## 3. AWS Secrets Manager Secret Structure

Secret name: `ecommerce/production/backend`  
Secret name (staging): `ecommerce/staging/backend`  
Secret name (local reference): values come from `backend/.env` instead

The secret is a single JSON object:

```json
{
  "STRIPE_SECRET_KEY":      "sk_live_...",
  "STRIPE_WEBHOOK_SECRET":  "whsec_...",
  "COGNITO_CLIENT_SECRET":  "..."
}
```

The Go config loader (`internal/config/secrets.go`) reads this secret once on cold start and caches in memory. Individual Lambdas access the secret values via the `AppConfig` struct — never via `os.Getenv()` directly.

---

## 4. Go Lambda — Stripe Client Initialization

### File: `backend/internal/stripe/client.go`

Purpose: Initialize the Stripe Go SDK once at Lambda cold start using the secret key from `AppConfig`. All other Stripe operations import from this package.

Requirements:
- Import `github.com/stripe/stripe-go/v82`
- Expose an `Init(secretKey string)` function that sets `stripe.Key`
- Expose an `IsInitialized() bool` helper for health checks
- Log (without exposing the key value) that Stripe has been initialized

### File: `backend/internal/stripe/webhook.go`

Purpose: Verify incoming Stripe webhook signatures.

Requirements:
- Expose a `VerifyWebhook(body []byte, signature string, secret string) (stripe.Event, error)` function
- Use `webhook.ConstructEvent(body, signature, secret)` from `github.com/stripe/stripe-go/v82/webhook`
- The `body` parameter MUST be the raw request body bytes — never a parsed/re-serialized JSON body, because signature verification uses the exact bytes Stripe sent
- Return a typed `stripe.Event` on success, error on invalid signature

---

## 5. Go Lambda — orders-create

### File: `backend/cmd/orders-create/main.go`

**Route:** `POST /api/orders`  
**Auth:** User (Cognito JWT required)  
**Purpose:** Validate cart → create order in DynamoDB → create Stripe PaymentIntent → return client_secret to frontend

**Complete sequence the Lambda must perform:**

1. Extract and verify Cognito JWT from the Authorization header. Get `user_id` from claims.

2. Load the full cart from DynamoDB (`CART#{user_id}` → all `ITEM#` sort keys). If cart is empty, return error `CART_EMPTY`.

3. For each cart item, load the current item record from DynamoDB and verify:
   - Item is still active
   - Available stock (`stock - reserved_stock`) >= requested quantity
   - Requested quantity does not exceed `max_order_qty` for the item
   - If any check fails, return `ITEM_OUT_OF_STOCK` or `EXCEEDS_MAX_ORDER_QTY` with the item name

4. Calculate order totals:
   - Subtotal: sum of (unit_price × quantity) for all line items
   - Discount: from applied coupon (stored on cart record) — validate the coupon is still active and not expired
   - Shipping: look up the delivery ZIP in `store.config.json` shipping zones. Apply free shipping if subtotal exceeds `shipping.free_above_amount`. Otherwise use `shipping.fee`.
   - Tax: call `internal/tax.Calculate(zipCode, lineItems)` which queries DynamoDB for `TAX#ZIP#{zip}` records
   - Grand total: subtotal − discount + shipping + tax
   - Convert grand total to cents (integer): `grandTotalCents = int64(math.Round(grandTotal * 100))`

5. Create the Stripe PaymentIntent:
   ```
   Amount:        grandTotalCents   (must be integer cents, e.g. 4999 for $49.99)
   Currency:      "usd"
   CaptureMethod: "manual"          (authorize only — do not charge yet)
   AutomaticPaymentMethods: enabled (covers card, Apple Pay, Google Pay)
   Metadata:
     order_id:  <generated UUID>
     store_id:  from AppConfig
     user_id:   from JWT claims
   ```

6. Inside a DynamoDB TransactWrite (atomic):
   - `PutItem` the `ORDER#{order_id}` record with:
     - status: `"authorized"`
     - payment_status: `"authorized"`
     - stripe_payment_intent_id: `pi.ID` from Stripe response
     - stripe_client_secret: `pi.ClientSecret` (returned to frontend, NOT stored permanently)
     - subtotal, discount, shipping_fee, tax, grand_total (in cents)
     - address_snapshot: full JSON of the selected address
     - line_items_snapshot: array of {item_id, name, sku, unit_price, quantity, tax_category}
     - coupon_code: if applied
     - fulfillment_provider: `"internal"` if ZIP is in internal list, else `"external"`
     - created_at: current UTC timestamp
   - For each line item: `UpdateItem` on `ITEM#{id}/VARIANT#{id}` to increment `reserved_stock` by quantity, using a condition that `stock - reserved_stock >= requested_quantity`
   - If the TransactWrite fails due to condition check (stock gone between validation and write), return `ITEM_OUT_OF_STOCK`

7. Create the `CAPJOB#{order_id}` DynamoDB record:
   - `payment_intent_id`: `pi.ID`
   - `order_id`: order UUID
   - `scheduled_capture_at`: current time + `AppConfig.Payment.CaptureDelayHours`
   - `ttl`: Unix timestamp of `scheduled_capture_at`
   - `status`: `"pending"`

8. Return to frontend:
   ```json
   {
     "success": true,
     "data": {
       "order_id": "...",
       "client_secret": "pi_xxx_secret_xxx",
       "amount_cents": 4999,
       "currency": "usd"
     }
   }
   ```

**Important rules:**
- Never log the `client_secret`
- Never store the `client_secret` permanently in DynamoDB (it expires)
- The TransactWrite must be truly atomic — partial writes must not happen
- Amount in Stripe API must be an integer (cents), never a float

---

## 6. Go Lambda — payment-confirm

### File: `backend/cmd/payment-confirm/main.go`

**Route:** `POST /api/orders/:id/payment/confirm`  
**Auth:** User (Cognito JWT required)  
**Purpose:** Called by the frontend after `stripe.confirmPayment()` succeeds. Verifies the PaymentIntent status with Stripe and updates the order.

**Sequence:**

1. Get `order_id` from path parameter. Get `payment_intent_id` from request body.

2. Verify the order belongs to the authenticated user (load order from DynamoDB, check `user_id` matches JWT claim).

3. Call Stripe API to retrieve the PaymentIntent: `paymentintent.Get(paymentIntentID, nil)`. Verify its status is `"requires_capture"`. If not, return `PAYMENT_NOT_AUTHORIZED`.

4. Verify the PaymentIntent metadata `order_id` matches the path parameter (prevents substitution attacks).

5. Update DynamoDB `ORDER#{id}`:
   - `payment_status`: `"authorized"`
   - `authorized_at`: current UTC timestamp

6. Return:
   ```json
   {
     "success": true,
     "data": {
       "order_id": "...",
       "status": "authorized",
       "message": "Your order is confirmed. Card will be charged within 5 hours."
     }
   }
   ```

---

## 7. Go Lambda — payment-capture (DynamoDB Stream Trigger)

### File: `backend/cmd/payment-capture/main.go`

**Trigger:** DynamoDB Streams — REMOVE events on `CAPJOB#` records (fired by TTL expiry)  
**Auth:** None — internal Lambda, not exposed via API Gateway  
**Purpose:** Capture the Stripe charge after the delay period expires

**Sequence:**

1. Iterate over `event.Records`. Skip any record where `EventName != "REMOVE"`.

2. Skip any REMOVE event that was not caused by TTL — check that `record.UserIdentity.Type == "Service"` and `record.UserIdentity.PrincipalId == "dynamodb.amazonaws.com"`. This prevents manual deletes from triggering unintended captures.

3. Read `order_id` and `payment_intent_id` from `record.Change.OldImage`.

4. Load the order from DynamoDB. If the order status is `"cancelled"`:
   - Call `paymentintent.Cancel(paymentIntentID, nil)`
   - Update order: `payment_status = "cancelled"`, `capture_cancelled_at = now`
   - Log: "Order was cancelled before capture — authorization released"
   - Continue to next record

5. If the order status is `"authorized"` or `"confirmed"` or `"packed"`:
   - Call `paymentintent.Capture(paymentIntentID, nil)`
   - If Stripe returns an error (e.g. card declined on capture):
     - Update order: `payment_status = "capture_failed"`
     - Write a `NOTIF#` record to DynamoDB for the customer notification
     - Return the error (DLQ will retry up to 3 times)
   - If capture succeeds:
     - Update order: `payment_status = "paid"`, `paid_at = now`, `stripe_charge_id = charge.ID`
     - Write a `NOTIF#` record for order confirmation notification
     - Log: "Capture successful for order {order_id}"

6. This handler must be **idempotent** — if it processes the same CAPJOB record twice (retry scenario), calling `paymentintent.Capture` on an already-captured PaymentIntent returns an error from Stripe. Check for the error code `"charge_already_captured"` and treat it as success.

**DLQ setup required in AWS SAM template:** If this Lambda returns an error, the stream record goes to a Dead Letter Queue (SQS or DynamoDB) for manual review. Configure `DestinationConfig` on the event source mapping.

---

## 8. Go Lambda — stripe-webhook

### File: `backend/cmd/stripe-webhook/main.go`

**Route:** `POST /api/stripe/webhook`  
**Auth:** Stripe webhook signature (NOT Cognito JWT — this endpoint is public)  
**Purpose:** Receive and process Stripe events as a backup confirmation mechanism

**Critical rules:**
- This route must be excluded from the Cognito JWT authorizer in the API Gateway / SAM template
- Must return HTTP 200 quickly — Stripe retries any non-2xx for up to 72 hours
- All event processing must be idempotent
- Signature verification is mandatory before any processing

**Sequence:**

1. Extract raw body bytes and `Stripe-Signature` header.

2. Call `stripe.VerifyWebhook(rawBody, signature, cfg.StripeWebhookSecret)`. If verification fails, return HTTP 400 immediately with no further processing and no logging of the body.

3. Switch on `event.Type`:

   **`payment_intent.succeeded`**
   - Parse `event.Data.Object` as a `stripe.PaymentIntent`
   - Get `order_id` from `paymentIntent.Metadata["order_id"]`
   - Load order from DynamoDB
   - If `payment_status` is already `"paid"`, skip (idempotent — already processed by payment-capture Lambda)
   - Otherwise update: `payment_status = "paid"`, `paid_at = now`
   - This serves as a backup confirmation if the payment-capture Lambda missed the event

   **`payment_intent.payment_failed`**
   - Get `order_id` from metadata
   - Update order: `payment_status = "capture_failed"`
   - Write `NOTIF#` record: notify customer that payment capture failed and to contact support

   **`payment_intent.canceled`**
   - Get `order_id` from metadata
   - Update order: `payment_status = "cancelled"` if not already

   **`charge.dispute.created`**
   - Get charge ID, find associated order via a GSI on `stripe_charge_id` or metadata
   - Update order: `status = "disputed"`, `payment_status = "disputed"`
   - Write `NOTIF#` record: notify admin of chargeback with dispute amount and reason

   **`charge.refunded`**
   - Update order: `payment_status = "refunded"` or `"partially_refunded"` based on `charge.AmountRefunded`

4. Return HTTP 200 with empty body for all handled events.
5. Return HTTP 200 also for unhandled event types (do not return 400 for unknown events — Stripe may send new event types).

---

## 9. Go Lambda — admin-orders-refund

### File: `backend/cmd/admin-orders-refund/main.go`

**Route:** `POST /api/admin/orders/:id/refund`  
**Auth:** Admin role required  
**Body:** `{ "amount_cents": 2500, "reason": "duplicate" }`

**Sequence:**

1. Load order from DynamoDB. Verify `payment_status` is `"paid"`. If `"authorized"` (not yet captured), cancel the PaymentIntent instead of issuing a refund — this is different.

2. Validate `amount_cents` does not exceed `grand_total_cents - already_refunded_cents`.

3. Valid reason values (Stripe enum): `"duplicate"`, `"fraudulent"`, `"requested_by_customer"`. Default to `"requested_by_customer"` if not provided.

4. Call Stripe refund API:
   ```
   ChargeID:    order.StripeChargeID   (from when payment was captured)
   Amount:      amountCents            (omit for full refund)
   Reason:      reason
   ```

5. Update DynamoDB order:
   - `refunded_amount_cents`: incremented by `amount_cents`
   - `payment_status`: `"refunded"` if fully refunded, `"partially_refunded"` if partial
   - Append event to `ORDER#{id}/EVENT#{timestamp}` with admin user ID, refund amount, and reason

6. Return:
   ```json
   {
     "success": true,
     "data": {
       "refunded_amount_cents": 2500,
       "refund_id": "re_xxx",
       "payment_status": "partially_refunded"
     }
   }
   ```

---

## 10. Next.js Frontend — Stripe Integration

### File: `frontend/src/lib/stripe.ts`

Purpose: Create and export the Stripe promise, initialized with the publishable key from the store config.

Requirements:
- Import `loadStripe` from `@stripe/stripe-js`
- The publishable key comes from the config loaded via `useConfig()` hook or the `/api/config` endpoint
- Export a function `getStripePromise(publishableKey: string)` that calls `loadStripe(publishableKey)`
- Cache the promise — do not call `loadStripe` on every render
- The publishable key is safe to be in client-side code — it is designed to be public

### File: `frontend/src/app/checkout/payment/page.tsx`

Purpose: The payment step of checkout. Wraps the payment form with the Stripe Elements provider and passes the `clientSecret` received from the `orders-create` API response.

Requirements:
- Install dependencies: `npm install @stripe/stripe-js @stripe/react-stripe-js`
- Import `Elements` from `@stripe/react-stripe-js`
- Import `loadStripe` from `@stripe/stripe-js`
- The `clientSecret` is obtained from a previous API call to `POST /api/orders` which the user completed on the address step — pass it via React state or URL search params (not localStorage)
- Render the `<Elements>` provider wrapping the payment form component
- Pass `options={{ clientSecret }}` to the `<Elements>` provider
- Pass the Stripe promise from `getStripePromise(config.payments.stripe_publishable_key)`

### File: `frontend/src/components/checkout/StripePaymentForm.tsx`

Purpose: The actual payment form. Uses Stripe's `<PaymentElement>` which automatically renders card fields, Apple Pay button, and Google Pay button based on the customer's browser and device.

Requirements:
- Import `PaymentElement`, `useStripe`, `useElements` from `@stripe/react-stripe-js`
- The form has a single submit handler that calls `stripe.confirmPayment()`
- `confirmPayment` parameters:
  - `elements`: the elements instance from `useElements()`
  - `confirmParams.return_url`: set to `${window.location.origin}/orders/${orderId}/confirmation`
- On success, Stripe handles the redirect automatically — no manual redirect needed
- On error, display `error.message` in a `data-testid="payment-error"` element
- While processing, disable the submit button and show a loading state
- The button must have `data-testid="place-order-btn"`
- Card details never touch the Next.js app or the Go Lambda — they go directly from browser to Stripe

### File: `frontend/src/app/orders/[id]/confirmation/page.tsx`

Purpose: Displayed after Stripe redirects back after payment authorization.

Requirements:
- On mount, read `payment_intent` and `payment_intent_client_secret` from URL query params (Stripe adds these on redirect)
- Call `POST /api/orders/:id/payment/confirm` with `{ payment_intent_id: searchParams.get('payment_intent') }`
- Show loading state while confirming
- On success: show order confirmation UI with order ID, estimated delivery, items summary
- On failure: show error with contact support link
- Elements with required `data-testid` attributes:
  - `data-testid="success-icon"` — animated checkmark
  - `data-testid="order-id"` — displays the order reference number
  - `data-testid="estimated-delivery"` — shows estimated delivery date
  - `data-testid="track-order-btn"` — links to `/orders/:id`
  - `data-testid="continue-shopping-btn"` — links to `/`
  - `data-testid="receipt-download-btn"` — calls `GET /api/orders/:id/receipt`

---

## 11. store.config.json — Stripe Configuration Block

The following block must be present in `store.config.json` (stored in S3). The `stripe_publishable_key` is served to the frontend via `GET /api/config`. The secret key is never in this file.

```json
"payments": {
  "stripe_publishable_key": "pk_live_...",
  "methods": ["card", "apple_pay", "google_pay"],
  "capture_mode": "delayed",
  "capture_delay_hours": 5,
  "capture_delay_configurable": true,
  "max_capture_delay_hours": 168,
  "currency": "usd",
  "statement_descriptor": "PHOENIX GROCERY"
}
```

`statement_descriptor` is what appears on the customer's bank statement. Max 22 characters, no special characters.

---

## 12. application.yml — Stripe Non-Secret Config

Add to `backend/application.yml` under the `stripe:` section. These are not secrets — they control behavior, not authentication.

```yaml
stripe:
  webhook_path: "/api/stripe/webhook"
  events:
    - "payment_intent.succeeded"
    - "payment_intent.payment_failed"
    - "payment_intent.canceled"
    - "charge.dispute.created"
    - "charge.refunded"
  idempotency_key_prefix: "phoenix-grocery"
  statement_descriptor: "PHOENIX GROCERY"
```

---

## 13. AWS SAM Template — Stripe-Related Resources

The following must be defined in the SAM template (`infra/template.yaml`):

**Lambda functions requiring Stripe secret key access:**
- `OrdersCreateFunction` — creates PaymentIntent
- `PaymentConfirmFunction` — verifies PaymentIntent status
- `PaymentCaptureFunction` — captures charge (stream trigger)
- `StripeWebhookFunction` — processes Stripe events
- `AdminOrdersRefundFunction` — issues refunds

Each of these functions needs:
- Environment variable `STRIPE_SECRET_KEY_ARN` pointing to the Secrets Manager secret ARN (not the value — the Lambda reads the value at runtime)
- IAM policy allowing `secretsmanager:GetSecretValue` on the specific secret ARN

**API Gateway route exclusion:**
- The `POST /api/stripe/webhook` route must NOT have the Cognito JWT authorizer attached. Stripe does not send a Cognito JWT — it sends its own signature header. The webhook Lambda verifies authenticity via the Stripe-Signature header instead.

**DynamoDB Stream event source mapping:**
- `PaymentCaptureFunction` must have an `Events` entry of type `DynamoDB` pointing to the DynamoDB table stream ARN
- Filter: only REMOVE events where `eventName = REMOVE`
- `StartingPosition: TRIM_HORIZON`
- `BisectBatchOnFunctionError: true` — if one record fails, split the batch to isolate the bad record
- `DestinationConfig.OnFailure`: point to an SQS queue ARN for the DLQ

**Stripe webhook IAM:**
The `StripeWebhookFunction` does NOT need Secrets Manager access to the Stripe secret key — it only needs the webhook signing secret. Keep these as separate entries in the Secrets Manager JSON to allow separate IAM scoping if needed.

---

## 14. Local Development Setup

**Step 1 — Install Stripe CLI**
```
brew install stripe/stripe-cli/stripe   (macOS)
scoop install stripe                     (Windows)
```

**Step 2 — Login to Stripe CLI**
```
stripe login
```
This opens a browser to authorize the CLI with your Stripe account.

**Step 3 — Forward webhooks to local Go server**
```
stripe listen --forward-to localhost:3000/api/stripe/webhook
```
This prints a temporary webhook signing secret (starts with `whsec_`). Copy it into `backend/.env` as `STRIPE_WEBHOOK_SECRET`. This secret is different from the production one — it is only valid during this CLI session.

**Step 4 — Set local backend .env**
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...  (from Stripe CLI output above)
APP_ENV=local
DYNAMODB_ENDPOINT_OVERRIDE=http://localhost:8000
```

**Step 5 — Set local frontend .env**
```
STRIPE_PUBLISHABLE_KEY=pk_test_...
```

**Step 6 — Test card numbers**

| Number | Result |
|---|---|
| 4242 4242 4242 4242 | Succeeds — use for happy path tests |
| 4000 0000 0000 0002 | Card declined — use for failure tests |
| 4000 0025 0000 3155 | Requires 3D Secure — use for auth tests |
| 4000 0000 0000 9995 | Insufficient funds |

Use any future expiry (e.g. `12/29`), any 3-digit CVC, and any 5-digit ZIP.

**Step 7 — Trigger test webhook events manually**
```
stripe trigger payment_intent.succeeded
stripe trigger payment_intent.payment_failed
stripe trigger charge.dispute.created
```

**Step 8 — Test delayed capture locally**
Set `capture_delay_hours: 0` in local `store.config.json` to make the CAPJOB TTL fire immediately during testing. DynamoDB Local does not honor TTL automatically — manually delete the CAPJOB record to simulate TTL and test the Stream trigger.

---

## 15. Security Rules — Non-Negotiable

These rules must be enforced in code review. Any violation is a blocker:

| Rule | Detail |
|---|---|
| Secret key never in frontend | `sk_*` must not appear in any file under `frontend/` |
| Secret key never in Git | `backend/.env` must be in `.gitignore`. Run `git log -S "sk_" --all` to verify nothing leaked. |
| Webhook signature verified first | The first line of the webhook handler after logging is signature verification. Any code that reads the event data must be after `webhook.ConstructEvent` succeeds. |
| Raw body for webhook | The webhook handler must receive the raw bytes — no JSON parsing before signature verification. In Go: use `io.ReadAll(req.Body)` before any JSON unmarshal. In Lambda: use `[]byte(req.Body)` from the `events.APIGatewayV2HTTPRequest`. |
| Amounts always integers (cents) | `$49.99` must be sent to Stripe as `int64(4999)`. No floats. No rounding after the fact. |
| Return 200 from webhook always | Even on internal processing errors, return 200 so Stripe stops retrying. Log the error internally. |
| Idempotency on all Stripe writes | Use idempotency keys (`stripe.IdempotencyKey` header) on PaymentIntent creation if re-creating after a network error. Format: `{store_id}-order-{order_id}` |
| No client_secret in logs | The `client_secret` returned by `paymentintent.New()` must never appear in CloudWatch logs |
| Verify order ownership | The `payment-confirm` Lambda must verify the order's `user_id` matches the JWT claim before retrieving the PaymentIntent |
| Stripe metadata order_id check | In `payment-confirm`, verify `pi.Metadata["order_id"]` matches the `:id` path parameter to prevent a user from confirming someone else's payment |

---

## 16. Error Codes Returned by Payment Lambdas

All errors follow the standard response envelope: `{ "success": false, "error": { "code": "...", "message": "..." } }`

| Error Code | HTTP Status | Meaning |
|---|---|---|
| `CART_EMPTY` | 400 | Order attempted with an empty cart |
| `ITEM_OUT_OF_STOCK` | 400 | One or more items have insufficient available stock |
| `EXCEEDS_MAX_ORDER_QTY` | 400 | Requested quantity exceeds item's per-order limit |
| `EXCEEDS_BULK_THRESHOLD` | 400 | Order exceeds 50% of available stock — requires special handling |
| `STRIPE_INTENT_FAILED` | 500 | Stripe API returned an error creating the PaymentIntent |
| `PAYMENT_NOT_AUTHORIZED` | 400 | PaymentIntent status is not `requires_capture` when confirming |
| `ORDER_NOT_FOUND` | 404 | Order ID does not exist |
| `ORDER_ACCESS_DENIED` | 403 | Order belongs to a different user |
| `WEBHOOK_SIGNATURE_INVALID` | 400 | Stripe-Signature header verification failed |
| `REFUND_EXCEEDS_ORIGINAL` | 400 | Refund amount is greater than paid amount minus prior refunds |
| `REFUND_NOT_PAID` | 400 | Order has not been captured — cancel instead of refund |
| `CAPTURE_FAILED` | 500 | Stripe declined the capture (card expired, etc.) |

---

## 17. Playwright Test Cases — Stripe Integration

All tests use Stripe test cards. The Playwright config sets `baseURL` to the local Next.js dev server. The Go backend runs locally on port 3000 with `STRIPE_SECRET_KEY=sk_test_...`.

**Test: Successful checkout with Stripe card**
- Navigate to an item, add to cart, sign in, proceed to checkout
- Select a saved Phoenix address
- Stripe card form renders inside an iframe (`<PaymentElement>`)
- Fill card number `4242 4242 4242 4242`, expiry `12/29`, CVC `123`
- Click `[data-testid="place-order-btn"]`
- Assert redirect to `/orders/:id/confirmation`
- Assert `[data-testid="success-icon"]` is visible
- Assert `[data-testid="order-id"]` contains text
- Assert DynamoDB order record has `payment_status = "authorized"` (not yet `"paid"` — delayed capture)

**Test: Declined card shows error**
- Same flow but use card `4000 0000 0000 0002`
- Assert `[data-testid="payment-error"]` is visible after clicking place order
- Assert error message contains "declined"
- Assert no order is created in DynamoDB

**Test: Insufficient funds card**
- Use card `4000 0000 0000 9995`
- Assert `[data-testid="payment-error"]` shows insufficient funds message

**Test: 3D Secure card completes authentication**
- Use card `4000 0025 0000 3155`
- Assert Stripe 3DS iframe appears
- In the 3DS iframe, click "Complete authentication"
- Assert redirect to confirmation page

**Test: Order cancellation before capture releases hold**
- Complete checkout with `4242 4242 4242 4242`
- Navigate to `/account/orders`
- Click cancel on the new order (within 24h window)
- Confirm cancellation
- Assert order status is `cancelled`
- Assert Stripe PaymentIntent status is `cancelled` (no charge via Stripe API test call)

**Test: Publishable key is used in frontend, not secret key**
- In the browser page context, search `window.__STRIPE_KEY__` and all script source for `sk_` pattern
- Assert no `sk_` value is found anywhere in the browser context
- Assert `pk_test_` or `pk_live_` is used in `loadStripe()` call

**Test: Webhook endpoint rejects invalid signature**
- Send a POST to `/api/stripe/webhook` without a valid `Stripe-Signature` header
- Assert HTTP 400 response
- Assert no DynamoDB records were modified

**Test: Admin can issue partial refund**
- Sign in as admin
- Navigate to a paid order (`payment_status = "paid"`)
- Click Refund button
- Enter `$10.00` refund amount
- Confirm
- Assert order `refunded_amount_cents` updated
- Assert `payment_status` is `"partially_refunded"`

---

## 18. Go Module Dependency

Add to `backend/go.mod`:

```
require (
    github.com/stripe/stripe-go/v82  v82.x.x
    github.com/aws/aws-lambda-go     v1.x.x
    github.com/aws/aws-sdk-go-v2     v1.x.x
)
```

Run `go mod tidy` after adding the dependency to download and verify the module checksums.

---

## 19. Stripe Dashboard Configuration Checklist

Before go-live, verify the following in the Stripe Dashboard:

- Business details complete (legal name, Phoenix AZ address, EIN, bank account)
- Branding set: store logo, brand color, icon (shown on Stripe-hosted pages and receipts)
- Statement descriptor set (appears on customer bank statements, max 22 chars)
- Payment methods enabled: Cards (default), Apple Pay (requires domain verification), Google Pay (automatic)
- Radar rules reviewed: Stripe's default fraud rules are active — review and adjust if you see false positives
- Webhook endpoint registered with correct URL and all required events selected
- Test mode used for all development — live mode only activated for production deployment
- Email receipts: configure Stripe to send receipts from Stripe (optional — your platform also sends its own confirmation)

---

*End of Stripe Integration Prompt*  
*Keys: `pk_*` → Next.js frontend only · `sk_*` → Go Lambda via AWS Secrets Manager only · `whsec_*` → stripe-webhook Lambda only*
