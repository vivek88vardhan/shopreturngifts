package middleware

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type contextKey string

const (
	UserIDKey  contextKey = "userId"
	IsAdminKey contextKey = "isAdmin"
)

// Auth middleware validates Cognito JWT tokens.
type Auth struct {
	userPoolID  string
	region      string
	appClientID string
	issuer      string
	jwksURL     string
	keys        map[string]*rsa.PublicKey
	mu          sync.RWMutex
	httpClient  *http.Client
}

func NewAuth(userPoolID, region, appClientID string) *Auth {
	return &Auth{
		userPoolID:  userPoolID,
		region:      region,
		appClientID: appClientID,
		issuer:      fmt.Sprintf("https://cognito-idp.%s.amazonaws.com/%s", region, userPoolID),
		jwksURL:     fmt.Sprintf("https://cognito-idp.%s.amazonaws.com/%s/.well-known/jwks.json", region, userPoolID),
		keys:        make(map[string]*rsa.PublicKey),
		httpClient:  &http.Client{Timeout: 10 * time.Second},
	}
}

// Middleware returns an HTTP middleware that validates the JWT and populates
// the user ID and admin flag into the request context.
func (a *Auth) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")

		token, err := jwt.Parse(tokenStr, func(token *jwt.Token) (interface{}, error) {
			kid, ok := token.Header["kid"].(string)
			if !ok {
				return nil, fmt.Errorf("missing kid in token header")
			}
			return a.getKey(kid)
		}, jwt.WithValidMethods([]string{"RS256"}))

		if err != nil || !token.Valid {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		// Validate issuer claim.
		if !a.validateIssuer(claims) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		// Validate token_use — only accept id tokens, not access tokens.
		if tokenUse, _ := claims["token_use"].(string); tokenUse != "id" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		// Validate audience — must match this app's Cognito client ID.
		if a.appClientID != "" && !a.validateAudience(claims) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		// Extract user ID (sub claim).
		sub, ok := claims["sub"].(string)
		if !ok || sub == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		// Resolve admin status from Cognito groups claim.
		isAdmin := a.claimHasGroup(claims, "admin")

		ctx := r.Context()
		ctx = context.WithValue(ctx, UserIDKey, sub)
		ctx = context.WithValue(ctx, IsAdminKey, isAdmin)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// AdminMiddleware enforces that the caller belongs to the Cognito "admin" group.
// Must be chained after Middleware.
func (a *Auth) AdminMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		isAdmin, _ := r.Context().Value(IsAdminKey).(bool)
		if !isAdmin {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// validateIssuer checks the iss claim against the expected Cognito pool URL.
func (a *Auth) validateIssuer(claims jwt.MapClaims) bool {
	iss, _ := claims["iss"].(string)
	if iss == "" {
		return false
	}
	// Normalise trailing slashes before comparing.
	return strings.TrimRight(iss, "/") == strings.TrimRight(a.issuer, "/")
}

// validateAudience checks that the aud claim contains the configured client ID.
func (a *Auth) validateAudience(claims jwt.MapClaims) bool {
	switch v := claims["aud"].(type) {
	case string:
		return v == a.appClientID
	case []interface{}:
		for _, entry := range v {
			if s, ok := entry.(string); ok && s == a.appClientID {
				return true
			}
		}
	}
	return false
}

// claimHasGroup checks whether a Cognito groups claim includes groupName.
func (a *Auth) claimHasGroup(claims jwt.MapClaims, groupName string) bool {
	groups, ok := claims["cognito:groups"].([]interface{})
	if !ok {
		return false
	}
	for _, g := range groups {
		if s, ok := g.(string); ok && s == groupName {
			return true
		}
	}
	return false
}

func (a *Auth) getKey(kid string) (*rsa.PublicKey, error) {
	a.mu.RLock()
	key, ok := a.keys[kid]
	a.mu.RUnlock()
	if ok {
		return key, nil
	}

	// Fetch JWKS
	if err := a.fetchJWKS(); err != nil {
		return nil, err
	}

	a.mu.RLock()
	defer a.mu.RUnlock()
	key, ok = a.keys[kid]
	if !ok {
		return nil, fmt.Errorf("key %s not found in JWKS", kid)
	}
	return key, nil
}

type jwksResponse struct {
	Keys []jwkKey `json:"keys"`
}

type jwkKey struct {
	Kid string `json:"kid"`
	N   string `json:"n"`
	E   string `json:"e"`
}

func (a *Auth) fetchJWKS() error {
	// Validate the JWKS URL is HTTPS before fetching.
	if parsed, err := url.Parse(a.jwksURL); err != nil || parsed.Scheme != "https" {
		return fmt.Errorf("invalid JWKS URL scheme")
	}

	resp, err := a.httpClient.Get(a.jwksURL)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("JWKS endpoint returned status %d", resp.StatusCode)
	}

	var jwks jwksResponse
	if err := json.NewDecoder(resp.Body).Decode(&jwks); err != nil {
		return err
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	for _, k := range jwks.Keys {
		nBytes, err := base64.RawURLEncoding.DecodeString(k.N)
		if err != nil {
			continue
		}
		eBytes, err := base64.RawURLEncoding.DecodeString(k.E)
		if err != nil {
			continue
		}
		e := new(big.Int).SetBytes(eBytes).Int64()

		a.keys[k.Kid] = &rsa.PublicKey{
			N: new(big.Int).SetBytes(nBytes),
			E: int(e),
		}
	}
	return nil
}

// GetUserID extracts the user ID from the request context.
func GetUserID(r *http.Request) string {
	v, _ := r.Context().Value(UserIDKey).(string)
	return v
}

// IsAdmin returns true if the request context marks the caller as an admin.
func IsAdmin(r *http.Request) bool {
	v, _ := r.Context().Value(IsAdminKey).(bool)
	return v
}
