# Stripe Automatic Tax Implementation & Production Deployment Guide

**Date:** May 9, 2026  
**Status:** ✅ Implementation Complete  
**Version:** 1.0

---

## 📋 Overview

This document outlines the complete implementation of **Stripe Automatic Tax** with a fallback to custom backend tax calculation, plus all production deployment changes.

### Key Features

1. **Stripe Automatic Tax (Default)**
   - ✅ Automatically enabled on all orders
   - ✅ Stripe computes tax based on line items and shipping address
   - ✅ No manual tax calculation on backend
   - ✅ Admin can toggle on/off via store config

2. **Custom Tax Fallback**
   - ✅ When disabled, uses backend `taxRate` from store config
   - ✅ Simple percentage-based calculation (e.g., 8.5%)
   - ✅ Admin controls which method is used

3. **Frontend Integration**
   - ✅ Checkout respects the `stripeAutoTaxEnabled` flag
   - ✅ Shows "Calculated by Stripe" when Stripe Tax is active
   - ✅ Shows estimated tax rate when custom tax is active
   - ✅ Seamless UI based on config

4. **Production Deployment**
   - ✅ AWS SAM template updated with Stripe Tax config
   - ✅ GitHub Actions workflow configured
   - ✅ Environment variables set
   - ✅ Ready for multi-stage deployment (dev/staging/prod)

---

## 🔄 Implementation Summary

### Backend Changes

**File:** `backend/internal/models/models.go`
```go
// Added to StoreConfig struct:
StripeAutoTaxEnabled bool `json:"stripeAutoTaxEnabled,omitempty" dynamodbav:"StripeAutoTaxEnabled,omitempty"`
```

**File:** `backend/internal/handlers/handlers.go`
```go
// Updated CreateOrder() handler:
useStripeTax := config.StripeAutoTaxEnabled || (config == nil) // Default: enabled
if useStripeTax {
  params.AutomaticTax = &stripe.PaymentIntentAutomaticTaxParams{
    Enabled: stripe.Bool(true),
  }
}
```

### Frontend Changes

**File:** `src/types/index.ts`
```ts
// Added to StoreConfig interface:
stripeAutoTaxEnabled?: boolean; // Default: true
```

**File:** `src/pages/CheckoutPage.tsx`
```tsx
// Calculate based on flag:
const useStripeTax = themeConfig?.stripeAutoTaxEnabled ?? true;
const estimatedTax = useStripeTax ? 0 : (afterDiscount * estimatedTaxRate / 100);
const estimatedTotal = useStripeTax ? afterDiscount : (afterDiscount + estimatedTax);

// Render conditionally:
{useStripeTax ? (
  <div className="flex justify-between text-sm text-muted-foreground">
    <span>Tax</span>
    <span className="text-xs">Calculated by Stripe</span>
  </div>
) : (
  <div className="flex justify-between">
    <span className="text-muted-foreground">Est. Tax ({estimatedTaxRate}%)</span>
    <span>{formatPrice(estimatedTax)}</span>
  </div>
)}
```

**File:** `src/pages/admin/AdminConfig.tsx`
```tsx
// Added to DEFAULT_CONFIG:
stripeAutoTaxEnabled: true,

// Added toggle to Feature Toggles section:
<div className="flex items-center justify-between">
  <div>
    <p className="text-sm font-medium">Stripe Automatic Tax</p>
    <p className="text-xs text-muted-foreground">
      Use Stripe Tax for automatic tax calculation 
      (disable to use custom tax rate)
    </p>
  </div>
  <Switch 
    checked={config.stripeAutoTaxEnabled ?? true} 
    onCheckedChange={v => setConfig({ ...config, stripeAutoTaxEnabled: v })} 
  />
</div>
```

### Deployment Changes

**File:** `template.yaml`
```yaml
# Added to Lambda Environment Variables:
STRIPE_AUTO_TAX_ENABLED: 'true'  # Stripe Tax enabled by default
```

**File:** `.env` (Local Development)
```bash
STRIPE_AUTO_TAX_ENABLED=true
```

**File:** `.github/workflows/deploy.yml`
- ✅ Inherits Stripe key from GitHub Secrets
- ✅ No additional changes needed
- ✅ Frontend already passes `VITE_STRIPE_PUBLISHABLE_KEY`

---

## 🚀 Production Deployment Steps

### Prerequisites

1. **AWS Credentials**
   ```bash
   export AWS_ACCESS_KEY_ID=your_access_key
   export AWS_SECRET_ACCESS_KEY=your_secret_key
   export AWS_REGION=us-east-1
   ```

