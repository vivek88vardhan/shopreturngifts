# ShopReturnGifts — Full-Stack E-Commerce Platform on AWS

A complete e-commerce platform built with React + Go, deployed on AWS serverless infrastructure.

## Architecture Overview

```
┌─────────────────┐     ┌──────────────┐     ┌──────────────────────────┐
│  React Frontend │────▶│ API Gateway  │────▶│  Lambda (Go / Chi)       │
│  (S3+CloudFront)│     │  /prod/api/* │     │  Single binary, all routes│
└─────────────────┘     └──────────────┘     └──────┬───────────────────┘
                                                     │
                        ┌────────────────────────────┼────────────────┐
                        ▼                            ▼                ▼
                 ┌─────────────┐          ┌──────────────┐   ┌──────────┐
                 │  DynamoDB   │          │   Cognito    │   │    S3    │
                 │ Single-Table│          │  User Pool   │   │  Assets  │
                 └─────────────┘          └──────────────┘   └──────────┘
```

## Tech Stack

| Layer       | Technology                                      |
|-------------|------------------------------------------------|
| Frontend    | React, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| State       | Zustand (auth, cart), TanStack Query (server)   |
| Backend     | Go, Chi router, single AWS Lambda               |
| Database    | DynamoDB (single-table design)                   |
| Auth        | Amazon Cognito (JWT)                             |
| Storage     | S3 (product images, invoices, logos)             |
| Payments    | Stripe (Payment Element)                         |
| Infra       | AWS SAM, CloudFront, API Gateway                |

## DynamoDB Single-Table Design

All entities live in **one DynamoDB table** with PK/SK patterns:

| Entity      | PK                  | SK                  | Description                |
|-------------|---------------------|---------------------|----------------------------|
| Product     | `PROD#<productId>`  | `PROD#<productId>`  | Product catalog items      |
| Category    | `CAT#<categoryId>`  | `CAT#<categoryId>`  | Product categories         |
| User        | `USER#<userId>`     | `USER#<userId>`     | User profiles              |
| Order       | `ORDER#<orderId>`   | `ORDER#<orderId>`   | Customer orders            |
| Config      | `CONFIG`            | `CONFIG`            | Store-wide settings        |

**GSIs:**
- **GSI1** — For querying orders by user, products by category, etc.
- **GSI2** — For additional access patterns (e.g., user lookup by email)

## API Endpoints

### Public
| Method | Path                        | Description               |
|--------|-----------------------------|---------------------------|
| POST   | `/api/auth/login`           | Login (Cognito)           |
| POST   | `/api/auth/signup`          | Register new user         |
| GET    | `/api/openapi.json`         | OpenAPI 3.0 specification |
| GET    | `/api/docs`                 | Swagger UI docs viewer    |
| GET    | `/api/config/theme`         | Store theme/config        |
| GET    | `/api/products`             | List products             |
| GET    | `/api/products/:productId`  | Get single product        |
| GET    | `/api/categories`           | List categories           |

### Authenticated (Bearer JWT)
| Method | Path                              | Description              |
|--------|-----------------------------------|--------------------------|
| GET    | `/api/users/me`                   | Current user profile     |
| PUT    | `/api/users/me`                   | Update profile           |
| PUT    | `/api/users/me/address`           | Update shipping address  |
| GET    | `/api/orders`                     | List user's orders       |
| GET    | `/api/orders/:orderId`            | Order detail             |
| POST   | `/api/orders`                     | Create order             |
| GET    | `/api/orders/:orderId/invoice`    | Download invoice (S3)    |

