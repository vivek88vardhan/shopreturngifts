# Apple Pay Setup for KiranaBandi

This guide covers enabling Apple Pay in Stripe and verifying the domain for **shopreturngifts.com**.

**Platform:** KiranaBandi · Phoenix, AZ · Go Lambda backend · React + Vite frontend · AWS CloudFront + S3

---

## How Apple Pay Works in This Platform

Apple Pay is **not** a separate payment method type — it is a wallet that tokenizes a card from the customer's Apple Wallet. When a customer pays with Apple Pay, Stripe processes it as a `card` transaction.

In the codebase:
- `"card"` in `PaymentMethodTypes` on the backend PaymentIntent covers Apple Pay transactions
- `wallets: { applePay: 'auto' }` in `StripePaymentForm.tsx` tells the Stripe `PaymentElement` to show the Apple Pay button when the device and browser support it

Apple Pay button is only shown on:
- Safari on **iOS** (iPhone, iPad)
- Safari on **macOS** (with Touch ID or Apple Watch)
- Chrome on **iOS**

It is automatically hidden on all other browsers — no code change needed.

---

## Prerequisites

- KiranaBandi deployed to AWS at `https://shopreturngifts.com`
- Site is served over **HTTPS** (CloudFront handles this ✅)
- Stripe account with a live/test mode active

---

## 1. Enable Apple Pay in Stripe Dashboard

1. Go to **[Stripe Dashboard](https://dashboard.stripe.com) → Settings → Payment Methods**
2. Find **Apple Pay** in the list
3. Toggle it **On**
4. Click **Save**

---

## 2. Verify the Domain with Apple

Apple requires every domain that displays an Apple Pay button to be registered and verified. Stripe automates this.

1. Go to **Stripe Dashboard → Settings → Payment Methods → Apple Pay**
2. Click **"Add new domain"**
3. Enter:
   ```
   shopreturngifts.com
   ```
4. Click **Add**

Stripe will automatically serve the Apple verification file at:
```
https://shopreturngifts.com/.well-known/apple-developer-merchantid-domain-association
```

> **This works automatically** because the frontend is served via CloudFront + S3 and Stripe.js intercepts requests to that path. No manual file upload to S3 is needed.

If the automatic verification fails (uncommon), manually upload the file:

```bash
# Download the verification file from Stripe Dashboard after adding the domain
# Then upload it to the S3 bucket under the correct path

aws s3 cp apple-developer-merchantid-domain-association \
  s3://YOUR_S3_BUCKET/.well-known/apple-developer-merchantid-domain-association \
  --content-type "application/octet-stream"
```

Then invalidate CloudFront so the new path is served immediately:
```bash
aws cloudfront create-invalidation \
  --distribution-id YOUR_DISTRIBUTION_ID \
  --paths "/.well-known/apple-developer-merchantid-domain-association"
```

---

## 3. Add www Subdomain (Recommended)

If your site is also accessible at `www.shopreturngifts.com`, register that domain too:

1. Repeat Step 2 with:
   ```
   www.shopreturngifts.com
   ```

Apple Pay verification is **per domain** — both the apex and `www` must be registered separately.

---

## 4. Code Reference

The following files are already configured — no changes needed:

**Backend** — `backend/internal/handlers/handlers.go`
```go
PaymentMethodTypes: []*string{
    stripe.String("card"),       // covers Apple Pay transactions
    stripe.String("amazon_pay"),
},
```

**Frontend** — `src/components/checkout/StripePaymentForm.tsx`
```tsx
<PaymentElement
  options={{
    wallets: { applePay: 'auto', googlePay: 'never' },
  }}
  ...
/>
```

---

## 5. Test Apple Pay

Stripe test mode supports Apple Pay on real Apple devices.

1. Open `https://shopreturngifts.com/checkout` in **Safari on iPhone or Mac**
2. Add a test card to Apple Wallet:
   ```
   Card number:  4242 4242 4242 4242
   Expiry:       Any future date
   CVC:          Any 3 digits
   ```
3. Proceed to the Payment step in checkout
4. The **Apple Pay button** should appear above the card form
5. Complete the payment using Face ID / Touch ID

> If the Apple Pay button does not appear, confirm domain verification is complete in the Stripe Dashboard and that you are on Safari (not Chrome/Firefox on desktop).

---

## 6. Go Live Checklist

| Step | Status |
|---|---|
| Enable Apple Pay in Stripe Dashboard | ☐ |
| Add domain `shopreturngifts.com` in Stripe → Apple Pay | ☐ |
| Add domain `www.shopreturngifts.com` in Stripe → Apple Pay | ☐ |
| Confirm domain shows "Verified" in Stripe Dashboard | ☐ |
| Test on Safari iOS with test card | ☐ |
| Switch Stripe to live mode and retest | ☐ |

---

## 7. Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| Apple Pay button not showing | Domain not verified with Apple via Stripe | Complete Step 2 and confirm "Verified" status |
| Apple Pay button not showing | Not on Safari (iOS/macOS) or Chrome (iOS) | Expected — Apple Pay only shows on supported browsers |
| Apple Pay button not showing | Stripe test mode + no card in Apple Wallet | Add a test card to Apple Wallet on the device |
| Domain verification failed | Verification file not reachable at `/.well-known/` path | Manually upload file to S3 (see Step 2) |
| Payment declined | Using a declined test card | Use `4242 4242 4242 4242` for success |
| `apple_pay` not in Stripe Dashboard | Apple Pay not enabled | Complete Step 1 |

---

## 8. Reference

| Item | Value |
|---|---|
| Domain | `shopreturngifts.com` |
| Frontend URL | `https://shopreturngifts.com` |
| Apple Pay verification path | `https://shopreturngifts.com/.well-known/apple-developer-merchantid-domain-association` |
| Stripe Dashboard | `https://dashboard.stripe.com/settings/payment_methods` |
| Payment method type in code | `"card"` (Apple Pay tokenizes to card) |
| Frontend wallet option | `wallets: { applePay: 'auto' }` |
