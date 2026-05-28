# Security

## Reporting issues

If you discover a security vulnerability, email the project owner privately. Do not open a public issue for exploitable bugs.

## What we protect in this app

- **Auth**: Amazon Cognito (password + Google OAuth). API validates Cognito **ID tokens** (RS256, issuer, audience, `token_use=id`).
- **Admin**: Cognito `admin` group + `AdminMiddleware` on `/api/admin/*`.
- **Payments**: Stripe webhook signatures verified (`STRIPE_WEBHOOK_SECRET`).
- **API**: Per-IP rate limits on auth, contact, orders; 2 MB request body cap; security headers on API and CloudFront (HSTS, `X-Frame-Options`, etc.).
- **CORS**: Restrict via `ALLOWED_ORIGINS` (comma-separated). Avoid `*` in production.
- **Secrets**: Stripe keys, webhook secret, Google OAuth secret — AWS Secrets Manager / GitHub Actions secrets only (never committed).

## Dependency hygiene

```bash
# Frontend
npm ci && npm audit --audit-level=high

# Backend
cd backend && go mod tidy && go run golang.org/x/vuln/cmd/govulncheck@latest ./...
```

CI runs these on every PR/push (see `.github/workflows/security.yml`).

## Production checklist

1. Set `ALLOWED_ORIGINS` to your real site URL(s) only (e.g. `https://shopreturngifts.com`).
2. Use a **custom domain** for Cognito + SES (DKIM/SPF/DMARC) — reduces phishing/spam issues.
3. Keep Cognito **Prevent user existence errors** enabled (default on app client).
4. Rotate Stripe webhook secret if leaked; use restricted IAM for deploy keys.
5. Enable AWS CloudTrail and monitor failed auth / unusual admin API usage.
6. Keep `FrontendDomain` in SAM aligned with production URL for S3 CORS on uploads.

## Bulk product import

Admin-only. Spreadsheet parsing uses SheetJS 0.20.3+ (patched). Uploads over **2 MB** are rejected client-side.