### Admin (Bearer JWT + Cognito `admin` group)
| Method | Path                                          | Description                |
|--------|-----------------------------------------------|----------------------------|
| GET    | `/api/admin/dashboard`                        | Dashboard stats            |
| GET    | `/api/admin/products`                         | List all products          |
| POST   | `/api/admin/products`                         | Create product             |
| PUT    | `/api/admin/products/:productId`              | Update product             |
| DELETE | `/api/admin/products/:productId`              | Delete product             |
| POST   | `/api/admin/products/:productId/image-upload-url` | Get S3 upload URL     |
| GET    | `/api/admin/categories`                       | List categories            |
| POST   | `/api/admin/categories`                       | Create category            |
| PUT    | `/api/admin/categories/:categoryId`           | Update category            |
| DELETE | `/api/admin/categories/:categoryId`           | Delete category            |
| GET    | `/api/admin/orders`                           | List all orders            |
| GET    | `/api/admin/orders/:orderId`                  | Order detail               |
| PUT    | `/api/admin/orders/:orderId/status`           | Update order status        |
| PUT    | `/api/admin/orders/:orderId/fulfill`          | Fulfill order              |
| GET    | `/api/admin/users`                            | List users                 |
| GET    | `/api/admin/users/:userId`                    | Get user detail            |
| PUT    | `/api/admin/users/:userId`                    | Update user                |
| DELETE | `/api/admin/users/:userId`                    | Delete user                |
| GET    | `/api/admin/config`                           | Get store config           |
| PUT    | `/api/admin/config`                           | Update store config        |
| POST   | `/api/admin/config/logo-upload-url`           | Get logo S3 upload URL     |

## Frontend Pages

| Route                    | Page                | Auth Required |
|--------------------------|---------------------|---------------|
| `/`                      | Homepage            | No            |
| `/products`              | Product listing     | No            |
| `/products/:productId`   | Product detail      | No            |
| `/categories`            | Category listing    | No            |
| `/cart`                  | Shopping cart        | No            |
| `/checkout`              | Checkout            | Yes           |
| `/checkout/success`      | Order confirmation  | Yes           |
| `/orders`                | Order history       | Yes           |
| `/orders/:orderId`       | Order detail        | Yes           |
| `/profile`               | User profile        | Yes           |
| `/login`                 | Sign in             | No            |
| `/signup`                | Create account      | No            |
| `/admin`                 | Admin dashboard     | Admin         |
| `/admin/products`        | Manage products     | Admin         |
| `/admin/categories`      | Manage categories   | Admin         |
| `/admin/orders`          | Manage orders       | Admin         |
| `/admin/users`           | Manage users        | Admin         |
| `/admin/config`          | Store settings      | Admin         |

## Frontend–Backend Integration

| Feature     | Frontend Hook              | API Call                    | Store       |
|-------------|----------------------------|-----------------------------|-------------|
| Products    | `useProducts()`            | `GET /api/products`         | React Query |
| Product     | `useProduct(id)`           | `GET /api/products/:id`     | React Query |
| Categories  | `useCategories()`          | `GET /api/categories`       | React Query |
| Auth        | `useAuthStore()`           | `POST /api/auth/*`          | Zustand     |
| Cart        | `useCartStore()`           | Client-side only            | Zustand     |
| Orders      | `useOrders()`              | `GET /api/orders`           | React Query |
| Profile     | `useCurrentUser()`         | `GET /api/users/me`         | React Query |
| Theme       | `useThemeConfig()`         | `GET /api/config/theme`     | React Query |
| Admin CRUD  | `useAdmin*()`              | `/api/admin/*`              | React Query |

## Order Status Flow

```
Pending → Paid → Processing → Shipped → Delivered
                  ↓               ↓
              Cancelled       Cancelled
```

Admins can cancel orders in `Paid` or `Processing` status only.

## Environment Variables

### Frontend (Vite)
| Variable             | Description                  | Example                                                     |
|----------------------|------------------------------|-------------------------------------------------------------|
| `VITE_API_BASE_URL`  | Backend API base URL         | `https://xxx.execute-api.us-east-1.amazonaws.com/prod`      |