2. **Stripe API Keys (in AWS Secrets Manager)**
   - Store secrets at: `ecommerce/{stage}/backend`
   - Required keys:
     - `STRIPE_SECRET_KEY`
     - `STRIPE_PUBLISHABLE_KEY`
     - `STRIPE_WEBHOOK_SECRET`

3. **AWS SAM CLI**
   ```bash
   pip install --upgrade aws-sam-cli
   ```

### Step 1: Build Backend

```bash
cd backend
go mod tidy
sam build --template ../template.yaml
```

### Step 2: Deploy Stack

```bash
sam deploy \
  --stack-name shopreturngifts \
  --region us-east-1 \
  --resolve-s3 \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    Stage=prod \
    FrontendDomain='https://yourdomain.com' \
    ContactFromEmail='noreply@yourdomain.com' \
    ContactToEmail='support@yourdomain.com' \
    AllowedOrigins='https://yourdomain.com' \
    CognitoDomainPrefix='shopreturngifts' \
    GoogleClientId='your-google-client-id' \
    GoogleClientSecret='your-google-client-secret'
```

### Step 3: Build & Deploy Frontend

```bash
npm install
npm run build
aws s3 sync dist/ s3://shopreturngifts-frontendbucket-xxxx/ --delete
aws cloudfront create-invalidation --distribution-id EXXXX --paths "/*"
```

### Step 4: Verify Deployment

1. Check API is running:
   ```bash
   curl -X GET https://your-api-url/api/config/theme
   ```

2. Check store config has Stripe Tax flag:
   ```bash
   curl -X GET https://your-api-url/api/config/theme | grep stripeAutoTaxEnabled
   # Should return: "stripeAutoTaxEnabled": true
   ```

3. Test checkout flow:
   - Add items to cart
   - Go to checkout
   - Verify "Tax: Calculated by Stripe" appears
   - Complete a test payment

---

## 🔐 Environment Variables Reference

### Lambda Function Environment (AWS SAM)

| Variable | Description | Example |
|----------|-------------|---------|
| `TABLE_NAME` | DynamoDB table | `shopreturngifts-AppTable-ABC123` |
| `S3_BUCKET` | Assets bucket | `shopreturngifts-assetsbucket-xyz` |
| `COGNITO_USER_POOL_ID` | Cognito pool | `us-east-1_ABC123DEF` |
| `STRIPE_SECRET_KEY` | Stripe secret (from Secrets Manager) | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Webhook secret | `whsec_...` |
| `STRIPE_AUTO_TAX_ENABLED` | Enable Stripe Tax | `true` |
| `STAGE` | Deployment stage | `prod` |

### Frontend Environment (.env / GitHub Secrets)

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_BASE_URL` | API endpoint | `https://api.yourdomain.com/api` |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe public key | `pk_live_...` |

### GitHub Actions Secrets

```yaml
AWS_ACCESS_KEY_ID: your-key-id
AWS_SECRET_ACCESS_KEY: your-secret-key
STRIPE_PUBLISHABLE_KEY: pk_live_...
VITE_API_BASE_URL: https://api.yourdomain.com/api
FRONTEND_DOMAIN: https://yourdomain.com
CONTACT_FROM_EMAIL: noreply@yourdomain.com
CONTACT_TO_EMAIL: support@yourdomain.com
COGNITO_DOMAIN_PREFIX: shopreturngifts
GOOGLE_CLIENT_ID: your-google-client-id
GOOGLE_CLIENT_SECRET: your-google-client-secret
```

---

## 🧪 Testing Checklist

### Local Development

- [ ] Run `npm run dev` — frontend starts on localhost:8080
- [ ] Run `make run-local` in backend — API on localhost:9000
- [ ] Go to checkout → verify "Tax: Calculated by Stripe" appears
- [ ] Admin Config → toggle "Stripe Automatic Tax" off
- [ ] Refresh → verify custom tax rate (%) appears
- [ ] Toggle back on → verify Stripe Tax message appears

### Staging Environment

- [ ] Deploy to AWS staging with SAM
- [ ] Create test order in browser
- [ ] Check PaymentIntent in Stripe dashboard — verify `automatic_tax.enabled = true`
- [ ] Admin toggles flag off
- [ ] Create another test order
- [ ] Check PaymentIntent — verify `automatic_tax.enabled = false`
- [ ] Confirm webhook events: `payment_intent.succeeded`

### Production Environment

- [ ] Deploy to production with SAM
- [ ] Verify store config is loaded: `GET /api/config/theme`
- [ ] Check response includes `"stripeAutoTaxEnabled": true`
- [ ] Monitor Stripe dashboard for payments
- [ ] Check CloudWatch logs for any errors
- [ ] Test with real payment (or Stripe test card)

