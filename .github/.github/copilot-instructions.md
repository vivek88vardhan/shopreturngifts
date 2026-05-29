# ShopReturnGifts Platform — Copilot Instructions

**Document Version:** 1.0  
**Last Updated:** March 23, 2026  
**Project:** shopreturngifts-platform (Phoenix, Arizona E-Commerce Platform)  
**Stack:** React + Go + AWS Serverless  

---

## Table of Contents

1. [Project Overview & Identity](#1-project-overview--identity)
2. [Architecture & Tech Stack](#2-architecture--tech-stack)
3. [Workspace Structure](#3-workspace-structure)
4. [Frontend Architecture](#4-frontend-architecture)
5. [Backend Architecture](#5-backend-architecture)
6. [Database Design (DynamoDB)](#6-database-design-dynamodb)
7. [API Endpoints Reference](#7-api-endpoints-reference)
8. [Development Setup & Commands](#8-development-setup--commands)
9. [Deployment & CI/CD](#9-deployment--cicd)
10. [Code Patterns & Conventions](#10-code-patterns--conventions)
11. [State Management](#11-state-management)
12. [Common Development Tasks](#12-common-development-tasks)
13. [Key Configuration Files](#13-key-configuration-files)
14. [Important Constraints & Guidelines](#14-important-constraints--guidelines)
15. [Common Pitfalls & Solutions](#15-common-pitfalls--solutions)

---

## 1. Project Overview & Identity

### 1.1 What This Is

**ShopReturnGifts** is a generic, config-driven e-commerce platform built for a retail store in **Phoenix, Arizona, USA**. It is designed to be product-agnostic—initially for grocery, but architected to support any vertical without code changes.

### 1.2 Business Context

- **Location:** Phoenix, Arizona, USA
- **Currency:** USD ($)
- **Timezone:** America/Phoenix (MST, UTC−7, no daylight saving)
- **Phone Format:** US E.164 (+1XXXXXXXXXX)
- **Date Format:** MM/DD/YYYY
- **ZIP Code Format:** 5-digit US (e.g., 85001)
- **Tax:** Arizona state + Maricopa County

### 1.3 Single Source of Truth

Configuration-driven architecture means **no code changes for store customization**. All labels, features, product attributes, and business rules live in `store.config.json` (stored in S3 and cached by Lambdas). The codebase uses generic terminology: `item`, `collection`, `attribute`, not hardcoded "Product", "Category", etc.

### 1.4 Master Requirements

See `/prompts/ECOMMERCE_MASTER_PROMPT_v3.md` for complete project specification including:
- Feature list (cart, checkout, orders, admin panel, analytics)
- Tax engine (ZIP-based)
- Coupon & discount system
- Promotion banners with auto-expiry
- Subscription (email + WhatsApp + QR)
- Notifications (email, SMS, async)
- Role-based access control
- Stripe payment authorization flow
- Invoice generation
- Bulk order protection (50% of stock threshold)
- 24-hour cancellation policy
- Delivery routing for Phoenix-area ZIPcodes

---

## 2. Architecture & Tech Stack

### 2.1 High-Level Architecture

```
┌─────────────────────────────┐
│  React App (Vite + SWC)     │
│  S3 (Static) + CloudFront   │
│  Client-Side Rendered       │
└──────────────┬──────────────┘
               │ HTTPS
┌──────────────▼──────────────┐
│   API Gateway (HTTP API)    │
│   /prod/api/*               │
└──────────────┬──────────────┘
               │
┌──────────────▼──────────────┐
│  Lambda (Go, single binary)  │
│  Chi router, 30s timeout     │
│  ARM64 architecture          │
└──────────────┬──────────────┘
               │
    ┌──────────┼──────────┬──────────┐
    ▼          ▼          ▼          ▼
┌────────┐ ┌───────┐ ┌──────────┐ ┌──────┐
│DynamoDB│ │Cognito│ │S3(assets)│ │Stripe│
└────────┘ └───────┘ └──────────┘ └──────┘
```

### 2.2 Technology Stack

| Layer               | Technology                                    | Version   |
|---------------------|-----------------------------------------------|-----------|
| **Frontend**        |                                               |           |
| Framework           | React + Vite                                  | 18.3.1    |
| Language            | TypeScript                                    | 5.8.3     |
| Build Tool          | Vite (JS compiler: SWC)                       | 5.4.19    |
| Routing             | React Router DOM                              | 6.30.1    |
| UI Components       | shadcn/ui + Radix UI                          | Various   |
| Styling             | Tailwind CSS + PostCSS                        | 3.4.17    |
| State Management    | Zustand (auth, cart) + TanStack Query         | 5.0.11    |
| Form Handling       | React Hook Form + Zod validation              | 7.61.1    |
| Charts              | Recharts                                      | 2.15.4    |
| Notifications       | Sonner (toast)                                | 1.7.4     |
| Testing             | Vitest + Playwright                           | Recent    |
| **Backend**         |                                               |           |
| Language            | Go                                            | 1.22      |
| Runtime             | AWS Lambda (provided.al2023, ARM64)           | Latest    |
| HTTP Router         | Chi (Go)                                      | 5.1.0     |
| JSON Encoding       | Standard library + aws-sdk-go-v2              | v2        |
| **Database**        |                                               |           |
| Primary DB          | DynamoDB (serverless, pay-per-request)        | Latest    |
| Design              | Single-table with GSIs, PK/SK patterns        | —         |
| **Authentication**  |                                               |           |
| User Management     | AWS Cognito                                   | Latest    |
| JWT Tokens          | golang-jwt/jwt                                | 5.2.1     |
| **Storage**         |                                               |           |
| Object Storage      | AWS S3 (product images, invoices, configs)    | Latest    |
| CDN                 | CloudFront (static frontend caching)          | Latest    |
| **Payments**        |                                               |           |
| Processor           | Stripe (payment authorization)                 | SDK v78   |
| **Infrastructure**  |                                               |           |
| IaC                 | AWS SAM (Serverless Application Model)        | Latest    |
| API Gateway         | AWS API Gateway (HTTP API, not REST)          | Latest    |
| CI/CD               | GitHub Actions                                | Latest    |
| Monitoring          | CloudWatch (basic logging)                    | Built-in  |

### 2.3 Key Design Decisions

1. **Go on Lambda:** Binary cold start ~5ms (vs Node.js 50-100ms). Each endpoint is compiled into a single binary (no Layers).
2. **DynamoDB Single-Table:** Cheaper than RDS for low-medium traffic (<50k/mo orders). TTL auto-expires promos & coupons. Streams trigger price reverts.
3. **React SSG → S3 + CloudFront:** No Node.js server at runtime. Static exports for catalog pages; client-side hydration for dynamic pages. ~50ms TTFB globally.
4. **Vite + SWC:** Instant HMR, fast builds. Replaces webpack/Next.js overhead.
5. **Zustand + React Query:** Lightweight state (cart, auth) + server cache (products, orders).
6. **Stripe Payment Authorization:** Authorize payment at checkout and finalize order state through backend processing flows.

---

## 3. Workspace Structure

### 3.1 Top-Level Files

```
shopreturngifts-platform/
├── package.json                  # Frontend + shared deps
├── bun.lockb                      # Bun package lock
├── vite.config.ts                # Vite config (SWC, aliases)
├── vitest.config.ts              # Test runner config
├── tsconfig.json                 # Root TypeScript config
├── tsconfig.app.json             # App TypeScript config (stricter)
├── tsconfig.node.json            # Node TypeScript config
├── tailwind.config.ts            # Tailwind CSS config + theme
├── postcss.config.js             # PostCSS plugins (autoprefixer)
├── eslint.config.js              # ESLint rules
├── components.json               # shadcn/ui component registry
├── playwright-fixture.ts         # Test fixtures for E2E tests
├── playwright.config.ts          # Playwright test config
├── template.yaml                 # AWS SAM template (infrastructure)
├── index.html                    # Vite entry HTML
├── README.md                     # Quick start guide
├── copilot-instructions.md       # This file
└── .github/
    └── workflows/
        └── deploy.yml            # GitHub Actions CI/CD pipeline
```

### 3.2 Frontend (`/src`)

```
src/
├── main.tsx                      # React entry point
├── App.tsx                       # Main router & layout
├── App.css                       # Global app styles
├── index.css                     # Tailwind directives
├── vite-env.d.ts                # Vite types
│
├── components/                  # Reusable React components
│   ├── NavLink.tsx              # Navigation link component
│   ├── admin/
│   │   └── AdminLayout.tsx      # Admin layout wrapper
│   ├── store/
│   │   ├── StoreLayout.tsx      # Customer-facing layout wrapper
│   │   ├── StoreNavbar.tsx      # Navigation bar
│   │   ├── ProductCard.tsx      # Product grid card (price, image, CTA)
│   │   ├── CartDrawer.tsx       # Sliding cart sidebar
│   │   ├── StatusBadge.tsx      # Order status display (Pending, Shipped, etc.)
│   │   └── AddressAutocomplete.tsx  # Google Places API autocomplete
│   └── ui/                      # shadcn/ui components (auto-generated)
│       ├── button.tsx, input.tsx, dialog.tsx, ... (40+ exported)
│       ├── accordion.tsx, tabs.tsx, dropdown-menu.tsx, etc.
│       └── sonner.tsx, toaster.tsx  # Notification UI
│
├── pages/                       # Page components (route targets)
│   ├── HomePage.tsx             # Landing page (hero, featured products)
│   ├── ProductsPage.tsx         # Product catalog with filters
│   ├── ProductDetailPage.tsx    # Single product + reviews, nutrition
│   ├── CategoriesPage.tsx       # Category browse
│   ├── CartPage.tsx             # Shopping cart review
│   ├── CheckoutPage.tsx         # Payment form (Stripe Payment Element)
│   ├── CheckoutSuccessPage.tsx  # Order confirmation page
│   ├── OrdersPage.tsx           # User's order history
│   ├── OrderDetailPage.tsx      # Order details + invoice DL
│   ├── ProfilePage.tsx          # Account settings, address
│   ├── LoginPage.tsx            # Email + password login
│   ├── SignupPage.tsx           # Registration form
│   ├── NotFound.tsx             # 404 page
│   └── admin/                   # Admin panel pages
│       ├── AdminDashboard.tsx   # Sales, orders, revenue metrics
│       ├── AdminProducts.tsx    # Product CRUD table
│       ├── AdminCategories.tsx  # Category management
│       ├── AdminOrders.tsx      # Admin order view + fulfillment
│       ├── AdminUsers.tsx       # Customer management
│       ├── AdminCoupons.tsx     # Discount code management
│       ├── AdminConfig.tsx      # Store configuration editor
│       └── AdminNotifications.tsx # Email/SMS notification logs
│
├── stores/                      # Zustand state stores (persisted)
│   ├── authStore.ts            # User auth, token, role
│   └── cartStore.ts            # Cart items, subtotal, item count
│
├── hooks/                       # Custom React hooks
│   ├── useApi.ts               # HTTP request wrapper (fetch + auth)
│   ├── use-mobile.tsx          # Mobile breakpoint detection
│   ├── use-toast.ts            # Toast/snackbar hook (shadcn)
│   └── useSyncCartPrices.ts    # Keep cart prices in sync with API
│
├── lib/                         # Utilities & helpers
│   ├── api.ts                  # HTTP client, request logic, product dedup
│   ├── formatters.ts           # Date, currency, number formatting
│   ├── theme.ts                # Theme/color utilities
│   └── utils.ts                # General utilities (clsx, pluralize, etc.)
│
├── types/                       # TypeScript interfaces
│   └── index.ts                # User, Product, Order, Cart, Config types
│
└── test/                        # Test configuration & fixtures
    ├── setup.ts                # Vitest setup, DOM mocks
    └── example.test.ts         # Example test suite
```

### 3.3 Backend (`/backend`)

```
backend/
├── go.mod                       # Go module definition (shopreturngifts-api)
├── Makefile                     # Build targets (build, test, clean)
│
├── cmd/
│   └── api/
│       └── main.go             # Lambda handler entry point, initialization
│
└── internal/
    ├── handlers/
    │   └── handlers.go         # HTTP handler functions (824 lines)
    │                           # Auth: Login, Signup, ConfirmSignup
    │                           # Products: GetProducts, GetProduct, Admin CRUD
    │                           # Categories: GetCategories, Admin CRUD
    │                           # Orders: GetOrders, CreateOrder, Admin status update
    │                           # Users: GetMe, UpdateMe, UpdateAddress, Admin CRUD
    │                           # Config: GetTheme, UpdateConfig, Logo/Hero uploads
    │                           # Coupons: ValidateCoupon, Admin CRUD
    │                           # Dashboard: AdminGetDashboard (metrics)
    │
    ├── middleware/
    │   └── auth.go             # JWT verification, Cognito groups check
    │
    ├── models/
    │   └── models.go           # Request/response structs (LoginReq, OrderReq, etc.)
    │
    ├── router/
    │   └── router.go           # Chi router setup, routes & middleware
    │
    └── store/
        └── dynamodb.go         # DynamoDB operations, Cognito interactions
                                # User CRUD, Product CRUD, Order CRUD, etc.
                                # Coupon validation, Config read/write
                                # S3 pre-signed URL generation
```

### 3.4 Root Configuration Files

```
├── template.yaml               # AWS SAM template
│                              # - Defines DynamoDB table (PK/SK, GSIs, TTL)
│                              # - Defines Lambda (memory, timeout, env vars)
│                              # - Defines API Gateway (CORS, stages)
│                              # - Defines Cognito User Pool & App Client
│                              # - Defines S3 buckets, CloudFront distribution
│
├── .github/workflows/
│   └── deploy.yml             # GitHub Actions pipeline
│                              # - Run frontend & backend tests
│                              # - Build Go binary (GOOS=linux GOARCH=arm64)
│                              # - Deploy backend via SAM
│                              # - Build Next.js static export
│                              # - Sync frontend to S3
│                              # - Invalidate CloudFront cache
│
├── tailwind.config.ts         # Tailwind CSS token overrides (colors, spacing)
├── postcss.config.js          # PostCSS plugins (autoprefixer, tailwind)
├── vite.config.ts             # Vite build config (dev server, aliases, plugins)
├── vitest.config.ts           # Vitest test runner config
├── eslint.config.js           # ESLint rules (react-hooks, react-refresh)
├── playwright.config.ts       # Playwright E2E test config (browsers, baseURL)
├── playwright-fixture.ts      # Custom Playwright fixtures (auth, API setup)
├── components.json            # shadcn/ui registry (generated by `npx shadcn`)
├── tsconfig.json              # Root TS config (extends .app & .node)
├── tsconfig.app.json          # App TS config (src/** files)
└── tsconfig.node.json         # Node TS config (vite.config.ts, etc.)
```

### 3.5 Public Assets

```
public/
└── robots.txt                 # SEO robots directives
```

### 3.6 Documentation & Prompts

```
prompts/
└── ECOMMERCE_MASTER_PROMPT_v3.md  # Complete project specification
                                   # (all features, APIs, business rules)

docs/
└── (placeholder for future docs)
```

---

## 4. Frontend Architecture

### 4.1 React Setup & Routing

- **Entrypoint:** `src/main.tsx` → `src/App.tsx`
- **Router:** React Router v6 (`BrowserRouter` mode)
- **Layout System:** Two main layouts (`StoreLayout`, `AdminLayout`) wrap route groups
- **Styling:** Tailwind CSS + shadcn/ui (Radix UI primitives)
- **State:** Zustand (persistent stores) + React Query (server state)

### 4.2 Route Structure

#### Store Routes (Public + Authenticated)

```
GET  /                        HomePage (homepage + featured products)
GET  /products                ProductsPage (catalog with filters)
GET  /products/:productId     ProductDetailPage (details + reviews)
GET  /categories              CategoriesPage (browse collections)
GET  /cart                    CartPage (review cart, apply coupons)
GET  /checkout                CheckoutPage (Stripe Payment Element)
GET  /checkout/success        CheckoutSuccessPage (order confirmation)
GET  /orders                  OrdersPage (user's order history)
GET  /orders/:orderId         OrderDetailPage (order details + invoice)
GET  /profile                 ProfilePage (account settings)
GET  /login                   LoginPage (Cognito login)
GET  /signup                  SignupPage (Cognito registration)
GET  *                        NotFound (404)
```

#### Admin Routes (Protected by `admin` role)

```
GET  /admin                   AdminDashboard (KPIs, sales graph)
GET  /admin/products          AdminProducts (product CRUD table)
GET  /admin/categories        AdminCategories (category CRUD)
GET  /admin/orders            AdminOrders (order management + fulfillment)
GET  /admin/coupons           AdminCoupons (discount code management)
GET  /admin/users             AdminUsers (customer directory)
GET  /admin/config            AdminConfig (store configuration editor)
GET  /admin/notifications     AdminNotifications (notification logs)
```

### 4.3 Component Patterns

#### Functional Components with Hooks

All components are functional. Example structure:

```tsx
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/formatters';

export default function ProductCard({ product }) {
  const [quantity, setQuantity] = useState(1);
  const { addItem } = useCartStore();
  
  const handleAddToCart = () => {
    addItem(product, quantity);
    toast.success('Added to cart');
  };
  
  return (
    <div className="border rounded-lg p-4 hover:shadow-lg transition">
      <img src={product.images[0]} alt={product.name} />
      <h3 className="text-lg font-semibold mt-2">{product.name}</h3>
      <p className="text-gray-600">{formatCurrency(product.price)}</p>
      <Button onClick={handleAddToCart}>Add to Cart</Button>
    </div>
  );
}
```

#### Form Handling

Use React Hook Form + Zod:

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const schema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'At least 8 chars'),
});

export default function LoginForm() {
  const form = useForm({ resolver: zodResolver(schema) });
  
  const onSubmit = async (data) => {
    const result = await api.post('/auth/login', data);
    useAuthStore.getState().setAuth(result.user, result.token);
  };
  
  return <Form {...form}><form onSubmit={form.handleSubmit(onSubmit)}>...</form></Form>;
}
```

### 4.4 API Integration (`useApi` Hook)

The `useApi` hook wraps `fetch` and auto-injects auth headers:

```tsx
const { data: products, isLoading, error } = useQuery({
  queryKey: ['products'],
  queryFn: () => api.get('/products'),
});
```

Auth token is read from Zustand store (`shopreturngifts-auth` localStorage namespace) and added to all requests as `Authorization: Bearer <token>`.

### 4.5 Styling Patterns

- **Tailwind CSS:** Use utility classes (`flex`, `grid`, `p-4`, `text-lg`, etc.)
- **shadcn/ui Components:** Import from `@/components/ui/*`
- **CSS Modules:** Avoid; use Tailwind instead
- **Theme:** Managed in `tailwind.config.ts` (primary, secondary, accent colors from store config)
- **Dark Mode:** Via next-themes provider (if needed; currently light only)

### 4.6 State Management

#### Zustand Stores (Persisted)

```tsx
// authStore.ts
interface AuthStore {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
  updateProfile: (updates: Partial<User>) => void;
}

// cartStore.ts
interface CartStore {
  items: CartItem[];
  isOpen: boolean;
  addItem: (product: Product, quantity?: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  subtotal: () => number;
  itemCount: () => number;
  toggleCart: () => void;
}
```

Both stores use Zustand's `persist` middleware to save to localStorage with namespace prefix (`shopreturngifts-auth`, `shopreturngifts-cart`).

#### React Query (Server State)

Used for products, categories, orders, users (from API). TanStack Query handles caching, refetch, mutations.

```tsx
const { data } = useQuery({
  queryKey: ['products'],
  queryFn: () => api.get('/products'),
});

const { mutate } = useMutation({
  mutationFn: (data) => api.post('/orders', data),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
});
```

---

## 5. Backend Architecture

### 5.1 Go Lambda Entry Point

**File:** `backend/cmd/api/main.go`

1. **Initialization (`init` function):**
   - Load AWS config (Cognito, DynamoDB, S3)
   - Create DynamoDB client
   - Create S3 client
   - Create Cognito client
   - Initialize handlers with DB instance
   - Create middleware (JWT auth)
   - Build Chi router with routes & middleware
   - Create Chi-to-APIGateway adapter

2. **Handler (`handler` function):**
   - Receives APIGatewayProxyRequest
   - Delegates to Chi adapter
   - Returns APIGatewayProxyResponse

3. **Main:**
   - Register Lambda handler via `lambda.Start(handler)`

### 5.2 Router & Routes

**File:** `backend/internal/router/router.go`

- **Framework:** Chi (minimalist Go HTTP router)
- **Middleware:** Logger, Recoverer, RequestID, CORS
- **CORS:** Allow all origins, all methods (GET, POST, PUT, DELETE), Authorization + Content-Type headers
- **Route Groups:**
  - **Public** (`/api`): auth, products, categories, coupons, config
  - **Authenticated** (`/api` + auth middleware): user profile, orders
  - **Admin** (`/api/admin` + auth + admin groups check): dashboard, CRUD for all entities

### 5.3 Handlers

**File:** `backend/internal/handlers/handlers.go` (824 lines)

Each handler:
1. Decodes JSON request body
2. Calls DB method
3. Returns JSON response or error

**Auth Handlers:**
- `Login(email, password)` → JWT token + user
- `Signup(email, password, name)` → Cognito sign-up, return challenge
- `ConfirmSignup(email, code)` → Cognito confirm, return auth response
- `ResendVerificationCode(email)` → Cognito resend

**Product Handlers (Public):**
- `GetProducts(filters?)` → list all active products
- `GetProduct(productId)` → single product detail

**Product Handlers (Admin):**
- `AdminGetProducts()` → all products (including inactive)
- `AdminCreateProduct(product)` → create new
- `AdminUpdateProduct(productId, product)` → update fields
- `AdminDeleteProduct(productId)` → soft/hard delete
- `AdminGetProductImageUploadURL(productId)` → S3 pre-signed URL

**Category Handlers:** Similar CRUD pattern

**Order Handlers:**
- `CreateOrder(items, address, coupon?)` → Create via Stripe Payment Intent
- `GetOrder(orderId)` → User's own order detail
- `GetOrders()` → List user's orders
- `GetInvoice(orderId)` → Generate/download PDF from S3
- `AdminGetOrder(orderId)` → Admin view
- `AdminGetOrders()` → All orders
- `AdminUpdateOrderStatus(orderId, status)` → Set Pending→Processing→Shipped→Delivered
- `AdminFulfillOrder(orderId)` → Mark fulfilled, send notification

**User Handlers:**
- `GetMe()` → Current user profile
- `UpdateMe(user)` → Update name, email, phone
- `UpdateAddress(address)` → Shipping address
- `AdminGetUser(userId)` → Admin user view
- `AdminUpdateUser(userId, user)` → Admin user update
- `AdminDeleteUser(userId)` → Admin delete user

**Config Handlers:**
- `GetTheme()` → Public store config (colors, labels, etc.)
- `AdminGetConfig()` → Admin view of full config
- `AdminUpdateConfig(config)` → Update store config
- `AdminGetLogoUploadURL()` → S3 pre-signed URL for logo
- `AdminGetHeroImageUploadURL()` → S3 pre-signed URL for hero

**Coupon Handlers:**
- `ValidateCoupon(code)` → Check if code is valid, return discount
- `AdminGetCoupons()` → List all coupons
- `AdminCreateCoupon(coupon)` → Create new coupon
- `AdminUpdateCoupon(couponId, coupon)` → Update
- `AdminDeleteCoupon(couponId)` → Delete

**Dashboard Handler:**
- `AdminGetDashboard()` → Return KPIs (total orders, revenue, avg order value, active users)

### 5.4 Middleware

**File:** `backend/internal/middleware/auth.go`

- **JWT Verification:** Validates Bearer token via Cognito public keys
- **Admin Check:** Verifies user is in Cognito `admin` group
- **Context Injection:** Stores user ID, email, role in request context for handlers to access

### 5.5 Data Persistence

**File:** `backend/internal/store/dynamodb.go`

- Implements all CRUD operations against DynamoDB
- Single table design with PK/SK patterns
- Uses AWS SDK v2 for DynamoDB + Cognito + S3
- Methods return mapped Go structs (User, Product, Order, etc.)

### 5.6 Models

**File:** `backend/internal/models/models.go`

Defines request/response structs:
- `LoginRequest`, `LoginResponse`
- `SignupRequest`, `SignupResponse`
- `ConfirmSignupRequest`
- `Product`, `Category`, `Order`, `OrderItem`, `User`, `Address`
- `CreateProductRequest`, `UpdateOrderStatusRequest`, etc.

---

## 6. Database Design (DynamoDB)

### 6.1 Table Structure

**Single DynamoDB Table:** output `TableName` from CloudFormation stack `shopreturngifts`

**Partition Key (PK):** Entity type + ID (e.g., `PRODUCT#abc123`)
**Sort Key (SK):** Entity type + ID or metadata (e.g., `PRODUCT#abc123`, `METADATA#created`)
**Global Secondary Indexes (GSIs):**
- **GSI1:** Query entities by secondary access pattern (e.g., orders by user)
- **GSI2:** Future use for additional patterns

### 6.2 Entity Patterns

| Entity    | PK                   | SK                    | GSI1PK      | GSI1SK          |
|-----------|----------------------|-----------------------|-------------|-----------------|
| Product   | `PRODUCT#<id>`       | `PRODUCT#<id>`        | `CAT#<catId>`| `PRODUCT#<id>` |
| Category  | `CAT#<id>`           | `CAT#<id>`            | —           | —              |
| User      | `USER#<id>`          | `USER#<id>`           | `USER#email`| `<email>`      |
| Order     | `ORDER#<id>`         | `ORDER#<id>`          | `USER#<id>` | `ORDER#<date>` |
| Config    | `CONFIG`             | `CONFIG`              | —           | —              |
| Coupon    | `COUPON#<code>`      | `COUPON#<code>`       | —           | —              |

### 6.3 Key Attributes

**Products:**
```json
{
  "PK": "PRODUCT#abc123",
  "SK": "PRODUCT#abc123",
  "productId": "abc123",
  "name": "Organic Apples",
  "price": 2.99,
  "stock": 150,
  "category": "Produce",
  "images": ["s3://..."],
  "isActive": true,
  "createdAt": "2026-03-20T10:00:00Z",
  "updatedAt": "2026-03-23T14:30:00Z"
}
```

**Orders:**
```json
{
  "PK": "ORDER#ord-123",
  "SK": "ORDER#ord-123",
  "GSI1PK": "USER#user-456",
  "GSI1SK": "ORDER#2026-03-23",
  "orderId": "ord-123",
  "orderNumber": "ORD-00001",
  "userId": "user-456",
  "status": "Paid",
  "items": [
    { "productId": "abc123", "name": "Apples", "qty": 2, "unitPrice": 2.99 }
  ],
  "subtotal": 5.98,
  "tax": 0.50,
  "total": 6.48,
  "stripePaymentIntentId": "pi_...",
  "createdAt": "2026-03-23T14:30:00Z"
}
```

**Users:**
```json
{
  "PK": "USER#user-456",
  "SK": "USER#user-456",
  "GSI1PK": "USER#john@example.com",
  "GSI1SK": "john@example.com",
  "userId": "user-456",
  "email": "john@example.com",
  "name": "John Doe",
  "phone": "+14805551234",
  "role": "customer",
  "address": {
    "line1": "123 Main St",
    "city": "Phoenix",
    "state": "AZ",
    "zip": "85001",
    "country": "US"
  },
  "createdAt": "2026-03-20T10:00:00Z"
}
```

### 6.4 TTL & Streaming

- **TTL Enabled:** `expiresAt` attribute used on coupons, promotion banners
- **DynamoDB Streams:** Enabled for future Lambda triggers (e.g., price reverts on expiry)

### 6.5 Indexes

- **GSI1:** Enables queries like "all orders from user X", "all products in category Y"
- **No LSI:** All sorting done post-fetch in Lambda (acceptable for small/medium datasets)

---

## 7. API Endpoints Reference

### 7.1 Public Endpoints

#### Auth

| Method | Path                    | Request Body                     | Response            | Status |
|--------|-------------------------|----------------------------------|---------------------|--------|
| POST   | `/api/auth/login`       | `{ email, password }`            | `{ user, token }`   | 200    |
| POST   | `/api/auth/signup`      | `{ email, password, name }`      | `{ userSub, ... }`  | 201    |
| POST   | `/api/auth/confirm`     | `{ email, code }`                | `{ user, token }`   | 200    |
| POST   | `/api/auth/resend-code` | `{ email }`                      | `{ ok: true }`      | 200    |

#### Products & Categories

| Method | Path                       | Query Params         | Response              | Status |
|--------|----------------------------|----------------------|-----------------------|--------|
| GET    | `/api/products`            | `search?`, `category?`| `Product[]`           | 200    |
| GET    | `/api/products/:productId` | —                    | `Product`             | 200    |
| GET    | `/api/categories`          | —                    | `Category[]`          | 200    |

#### Config & Coupons

| Method | Path                  | Query Params | Response          | Status |
|--------|----------------------|--------------|-------------------|--------|
| GET    | `/api/config/theme`  | —            | `StoreConfig`     | 200    |
| GET    | `/api/coupons/validate` | `code?`  | `{ discount%, ... }` or error | 200/400 |

### 7.2 Authenticated Endpoints (Bearer Token Required)

#### User Profile

| Method | Path                 | Request Body           | Response      | Status |
|--------|----------------------|------------------------|---------------|--------|
| GET    | `/api/users/me`      | —                      | `User`        | 200    |
| PUT    | `/api/users/me`      | `{ name, phone, ... }` | `User`        | 200    |
| PUT    | `/api/users/me/address` | `Address`            | `User`        | 200    |

#### Orders

| Method | Path                        | Request Body                  | Response          | Status |
|--------|-----------------------------|------------------------------ |-------------------|--------|
| GET    | `/api/orders`               | —                             | `Order[]`         | 200    |
| GET    | `/api/orders/:orderId`      | —                             | `Order`           | 200    |
| POST   | `/api/orders`               | `{ items, address, coupon? }` | `Order`           | 201    |
| GET    | `/api/orders/:orderId/invoice` | —                           | PDF (binary)      | 200    |

### 7.3 Admin Endpoints (Bearer Token + Admin Group)

#### Dashboard

| Method | Path               | Response                               | Status |
|--------|-------------------|----------------------------------------|--------|
| GET    | `/api/admin/dashboard` | `{ totalOrders, revenue, avgOrder, ... }` | 200 |

#### Products (CRUD)

| Method | Path                                 | Request Body  | Response    | Status |
|--------|--------------------------------------|---------------|-------------|--------|
| GET    | `/api/admin/products`                | —             | `Product[]` | 200    |
| POST   | `/api/admin/products`                | `Product`     | `Product`   | 201    |
| PUT    | `/api/admin/products/:productId`     | `Product`     | `Product`   | 200    |
| DELETE | `/api/admin/products/:productId`     | —             | —           | 204    |
| POST   | `/api/admin/products/:productId/image-upload-url` | — | `{ uploadUrl.. }` | 200 |

#### Categories, Orders, Users, Coupons, Config

Similar CRUD patterns for `/api/admin/categories`, `/api/admin/orders`, `/api/admin/users`, `/api/admin/coupons`, `/api/admin/config`.

---

## 8. Development Setup & Commands

### 8.1 Prerequisites

- **Node.js:** 20.x or later (use Bun for package management)
- **Go:** 1.22 or later
- **Bun:** Latest version (package manager instead of npm)
- **Git:** For version control
- **AWS CLI:** For S3/CloudFront operations (dev deployments)
- **AWS SAM CLI:** For local Lambda testing (optional)

### 8.2 Frontend Setup

```bash
# Install dependencies (using Bun instead of npm)
bun install

# Start Vite dev server (HMR on localhost:8080)
bun run dev

# Build frontend (Vite produces static export)
bun run build

# Run tests (Vitest)
bun run test
bun run test:watch

# Lint & type check
bun run lint

# Preview production build locally
bun run preview
```

**Environment Variables (.env.local):**

```
VITE_API_BASE_URL=https://api.shopreturngifts.com/api
VITE_STRIPE_PUBLIC_KEY=pk_test_...
```

### 8.3 Backend Setup

```bash
cd backend

# Download dependencies
go mod tidy

# Build for Lambda (ARM64 Linux)
make build
# Creates: ./bootstrap (5-15 MB binary)

# Run tests
make test

# Run locally (for debugging, not as Lambda)
make run-local

# Clean build artifacts
make clean
```

**Environment Variables (.env / Lambda):**

```
TABLE_NAME=shopreturngifts
S3_BUCKET=shopreturngifts-store-assets-prod
COGNITO_USER_POOL_ID=us-east-1_xxxxx
COGNITO_APP_CLIENT_ID=xxxxx
AWS_REGION=us-east-1
STRIPE_SECRET_KEY=sk_test_...
```

### 8.4 Local Testing

#### Frontend

```bash
# Vitest run once
bun run test

# Vitest watch mode
bun run test:watch

# Playwright E2E (requires backend running)
bunx playwright test
```

#### Backend

```bash
cd backend

# Run all tests
go test ./...

# Run specific test package
go test ./internal/handlers -v

# Run test with output
go test -v -run TestLogin
```

### 8.5 Common Dev Tasks

**Hot Reload (Frontend):**
- Vite HMR watches `src/**` files
- Changes auto-refresh in browser (localhost:8080)

**Port Configuration:**
- Frontend dev: `http://localhost:8080`
- Backend local: `http://localhost:9000` (via `go run`)

**Debugging:**

Frontend:
```bash
# VS Code: Add breakpoint, DevTools Console → debug
# Browser DevTools: F12 → Sources tab
```

Backend:
```bash
# Run locally with logging
make run-local
# Or use GoLand/VS Code Go debugger
```

---

## 9. Deployment & CI/CD

### 9.1 GitHub Actions Pipeline

**File:** `.github/workflows/deploy.yml`

**Triggers:** Push to `main` or PR to `main`

**Jobs:**

1. **Test:** (runs on all triggers)
   - Frontend: `npm install` + `npm test -- --run`
   - Backend: `go mod tidy` + `go test ./...`
   - If either fails, deployment skips

2. **Frontend:** (runs only on push to main)
   - Setup Node.js 20
   - `npm install` + `npm run build`
   - Syncs `dist/` to S3 bucket
   - Invalidates CloudFront distribution
   - Takes ~3-5 minutes

3. **Backend:** (runs only on push to main)
   - Setup Go 1.22
   - Build Go binary: `GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build`
   - Run SAM build & deployment via `sam deploy`
   - Updates Lambda function code
   - Updates API Gateway routes
   - Takes ~5-10 minutes

### 9.2 Manual Deployment

**Frontend:**

```bash
# Build static export
bun run build

# Sync to S3
aws s3 sync dist/ s3://shopreturngifts-store-assets-prod/ --delete

# Invalidate CloudFront
aws cloudfront create-invalidation \
  --distribution-id E123ABCDEF \
  --paths "/*"
```

**Backend:**

```bash
cd backend

# Build binary
make build

# Deploy via SAM
sam deploy \
  --template-file ../template.yaml \
  --stack-name shopreturngifts \
  --s3-bucket shopreturngifts-artifacts \
  --region us-east-1 \
  --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND_MACRO \
  --parameter-overrides Stage=prod
```

### 9.3 Environment Stages

- **dev:** Development (loose error handling, verbose logging)
- **staging:** Staging (production config, test data)
- **prod:** Production (live Cognito pool, real Stripe keys)

Each stage has separate:
- DynamoDB table
- Cognito User Pool
- S3 buckets
- Lambda functions
- API Gateway endpoints

---

## 10. Code Patterns & Conventions

### 10.1 Naming Conventions

**Frontend (TypeScript/React):**

- **Components:** PascalCase (`ProductCard.tsx`, `CartDrawer.tsx`)
- **Pages:** PascalCase ending in "Page" (`HomePage.tsx`, `ProductDetailPage.tsx`)
- **Hooks:** camelCase starting with "use" (`useApi.ts`, `useSyncCartPrices.ts`)
- **Stores:** camelCase ending in "Store" (`authStore.ts`, `cartStore.ts`)
- **Types:** PascalCase (`User`, `Product`, `Order`) or prefixed for unions (`OrderStatus`, `UserType`)
- **Utility functions:** camelCase (`formatCurrency`, `debounce`)
- **CSS classes:** kebab-case (Tailwind utility classes, or custom with prefix if needed)

**Backend (Go):**

- **Packages:** lowercase, no underscores (`handlers`, `middleware`, `store`)
- **Functions:** PascalCase for exported, camelCase for unexported
- **Variables:** camelCase
- **Constants:** ALL_CAPS (e.g., `PRODUCT_PREFIX = "PRODUCT#"`)
- **Structs:** PascalCase (e.g., `type Product struct`)
- **Interfaces:** PascalCase (e.g., `type Store interface`)

### 10.2 Frontend Patterns

#### API Calls

```tsx
// Use useApi hook (wraps fetch + auto auth headers)
const { data, isLoading, error } = useQuery({
  queryKey: ['products'],
  queryFn: () => api.get('/products'),
});

// Or mutate
const { mutate: updateProduct } = useMutation({
  mutationFn: (data) => api.put(`/products/${data.id}`, data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['products'] });
    toast.success('Product updated');
  },
  onError: (err) => {
    toast.error(err.message);
  },
});
```

#### Component Structure

```tsx
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/useApi';
import { Product } from '@/types';

interface ComponentProps {
  productId: string;
  onSelect?: (product: Product) => void;
}

export default function MyComponent({ productId, onSelect }: ComponentProps) {
  const [loading, setLoading] = useState(false);
  const { data: product } = useQuery({
    queryKey: ['product', productId],
    queryFn: () => api.get(`/products/${productId}`),
  });

  const handleAction = async () => {
    setLoading(true);
    try {
      // action
      onSelect?.(product);
    } catch (err) {
      // error handling
    } finally {
      setLoading(false);
    }
  };

  if (!product) return <div>Loading...</div>;

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold">{product.name}</h2>
      <Button onClick={handleAction} disabled={loading}>
        {loading ? 'Processing...' : 'Click Me'}
      </Button>
    </div>
  );
}
```

#### Form Handling

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormField, FormItem, FormLabel, FormControl } from '@/components/ui/form';

const formSchema = z.object({
  email: z.string().email('Invalid email'),
  name: z.string().min(1, 'Name required'),
  zip: z.string().regex(/^\d{5}$/, 'Valid ZIP required'),
});

export function MyForm({ onSubmit }) {
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', name: '', zip: '' },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input {...field} type="email" />
              </FormControl>
            </FormItem>
          )}
        />
        {/* repeat for other fields */}
        <Button type="submit">Submit</Button>
      </form>
    </Form>
  );
}
```

### 10.3 Backend Patterns

#### Handler Template

```go
func (h *Handlers) MyHandler(w http.ResponseWriter, r *http.Request) {
  var req models.MyRequest
  if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
    writeError(w, http.StatusBadRequest, "invalid request")
    return
  }

  // Validate
  if req.Email == "" {
    writeError(w, http.StatusBadRequest, "email required")
    return
  }

  // Query DB
  result, err := h.db.DoSomething(r.Context(), &req)
  if err != nil {
    writeError(w, http.StatusInternalServerError, err.Error())
    return
  }

  writeJSON(w, http.StatusOK, result)
}
```

#### DynamoDB Query Pattern

```go
// Query by primary key
item := &Product{}
result, err := d.Client.GetItem(ctx, &dynamodb.GetItemInput{
  TableName: aws.String(d.TableName),
  Key: map[string]types.AttributeValue{
    "PK": &types.AttributeValueMemberS{Value: fmt.Sprintf("PRODUCT#%s", id)},
    "SK": &types.AttributeValueMemberS{Value: fmt.Sprintf("PRODUCT#%s", id)},
  },
})

// Parse result
err = attributevalue.UnmarshalMap(result.Item, item)

// Query by GSI
scanResult, err := d.Client.Query(ctx, &dynamodb.QueryInput{
  TableName:            aws.String(d.TableName),
  IndexName:            aws.String("GSI1"),
  KeyConditionExpression: aws.String("GSI1PK = :pk"),
  ExpressionAttributeValues: map[string]types.AttributeValue{
    ":pk": &types.AttributeValueMemberS{Value: fmt.Sprintf("USER#%s", userId)},
  },
})
```

---

## 11. State Management

### 11.1 Zustand (Client-Side Persistent State)

**When to use:** Auth state, cart items, user preferences (persist to localStorage)

**Example:**

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface MyStore {
  count: number;
  increment: () => void;
}

export const useMyStore = create<MyStore>()(
  persist(
    (set) => ({
      count: 0,
      increment: () => set((state) => ({ count: state.count + 1 })),
    }),
    { name: 'my-store' } // localStorage key
  )
);
```

**Usage in Components:**

```tsx
const { count, increment } = useMyStore();
return <button onClick={increment}>{count}</button>;
```

### 11.2 React Query (Server State)

**When to use:** Products, orders, users (fetched from API, cached, refetch on invalidation)

**Example:**

```ts
const { data: products, isLoading } = useQuery({
  queryKey: ['products'],
  queryFn: () => api.get('/products'),
  staleTime: 5 * 60 * 1000, // 5m cache
});

const { mutate: deleteProduct } = useMutation({
  mutationFn: (id) => api.delete(`/products/${id}`),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['products'] });
  },
});
```

### 11.3 Combining Both

```tsx
export function CartPage() {
  const { items } = useCartStore(); // Zustand (persisted)
  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.get('/products'),
  });

  const cartWithPrices = items.map(item => {
    const currentProduct = products?.find(p => p.id === item.productId);
    return { ...item, currentPrice: currentProduct?.price };
  });

  return <div>{cartWithPrices.map(...)}</div>;
}
```

---

## 12. Common Development Tasks

### 12.1 Adding a New Product Attribute

**Scenario:** Store wants to add "Calories per serving" to all products.

**Steps:**

1. **Update TypeScript Type** (`src/types/index.ts`):
   ```ts
   export interface Product {
     // ... existing
     caloriesPerServing?: number;
   }
   ```

2. **Update Backend Model** (`backend/internal/models/models.go`):
   ```go
   type Product struct {
     // ... existing
     CaloriesPerServing *float64 `json:"caloriesPerServing"`
   }
   ```

3. **Update Admin Form** (`src/pages/admin/AdminProducts.tsx`):
   ```tsx
   <FormField
     control={form.control}
     name="caloriesPerServing"
     render={({ field }) => (
       <FormItem>
         <FormLabel>Calories per serving</FormLabel>
         <FormControl>
           <Input {...field} type="number" />
         </FormControl>
       </FormItem>
     )}
   />
   ```

4. **Update Product Card Display** (`src/components/store/ProductCard.tsx`):
   ```tsx
   {product.caloriesPerServing && (
     <p className="text-sm text-gray-500">
       {product.caloriesPerServing} cal/serving
     </p>
   )}
   ```

5. **No database schema changes needed:** DynamoDB auto-accepts new attributes.

### 12.2 Adding a New Admin Page/Feature

**Scenario:** Add analytics dashboard showing traffic sources.

**Steps:**

1. **Create Page Component** (`src/pages/admin/AdminAnalytics.tsx`):
   ```tsx
   import { useQuery } from '@tanstack/react-query';
   import { api } from '@/lib/api';

   export default function AdminAnalytics() {
     const { data: analytics } = useQuery({
       queryKey: ['analytics'],
       queryFn: () => api.get('/admin/analytics'),
     });

     return (
       <div>
         <h1>Analytics</h1>
         {/* chart visualization */}
       </div>
     );
   }
   ```

2. **Add Route** (`src/App.tsx`):
   ```tsx
   <Route path="/admin/analytics" element={<AdminAnalytics />} />
   ```

3. **Add Backend Handler** (`backend/internal/handlers/handlers.go`):
   ```go
   func (h *Handlers) AdminGetAnalytics(w http.ResponseWriter, r *http.Request) {
     analytics, err := h.db.GetAnalytics(r.Context())
     if err != nil {
       writeError(w, http.StatusInternalServerError, err.Error())
       return
     }
     writeJSON(w, http.StatusOK, analytics)
   }
   ```

4. **Add Route** (`backend/internal/router/router.go`):
   ```go
   r.Get("/analytics", h.AdminGetAnalytics)
   ```

5. **Add DB Method** (`backend/internal/store/dynamodb.go`):
   ```go
   func (d *DynamoDB) GetAnalytics(ctx context.Context) (*models.Analytics, error) {
     // Query DynamoDB, aggregate data
     return &analytics, nil
   }
   ```

### 12.3 Adding a New API Endpoint

**Scenario:** Add endpoint to check product availability by ZIP.

**Steps:**

1. **Backend Handler** (`backend/internal/handlers/handlers.go`):
   ```go
   func (h *Handlers) CheckProductAvailability(w http.ResponseWriter, r *http.Request) {
     productId := r.URL.Query().Get("productId")
     zip := r.URL.Query().Get("zip")
     
     available, err := h.db.CheckAvailability(r.Context(), productId, zip)
     if err != nil {
       writeError(w, http.StatusBadRequest, err.Error())
       return
     }
     writeJSON(w, http.StatusOK, map[string]bool{"available": available})
   }
   ```

2. **Add Route** (`backend/internal/router/router.go`):
   ```go
   r.Get("/products/availability", h.CheckProductAvailability) // public
   ```

3. **Frontend Hook/API Call** (`src/hooks/useApi.ts` or direct in component):
   ```ts
   const checkAvailability = async (productId: string, zip: string) => {
     return api.get(`/products/availability?productId=${productId}&zip=${zip}`);
   };
   ```

4. **Use in Component**:
   ```tsx
   const { data: available } = useQuery({
     queryKey: ['availability', productId, zip],
     queryFn: () => checkAvailability(productId, zip),
   });
   ```

### 12.4 Creating a New Zustand Store

**Scenario:** Add a wishlist feature.

**Steps:**

1. **Create Store** (`src/stores/wishlistStore.ts`):
   ```ts
   import { create } from 'zustand';
   import { persist } from 'zustand/middleware';
   import type { Product } from '@/types';

   interface WishlistStore {
     items: Product[];
     addItem: (product: Product) => void;
     removeItem: (productId: string) => void;
     isInWishlist: (productId: string) => boolean;
   }

   export const useWishlistStore = create<WishlistStore>()(
     persist(
       (set, get) => ({
         items: [],
         addItem: (product) => set((state) => ({
           items: [...state.items, product],
         })),
         removeItem: (productId) => set((state) => ({
           items: state.items.filter((p) => p.productId !== productId),
         })),
         isInWishlist: (productId) =>
           get().items.some((p) => p.productId === productId),
       }),
       { name: 'shopreturngifts-wishlist' }
     )
   );
   ```

2. **Use in Components**:
   ```tsx
   const { addItem, isInWishlist } = useWishlistStore();
   
   <button onClick={() => addItem(product)}>
     {isInWishlist(product.productId) ? '♥' : '♡'}
   </button>
   ```

### 12.5 Adding Form Validation with Zod

**Scenario:** Validate address form input.

**Steps:**

```ts
import * as z from 'zod';

const addressSchema = z.object({
  line1: z.string().min(5, 'Address too short'),
  city: z.string().min(2, 'City required'),
  state: z.string(). length(2, 'State must be 2 chars'),
  zip: z.string().regex(/^\d{5}$/, 'ZIP must be 5 digits'),
  country: z.enum(['US']),
});

type Address = z.infer<typeof addressSchema>;

// In component:
const form = useForm({
  resolver: zodResolver(addressSchema),
});
```

---

## 13. Key Configuration Files

### 13.1 `vite.config.ts`

Defines Vite behavior:
- Dev server on port 8080
- SWC transpiler for React JSX
- Path alias `@/*` → `src/*`
- Component tagger plugin (development mode)

### 13.2 `tailwind.config.ts`

Tailwind CSS setup:
- Scans `src/**/*.{jsx,tsx}` for class usage
- Defines color theme
- Extends plugins (animations, typography)

### 13.3 `tsconfig.json`

TypeScript configuration:
- Root config references `tsconfig.app.json` and `tsconfig.node.json`
- Allows loose typing for gradual migration
- Path aliases (`@/*`)

### 13.4 `template.yaml`

AWS SAM (Infrastructure as Code):
- DynamoDB table definition with PK/SK, GSIs, TTL
- Lambda function (memory, timeout, runtime, environment variables)
- API Gateway (HTTP API, CORS, stages)
- Cognito User Pool & App Client
- S3 buckets for assets
- CloudFront distribution for CDN
- IAM roles & permissions

**Key sections:**
- **Parameters:** Stage (dev/staging/prod), domain, custom domain
- **Resources:** All AWS resources
- **Outputs:** Endpoint URLs, table names, etc.

### 13.5 `.github/workflows/deploy.yml`

CI/CD pipeline:
- Test job: npm test, go test
- Frontend job: npm build, S3 sync, CloudFront invalidate
- Backend job: SAM build & deploy

### 13.6 `package.json`

Frontend dependencies:
- React + Vite
- shadcn/ui (Radix)
- TanStack React Query
- Zustand
- Tailwind + PostCSS
- Vitest + Playwright
- TypeScript, ESLint

### 13.7 `backend/go.mod`

Backend dependencies:
- aws-lambda-go
- aws-sdk-go-v2 (DynamoDB, S3, Cognito)
- chi (router)
- stripe-go
- golang-jwt

### 13.8 `components.json`

shadcn/ui registry:
- Defines component paths, alias, CSS framework (Tailwind)
- Used by `npx shadcn` CLI to scaffold components

---

## 14. Important Constraints & Guidelines

### 14.1 Frontend Constraints

1. **No Hardcoded Strings:** All UI labels read from `storeConfig` (except generic ones like "Error", "Loading").
2. **TypeScript Strict Mode:** Use strict null checks; avoid `any` type unless absolutely necessary.
3. **Component Sizing:** Functional components only (no class components).
4. **State Persistence:** Only use Zustand for data that needs localStorage (auth, cart). Use React Query for server state.
5. **Styling:** Tailwind CSS only; no inline styles or CSS-in-JS (styled-components, Emotion).
6. **Routing:** React Router v6; no client-side redirects in render (use useEffect or navigation).
7. **API Calls:** Use `useQuery`/`useMutation` from React Query, never raw `fetch` in render.
8. **Image Optimization:** Lazy load images; use `<img>` with `loading="lazy"` or next-gen formats.
9. **Accessibility:** Semantic HTML; ARIA labels for interactive elements; keyboard navigation support.
10. **Build Output:** `bun run build` produces static `dist/` folder; no server-side rendering needed.

### 14.2 Backend Constraints

1. **Handler Signature:** Must accept `(w http.ResponseWriter, r *http.Request)`.
2. **JSON Response:** All responses must be valid JSON; use `writeJSON()` helper.
3. **Error Handling:** Log errors to CloudWatch; return appropriate HTTP status codes.
4. **Authentication:** JWT token in Authorization header; validate via middleware.
5. **CORS:** Already configured in router; don't override.
6. **Database:** Single DynamoDB table; use PK/SK patterns; no N+1 queries (batch operations if needed).
7. **Timeouts:** Lambda timeout is 30 seconds; don't exceed (optimize queries).
8. **Environment Variables:** Read from `os.Getenv()`; never embed secrets in code.
9. **Logging:** Use standard `log` package and CloudWatch for centralized logging.
10. **Testing:** Write unit tests for handlers and DB operations; use table-driven tests.

### 14.3 Database Constraints

1. **Single Table:** All entities in `shopreturngifts-{stage}` table; no multi-table joins.
2. **PK/SK Patterns:** Entity#ID format; maintain consistency across code.
3. **No Deletion:** Use soft deletes (isActive flag) to avoid replication issues.
4. **TTL:** Only on time-sensitive data (coupons, banners); set `expiresAt` timestamp.
5. **GSI Queries:** Efficient for secondary patterns; avoid complex conditions in queries.
6. **Batch Operations:** Use batch APIs for bulk inserts/updates (TransactWriteItems).
7. **No Large Attributes:** Keep items under 400 KB (DynamoDB item size limit).

### 14.4 Deployment Constraints

1. **Frontend:** Static export only (`bun run build` → `dist/`); no server-side rendering.
2. **Backend:** Go binaries only; no shell scripts in Lambda.
3. **Environment Variables:** Set in `template.yaml` or AWS console for each stage.
4. **Secrets:** Use AWS Secrets Manager; never commit `.env` files with actual keys.
5. **DNS:** Custom domain requires Route53 hosted zone + ACM certificate.
6. **CORS:** Configured to allow all origins (can restrict in `template.yaml`).

### 14.5 Code Quality

1. **No TODOs:** Comments without action items are discouraged.
2. **Consistent Formatting:** Use `gofmt` (Go), ESLint (TypeScript).
3. **No Dead Code:** Remove unused imports, functions, variables.
4. **Comments:** Explain "why", not "what"; code should explain itself.
5. **DRY:** Don't repeat logic; extract to reusable functions/utilities.
6. **Error Messages:** User-friendly (frontend), detailed (backend logs).

---

## 15. Common Pitfalls & Solutions

### 15.1 Frontend Pitfalls

**Pitfall 1: Calling API without error handling**

❌ **Wrong:**
```ts
const { data } = useQuery({
  queryKey: ['products'],
  queryFn: () => api.get('/products'),
});
```

✅ **Right:**
```ts
const { data, error, isLoading } = useQuery({
  queryKey: ['products'],
  queryFn: () => api.get('/products'),
});

if (error) return <div>Error: {error.message}</div>;
if (isLoading) return <div>Loading...</div>;
return <div>{data.map(...)}</div>;
```

**Pitfall 2: Storing sensitive data in localStorage**

❌ **Wrong:**
```ts
localStorage.setItem('stripe_secret_key', stripeSecret);
```

✅ **Right:**
```ts
// Only store public keys in localStorage; secrets stay server-side
localStorage.setItem('stripe_public_key', stripePublic);
```

**Pitfall 3: Mutating state directly**

❌ **Wrong:**
```ts
const cart = useCartStore();
cart.items.push(newItem); // Direct mutation
```

✅ **Right:**
```ts
const { addItem } = useCartStore();
addItem(newItem); // Use defined action
```

**Pitfall 4: Infinite re-renders in useEffect**

❌ **Wrong:**
```ts
useEffect(() => {
  setData(fetchData()); // no dependency array → runs every render
}, []);

useEffect(() => {
  fetchData(); // fetchData not in deps → stale closure
}, [data]);
```

✅ **Right:**
```ts
const { data } = useQuery({
  queryKey: ['data'],
  queryFn: fetchData,
});

// Or with manual useEffect:
useEffect(() => {
  fetchData();
}, []); // proper dependencies
```

**Pitfall 5: Blocking the UI during async operations**

❌ **Wrong:**
```ts
const handleSubmit = async (data) => {
  const result = await api.post('/orders', data);
  setOrders([...orders, result]); // blocks until API responds
};
```

✅ **Right:**
```ts
const { mutate } = useMutation({
  mutationFn: (data) => api.post('/orders', data),
  onSuccess: (result) => {
    queryClient.setQueryData(['orders'], (old) => [...old, result]);
  },
});

const handleSubmit = (data) => mutate(data); // non-blocking
```

### 15.2 Backend Pitfalls

**Pitfall 1: Not checking request body decode errors**

❌ **Wrong:**
```go
func (h *Handlers) CreateProduct(w http.ResponseWriter, r *http.Request) {
  var req models.Product
  json.NewDecoder(r.Body).Decode(&req) // ignoring error
  // proceed...
}
```

✅ **Right:**
```go
func (h *Handlers) CreateProduct(w http.ResponseWriter, r *http.Request) {
  var req models.Product
  if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
    writeError(w, http.StatusBadRequest, "invalid request body")
    return
  }
  // proceed...
}
```

**Pitfall 2: Not validating user input**

❌ **Wrong:**
```go
email := req.Email
// use email directly without checks
```

✅ **Right:**
```go
email := strings.TrimSpace(req.Email)
if email == "" {
  writeError(w, http.StatusBadRequest, "email required")
  return
}
if !isValidEmail(email) {
  writeError(w, http.StatusBadRequest, "invalid email format")
  return
}
```

**Pitfall 3: Not checking context cancellation**

❌ **Wrong:**
```go
func (h *Handlers) MyHandler(w http.ResponseWriter, r *http.Request) {
  result, _ := h.db.SlowQuery(r.Context()) // might timeout
  writeJSON(w, 200, result)
}
```

✅ **Right:**
```go
func (h *Handlers) MyHandler(w http.ResponseWriter, r *http.Request) {
  ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
  defer cancel()
  
  result, err := h.db.SlowQuery(ctx)
  if err == context.DeadlineExceeded {
    writeError(w, http.StatusGatewayTimeout, "request timeout")
    return
  }
  if err != nil {
    writeError(w, http.StatusInternalServerError, "query failed")
    return
  }
  writeJSON(w, 200, result)
}
```

**Pitfall 4: Hardcoding AWS region/table name**

❌ **Wrong:**
```go
const TABLE_NAME = "shopreturngifts"
```

✅ **Right:**
```go
tableName := os.Getenv("TABLE_NAME") // read from env vars
```

**Pitfall 5: Not handling DynamoDB JSON unmarshaling**

❌ **Wrong:**
```go
var product models.Product
err := dynamodb.UnmarshalMap(result.Item, &product) // might fail silently
```

✅ **Right:**
```go
var product models.Product
if err := dynamodb.UnmarshalMap(result.Item, &product); err != nil {
  log.Printf("failed to unmarshal: %v", err)
  writeError(w, http.StatusInternalServerError, "failed to parse response")
  return
}
```

### 15.3 Deployment Pitfalls

**Pitfall 1: Committing secrets to git**

❌ **Wrong:**
```bash
git add .env
git commit -m "add env vars"
```

✅ **Right:**
```bash
# .gitignore
.env
.env.local
.aws/credentials

# Use AWS Secrets Manager instead
sam deploy --parameter-overrides StripeKey=$(aws secretsmanager get-secret-value --secret-id stripe-key)
```

**Pitfall 2: Not updating environment vars in Lambda**

❌ **Wrong:**
```bash
# Update template.yaml but forget to redeploy
# Old env vars still in Lambda
```

✅ **Right:**
```yaml
# template.yaml
Environment:
  Variables:
    TABLE_NAME: !Sub shopreturngifts-${Stage}
    S3_BUCKET: !GetAtt AssetsBucket.DomainName
    STRIPE_KEY: {{resolve:secretsmanager:stripe-key}}

# Deploy:
sam deploy --parameter-overrides Stage=prod
```

**Pitfall 3: Not invalidating CloudFront cache**

❌ **Wrong:**
```bash
aws s3 sync dist/ s3://bucket/
# Browser caches old files; users don't see updates
```

✅ **Right:**
```bash
aws s3 sync dist/ s3://bucket/
aws cloudfront create-invalidation --distribution-id E123ABC --paths "/*"
```

**Pitfall 4: Building for wrong architecture**

❌ **Wrong:**
```bash
# On M1 Mac:
go build -o bootstrap ./cmd/api
# Produces ARM64 binary; might not work if Lambda expects x86_64
```

✅ **Right:**
```bash
# Always build for Lambda target:
GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -tags lambda.norpc -o bootstrap ./cmd/api
```

### 15.4 Testing Pitfalls

**Pitfall 1: Not mocking external services**

❌ **Wrong:**
```ts
// Test makes real API calls
test('login', async () => {
  const result = await api.post('/auth/login', { email, password });
});
```

✅ **Right:**
```ts
// Mock API client
vi.mock('@/lib/api', () => ({
  api: {
    post: vi.fn().mockResolvedValue({ token, user }),
  },
}));

test('login', async () => {
  const result = await login({ email, password });
  expect(result.token).toBeDefined();
});
```

**Pitfall 2: Not cleaning up after tests**

❌ **Wrong:**
```go
func TestCreateProduct(t *testing.T) {
  product := createTestProduct(t)
  // product left in database; pollutes next test run
}
```

✅ **Right:**
```go
func TestCreateProduct(t *testing.T) {
  product := createTestProduct(t)
  defer deleteTestProduct(t, product.ID) // cleanup
  // assertions...
}
```

**Pitfall 3: Not testing error cases**

❌ **Wrong:**
```ts
test('fetch products', async () => {
  const products = await getProducts();
  expect(products.length).toBeGreaterThan(0);
});
```

✅ **Right:**
```ts
test('fetch products success', async () => {
  const products = await getProducts();
  expect(products.length).toBeGreaterThan(0);
});

test('fetch products error', async () => {
  vi.mocked(api.get).mockRejectedValueOnce(new Error('Network error'));
  await expect(getProducts()).rejects.toThrow('Network error');
});
```

---

## Summary

This ShopReturnGifts platform is a modern, serverless e-commerce system built for scalability and low operational overhead. Key takeaways for development:

1. **Frontend:** React + Vite, Zustand + React Query, Tailwind + shadcn/ui; static export to S3.
2. **Backend:** Go Lambda functions, Chi router, single DynamoDB table.
3. **Config-Driven:** All UI labels and features in `store.config.json` (S3); change without code deploy.
4. **Deployment:** GitHub Actions CI/CD, AWS SAM for infrastructure, CloudFront for global caching.
5. **Development:** Follow patterns (API calls via React Query, state via Zustand, validation via Zod).
6. **Constraints:** Type-safe (TypeScript), validated (Zod), tested (Vitest), secure (no hardcoded secrets).

For detailed requirements, see `/prompts/ECOMMERCE_MASTER_PROMPT_v3.md`.

---

**Document End**