### Backend (Lambda)
| Variable                  | Description              |
|---------------------------|--------------------------|
| `TABLE_NAME`              | DynamoDB table name      |
| `S3_BUCKET`               | S3 bucket for assets     |
| `COGNITO_USER_POOL_ID`    | Cognito User Pool ID     |
| `COGNITO_APP_CLIENT_ID`   | Cognito App Client ID    |
| `AWS_REGION`              | AWS region               |
| `STRIPE_STATEMENT_DESCRIPTOR_SUFFIX` | Bank statement suffix (card-safe) |
| `STRIPE_IDEMPOTENCY_KEY_PREFIX` | Prefix for Stripe idempotency keys |

### Secrets (AWS Secrets Manager)
| Secret key                | Description              |
|---------------------------|--------------------------|
| `STRIPE_SECRET_KEY`       | Payment processing       |
| `STRIPE_WEBHOOK_SECRET`   | Webhook signature verification |

---

## Stripe Integration Guide

This project uses **authorize now, capture later** with Stripe PaymentIntent manual capture:

1. `POST /api/orders` creates a PaymentIntent (`capture_method=manual`) and returns `clientSecret`
2. Frontend confirms payment via Stripe Payment Element
3. Backend confirms order payment authorization
4. Payment lifecycle updates are handled by backend order-processing flows

### Local Setup (Step by Step)

1. Install Stripe CLI (macOS):

```sh
brew install stripe/stripe-cli/stripe
```

2. Authenticate Stripe CLI:

```sh
stripe login
```

3. Create/update backend env file:

```sh
cp backend/.env.example backend/.env
```

4. Set required Stripe values in `backend/.env`:

```dotenv
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_STATEMENT_DESCRIPTOR_SUFFIX=SHOPRETURNGIFTS
STRIPE_IDEMPOTENCY_KEY_PREFIX=shopreturngifts
```

5. Start backend locally:

```sh
make dev-backend
```

6. Create local webhook secret (recommended command):

```sh
make stripe-webhook-secret
```

This command runs Stripe listen, gets a `whsec_...` signing secret, and writes `STRIPE_WEBHOOK_SECRET` in `backend/.env`.

7. Restart backend after `.env` update:

```sh
make dev-backend
```

8. (Optional) Forward events manually in another terminal:

```sh
stripe listen --forward-to http://localhost:9000/api/stripe/webhook
```

### How to Create `STRIPE_WEBHOOK_SECRET` in Local

- Source of truth: Stripe CLI output
- Command: `stripe listen --print-secret --forward-to http://localhost:9000/api/stripe/webhook`
- Result: a temporary/local `whsec_...` secret for that webhook listener
- Use that value in `backend/.env` as `STRIPE_WEBHOOK_SECRET`

> Local `whsec_...` is different from AWS webhook endpoint secret.

### AWS Deployment (Step by Step)

1. Ensure AWS prerequisites:
    - Deployer has permission for CloudFormation, Lambda, API Gateway, DynamoDB, S3, Cognito, Secrets Manager
    - `sam` and `aws` CLIs configured

2. Create/update Secrets Manager secret for your stage:

Secret name pattern used by SAM template:

- `ecommerce/dev/backend`
- `ecommerce/staging/backend`
- `ecommerce/prod/backend`

Store JSON like:

```json
{
  "STRIPE_SECRET_KEY": "sk_live_or_sk_test...",
  "STRIPE_WEBHOOK_SECRET": "whsec_live_or_stage..."
}
```

3. Set webhook endpoint in Stripe Dashboard:
    - Developers → Webhooks → Add endpoint
    - URL: `https://<api-id>.execute-api.<region>.amazonaws.com/<stage>/api/stripe/webhook`
    - Events to send:
      - `payment_intent.succeeded`
      - `payment_intent.payment_failed`
      - `payment_intent.canceled`
      - `charge.dispute.created`
      - `charge.refunded`