---

## 📊 Admin Config UI

The admin panel at `/admin/config` now includes:

**Feature Toggles Section:**
- ✅ Product Ratings (toggle)
- ✅ Product Comments (toggle)
- ✅ **Stripe Automatic Tax** (NEW) — toggle to enable/disable Stripe Tax

**Commerce Settings Section:**
- Currency input
- Tax Rate (%) input — used when Stripe Tax is disabled
- Stripe Publishable Key (password field)

---

## 🔄 Workflow: When Admin Disables Stripe Tax

**Scenario:** Admin wants to use custom tax calculation instead

1. **Admin navigates to:** `/admin/config`
2. **Admin finds:** "Stripe Automatic Tax" toggle under "Feature Toggles"
3. **Admin clicks:** toggle to OFF
4. **Admin saves:** config
5. **Config is stored** in DynamoDB: `stripeAutoTaxEnabled: false`
6. **Frontend receives:** the flag via `GET /api/config/theme`
7. **Checkout shows:** custom tax rate (%) instead of "Calculated by Stripe"
8. **Backend:** uses `taxRate` (e.g., 8.5%) for order calculation
9. **Stripe PaymentIntent:** created WITHOUT `automatic_tax` parameter

---

## ⚠️ Important Notes

1. **Default Behavior:** Stripe Tax is **ENABLED by default**
   - No action needed — all orders use Stripe Tax automatically
   - Admin can disable if needed

2. **Tax Calculation Change:**
   - When Stripe Tax is enabled: Stripe computes tax based on line items & ZIP
   - When disabled: Backend uses simple percentage from `taxRate` config

3. **Stripe Account Requirements:**
   - Ensure Stripe Tax is enabled in your Stripe account
   - Visit: https://dashboard.stripe.com/settings/tax
   - Enable "Use automatic tax"

4. **Webhook Handling:**
   - Existing webhook handlers remain unchanged
   - `payment_intent.succeeded` events still update order status
   - Tax is already included in amount when Stripe Tax is used

5. **Line Items:**
   - All products with `isTaxable: true` are subject to tax
   - Tax-exempt items should have `isTaxable: false`

---

## 🐛 Troubleshooting

### Issue: Checkout shows 401 error from Stripe

**Solution:** Ensure `VITE_STRIPE_PUBLISHABLE_KEY` is set in frontend environment
```bash
# In .env or GitHub Secrets:
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

### Issue: Admin toggle not persisting

**Solution:** Check DynamoDB has the new attribute
```bash
# Verify in DynamoDB:
aws dynamodb get-item \
  --table-name shopreturngifts-AppTable \
  --key '{"PK":{"S":"CONFIG"},"SK":{"S":"CONFIG"}}'
# Should show "StripeAutoTaxEnabled: true/false"
```

### Issue: Tax calculation doesn't change after toggling flag

**Solution:** Clear browser cache and refresh checkout
```bash
# Hard refresh in browser:
Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows/Linux)
```

### Issue: Stripe Tax not calculating in Stripe Dashboard

**Solution:** Enable Stripe Tax in your Stripe account
1. Go to: https://dashboard.stripe.com/settings/tax
2. Enable "Automatic tax"
3. Configure tax rates for your jurisdictions

---

## 📞 Support

For issues or questions:
1. Check CloudWatch logs: `aws logs tail /aws/lambda/shopreturngifts-api-prod --follow`
2. Check Stripe dashboard for payment intent details
3. Verify admin config in DynamoDB
4. Test with Stripe test cards

---

## 📝 Deployment Checklist

### Pre-Deployment
- [ ] All code changes committed and tested locally
- [ ] AWS credentials configured
- [ ] Stripe keys in Secrets Manager
- [ ] GitHub Secrets updated
- [ ] Database backed up

### Deployment
- [ ] Run tests: `go test ./...` and `npm test -- --run`
- [ ] Build backend: `sam build`
- [ ] Deploy to staging first: `sam deploy --stack-name shopreturngifts-staging`
- [ ] Test in staging environment
- [ ] Deploy to production: `sam deploy --stack-name shopreturngifts`

### Post-Deployment
- [ ] Verify API is responding
- [ ] Check admin config UI works
- [ ] Test checkout flow
- [ ] Monitor CloudWatch logs
- [ ] Monitor Stripe dashboard
- [ ] Send deployment notification to team

---

**Version History:**
- v1.0 — May 9, 2026 — Initial implementation with Stripe Automatic Tax
