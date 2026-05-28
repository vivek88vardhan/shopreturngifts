# Amazon Pay Setup for KiranaBandi

This guide covers creating an Amazon Pay merchant account and connecting it to Stripe for **shopreturngifts.com**.

**Platform:** KiranaBandi · Phoenix, AZ · Go Lambda backend · React + Vite frontend · AWS CloudFront + S3

---

## How Amazon Pay Works in This Platform

Unlike Apple Pay, Amazon Pay **is** a standalone payment method type in Stripe. When a customer clicks the Amazon Pay button:

1. The customer is **redirected to Amazon** to authenticate and select their payment method and address
2. Amazon redirects the customer back to `https://shopreturngifts.com/checkout/success?orderId=...`
3. Stripe confirms the payment on return

In the codebase:
- `"amazon_pay"` in `PaymentMethodTypes` on the backend PaymentIntent enables the Amazon Pay button in the Stripe `PaymentElement`
- The `return_url` in `stripe.confirmPayment()` already handles the redirect back — no code change needed

---

## Prerequisites

- KiranaBandi deployed to AWS at `https://shopreturngifts.com`
- Site is served over **HTTPS** ✅
- A US business entity (Amazon Pay US is for US merchants — matches Phoenix, AZ ✅)
- An Amazon seller / business account, or ability to create one
- Stripe account active

---

## 1. Create an Amazon Pay Merchant Account

1. Go to **[pay.amazon.com/business](https://pay.amazon.com/business)**
2. Click **"Get started"**
3. Sign in with your existing Amazon account or create a new business account
4. Complete the merchant registration:

   | Field | Value |
   |---|---|
   | Business name | ShopReturnGifts (or your legal business name) |
   | Business address | Phoenix, AZ, USA |
   | Business type | Sole proprietor / LLC / Corporation (as applicable) |
   | Bank account | US checking account for payouts |
   | Tax ID | SSN or EIN |

5. Complete identity verification — Amazon may request documents (government ID, utility bill)
6. Once approved, you will have access to **Amazon Pay Seller Central**

> Approval typically takes **1–3 business days**.

---

## 2. Connect Amazon Pay to Stripe

1. Go to **[Stripe Dashboard](https://dashboard.stripe.com) → Settings → Payment Methods**
2. Find **Amazon Pay** in the list and click **"Set up"**
3. Click **"Connect with Amazon"**
4. You will be redirected to Amazon — log in with your Amazon Pay merchant credentials
5. Review the permissions and click **"Allow"**
6. You are redirected back to Stripe — Amazon Pay now shows as **Connected**

> This is a one-time OAuth authorization between Stripe and your Amazon Pay merchant account.

---

## 3. Configure Return and Cancel URLs

Amazon Pay requires registered URLs for post-payment redirects.

In **Amazon Pay Seller Central → Integration → Allowed JavaScript Origins and Return URLs**, add:

| Type | URL |
|---|---|
| Allowed JavaScript Origin | `https://shopreturngifts.com` |
| Allowed Return URL | `https://shopreturngifts.com/checkout/success` |
| Allowed Return URL | `https://shopreturngifts.com/checkout/failure` |

> The `return_url` in the Stripe `confirmPayment()` call already points to:
> ```
> https://shopreturngifts.com/checkout/success?orderId=...
> ```
> No code change is needed.

---

## 4. Code Reference

The following files are already configured — no changes needed:

**Backend** — `backend/internal/handlers/handlers.go`
```go
PaymentMethodTypes: []*string{
    stripe.String("card"),
    stripe.String("amazon_pay"),  // Amazon Pay enabled
},
```

**Frontend** — `src/components/checkout/StripePaymentForm.tsx`
```tsx
const result = await stripe.confirmPayment({
  elements,
  confirmParams: {
    return_url: `${window.location.origin}/checkout/success?orderId=${encodeURIComponent(orderId)}`,
  },
});
```

The `PaymentElement` automatically renders the Amazon Pay button when `amazon_pay` is in the PaymentIntent's `payment_method_types`.

---

## 5. Test Amazon Pay (Sandbox)

Amazon Pay provides a sandbox environment separate from Stripe test mode.

### Create a Sandbox Buyer Account

1. In **Amazon Pay Seller Central → Integration → Sandbox Accounts**
2. Click **"Create a new test account"**
3. Fill in:
   - Email: any test email (e.g. `buyer-test@shopreturngifts.com`)
   - Name, address (use a Phoenix, AZ address)
   - Payment method: use Amazon's sandbox test card
4. Save the test account credentials

### Test the Checkout Flow

1. Open `https://shopreturngifts.com/checkout` in a browser
2. Proceed to the Payment step
3. The **Amazon Pay button** appears in the Stripe PaymentElement
4. Click it — you are redirected to Amazon's sandbox login
5. Log in with the sandbox buyer account created above
6. Select the test payment method and confirm
7. You are redirected back to `https://shopreturngifts.com/checkout/success`

> **Note:** Amazon Pay sandbox and Stripe test mode operate independently. Use the Amazon sandbox buyer account for the Amazon authentication step.

---

## 6. Go Live Checklist

| Step | Status |
|---|---|
| Create Amazon Pay merchant account at pay.amazon.com/business | ☐ |
| Complete identity verification and get merchant account approved | ☐ |
| Connect Amazon Pay to Stripe via Dashboard OAuth flow | ☐ |
| Add `shopreturngifts.com` to Allowed JavaScript Origins in Amazon Pay Seller Central | ☐ |
| Add return URLs to Amazon Pay Seller Central | ☐ |
| Test with Amazon Pay sandbox buyer account | ☐ |
| Switch Stripe to live mode and retest with real Amazon account | ☐ |

---

## 7. Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| Amazon Pay button not showing in checkout | Amazon Pay not connected to Stripe | Complete Steps 1 and 2 |
| Amazon Pay button not showing | `amazon_pay` missing from PaymentIntent | Confirm backend `PaymentMethodTypes` includes `stripe.String("amazon_pay")` |
| Redirect back fails after Amazon authentication | Return URL not registered in Amazon Pay Seller Central | Add `https://shopreturngifts.com/checkout/success` in Step 3 |
| `UnauthorizedAccess` on Amazon redirect | JavaScript origin not registered | Add `https://shopreturngifts.com` to Allowed JavaScript Origins in Step 3 |
| Amazon Pay greyed out in Stripe Dashboard | Merchant account not yet approved | Wait for Amazon approval (1–3 business days) |
| Customer sees "not available in your region" | Customer is outside the US | Amazon Pay US is only for US customers — expected behavior |

---

## 8. Reference

| Item | Value |
|---|---|
| Domain | `shopreturngifts.com` |
| Frontend URL | `https://shopreturngifts.com` |
| Checkout success URL | `https://shopreturngifts.com/checkout/success` |
| Checkout failure URL | `https://shopreturngifts.com/checkout/failure` |
| Amazon Pay merchant portal | `https://sellercentral.amazon.com` |
| Amazon Pay developer portal | `https://pay.amazon.com/business` |
| Stripe Dashboard | `https://dashboard.stripe.com/settings/payment_methods` |
| Payment method type in code | `"amazon_pay"` |
| Business location | Phoenix, AZ, USA |