4. Copy webhook signing secret from Stripe Dashboard:
    - In endpoint details click **Reveal** signing secret
    - Save as `STRIPE_WEBHOOK_SECRET` in the stage secret above

5. Deploy backend:

```sh
make deploy-backend STAGE=prod
```

6. Validate deployed output:
    - Confirm `StripeWebhookUrl` output from CloudFormation/SAM matches the URL in Stripe Dashboard
    - Run a Stripe test event and verify Lambda logs

### How to Create `STRIPE_WEBHOOK_SECRET` in AWS

`STRIPE_WEBHOOK_SECRET` comes from **Stripe Dashboard webhook endpoint**, not generated in AWS:

1. Create/select endpoint in Stripe Dashboard
2. Reveal signing secret (`whsec_...`)
3. Save into AWS Secrets Manager JSON key `STRIPE_WEBHOOK_SECRET`
4. Redeploy (or update secret only if function reads it via dynamic reference on invoke)

---

## Local Development

### Prerequisites

- **Go 1.21+** installed
- **Node.js 18+** and npm
- **AWS SAM CLI** installed
- **AWS CLI** configured with a profile that has access to your deployed resources

### 1. Backend (SAM Local)

Set the following environment variables (or export them in your shell):

```sh
export AWS_PROFILE=your-profile        # AWS CLI profile with access to DynamoDB, S3, Cognito
export AWS_REGION=us-east-1            # Region where your stack is deployed
export TABLE_NAME=shopreturngifts-prod       # DynamoDB table name (from SAM stack output)
export S3_BUCKET=shopreturngifts-assets-prod-123456789  # S3 assets bucket (from SAM stack output)
export COGNITO_USER_POOL_ID=us-east-1_xxxxxxx     # Cognito User Pool ID (from SAM stack output)
export COGNITO_APP_CLIENT_ID=xxxxxxxxxxxxxxxxxx    # Cognito App Client ID (from SAM stack output)
```

> **Tip:** Run `aws cloudformation describe-stacks --stack-name shopreturngifts --query "Stacks[0].Outputs"` to get all values from your deployed stack.

Then start the local API:

# Backend
make dev-backend

# Stripe local webhook secret bootstrap
make stripe-webhook-secret
```sh
cd backend
go build -o bootstrap ./cmd/api
sam local start-api --env-vars <(echo "{\"ApiFunction\":{\"TABLE_NAME\":\"$TABLE_NAME\",\"S3_BUCKET\":\"$S3_BUCKET\",\"COGNITO_USER_POOL_ID\":\"$COGNITO_USER_POOL_ID\",\"COGNITO_APP_CLIENT_ID\":\"$COGNITO_APP_CLIENT_ID\"}}")
```

### 2. Frontend

Use **two terminals** (or `make start` to run both in the background).

**Terminal 1 — backend** (port `9000`):

```sh
cp backend/.env.example backend/.env
# Edit backend/.env: TABLE_NAME, S3_BUCKET, Cognito IDs, AWS_PROFILE, Stripe test keys

make dev-backend
# API: http://localhost:9000/api  — try http://localhost:9000/api/config/theme
```

**Terminal 2 — frontend** (port `8080`):

```sh
npm install
echo "VITE_API_BASE_URL=http://localhost:9000/api" > .env.local
npm run dev
# App: http://localhost:8080
```

The frontend calls the local Go API on port **9000** (not SAM port 3000). Without `backend/.env` and AWS credentials, catalog/admin calls will fail until DynamoDB/Cognito are configured.

## Deployment

- **Backend**: AWS SAM (`sam build && sam deploy`)
- **Frontend**: GitHub Actions → S3 + CloudFront (see `.github/workflows/deploy.yml`)

## Security

- JWT validation via Cognito JWKS on all authenticated routes
- Admin routes require Cognito `admin` group membership
- Stripe secrets in AWS Secrets Manager (resolved in SAM template)
- CORS configured on API Gateway
- S3 assets served via CloudFront with OAI
