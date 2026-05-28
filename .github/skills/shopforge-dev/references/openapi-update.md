# OpenAPI Spec Update Guide

The live OpenAPI spec is generated at runtime from `backend/internal/handlers/openapi.go`. It is served at `GET /api/openapi.json` and rendered as Swagger UI at `GET /api/docs`.

**Rule: Every API change must have a matching update in `openapi.go`.**

---

## File Location

```
backend/internal/handlers/openapi.go
```

The `OpenAPISpec` handler builds the entire spec as a Go `map[string]interface{}` and serialises it to JSON. There is no YAML file — the spec lives entirely in code.

---

## How It Is Structured

### Helpers Available Inside the Handler

| Helper | Purpose |
|---|---|
| `withSecurity(op)` | Wraps an `openAPIOperation` → adds JWT security if `RequiresJWT: true`, adds `x-shopreturngifts-role: admin` if `AdminOnly: true` |
| `withBody(op, schema)` | Same as `withSecurity` but also attaches a `requestBody` |
| `strProp` / `numProp` / `intProp` / `boolProp` | Schema shorthand for primitive types |
| `obj(props, required...)` | Builds an object schema |
| `arr(items)` | Builds an array schema |

### `openAPIOperation` Struct

```go
type openAPIOperation struct {
    Summary     string
    Description string
    Tags        []string
    RequiresJWT bool
    AdminOnly   bool
    StatusCode  int              // defaults to 200 if zero
    Parameters  []openAPIParameter
}

type openAPIParameter struct {
    Name        string
    In          string   // "query" | "path" | "header"
    Description string
    Required    bool
    SchemaType  string   // defaults to "string" if empty
}
```

---

## Adding a New Route

### 1. Choose the correct section in `openapi.go`

Operations are grouped by tag inside the `paths` map following the same groups as `router.go`:

| Router group | Tag used |
|---|---|
| `POST /api/auth/*` | `"auth"` |
| `GET /api/products`, etc. | `"products"` |
| `GET /api/categories` | `"categories"` |
| `GET /api/coupons/validate` | `"coupons"` |
| `GET/PUT /api/users/me` | `"users"` |
| `GET/POST /api/orders/*` | `"orders"` |
| `GET /api/admin/dashboard` | `"admin"` |
| `GET/POST/PUT/DELETE /api/admin/products` | `"admin-products"` |
| `GET/POST/PUT/DELETE /api/admin/categories` | `"admin-categories"` |
| `GET/PUT /api/admin/orders` | `"admin-orders"` |
| `GET/PUT/DELETE /api/admin/users` | `"admin-users"` |
| `GET/POST/PUT/DELETE /api/admin/coupons` | `"admin-coupons"` |
| `GET/PUT /api/admin/config` | `"admin-config"` |

### 2. Add the path entry

```go
"/api/your/path": map[string]interface{}{
    "get": withSecurity(openAPIOperation{
        Summary:     "Short action description",
        Description: "Longer explanation of what this does.",
        Tags:        []string{"your-tag"},
        RequiresJWT: true,   // omit or false for public
        AdminOnly:   false,
        StatusCode:  http.StatusOK,
        Parameters: []openAPIParameter{
            {Name: "paramName", In: "query", Description: "what it does", Required: false},
        },
    }),
},
```

For routes with a request body:

```go
"/api/your/path": map[string]interface{}{
    "post": withBody(openAPIOperation{
        Summary:    "Create something",
        Tags:       []string{"your-tag"},
        RequiresJWT: true,
        StatusCode: http.StatusCreated,
    }, obj(map[string]interface{}{
        "name":   strProp,
        "amount": numProp,
    }, "name")),  // "name" is required
},
```

For path parameters (e.g., `{productId}`), add them to `Parameters` with `In: "path"`:

```go
Parameters: []openAPIParameter{
    {Name: "productId", In: "path", Description: "Product identifier", Required: true},
},
```

### 3. Verify

- Open the in-memory spec by running the backend locally and hitting `/api/openapi.json`.
- Alternatively, search the `paths` map in `openapi.go` and confirm the new route entry exists.
- Ensure the HTTP method key (`"get"`, `"post"`, `"put"`, `"delete"`) matches the chi route registration.

---

## Modifying an Existing Route

1. Locate the path entry by searching for the URL string in `openapi.go`.
2. Update the relevant fields (`Summary`, `Parameters`, `StatusCode`, request body schema).
3. If the response shape changed significantly, update the `Description` to reflect the new fields.

---

## Removing a Route

Delete the entire path key (e.g., `"/api/old/path": ...`) from the `paths` map. If the tag is only used by this route, also remove the tag from the `tags` slice near the top of the spec.

---

## Common Mistakes

| Mistake | Fix |
|---|---|
| Route in router.go but not in openapi.go | Add the operation entry |
| `RequiresJWT: true` missing on authed route | Set it so the Swagger UI shows the lock icon |
| Path param in URL but not in `Parameters` | Add `{In: "path", Required: true}` |
| POST route using `withSecurity` instead of `withBody` | Switch to `withBody` and provide the request schema |
| `StatusCode` left at zero for a 201 route | Set `StatusCode: http.StatusCreated` |
