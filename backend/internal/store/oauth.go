package store

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"shopreturngifts-api/internal/models"
)

// ErrOAuthEmailUsedWithDifferentIdentity is returned when the Google (or
// other federated) Cognito identity does not match the Dynamo user row for
// the same email — for example the email was registered with password first.
// API callers should map this to HTTP 409 with guidance for the customer.
var ErrOAuthEmailUsedWithDifferentIdentity = errors.New("oauth: email already registered with a different sign-in method")

// GetOrCreateOAuthUser parses a Cognito ID token (from OAuth code exchange),
// extracts user claims, and ensures a DynamoDB user record exists.
func (db *DynamoDB) GetOrCreateOAuthUser(ctx context.Context, idToken string) (*models.User, error) {
	// Decode the JWT payload (middle segment) without full verification —
	// the token was just returned by Cognito's token endpoint over HTTPS.
	parts := strings.Split(idToken, ".")
	if len(parts) != 3 {
		return nil, fmt.Errorf("invalid id token format")
	}

	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("failed to decode token payload: %w", err)
	}

	var claims struct {
		Sub   string `json:"sub"`
		Email string `json:"email"`
		Name  string `json:"name"`
	}
	if err := json.Unmarshal(payload, &claims); err != nil {
		return nil, fmt.Errorf("failed to parse token claims: %w", err)
	}

	if claims.Sub == "" || claims.Email == "" {
		return nil, fmt.Errorf("token missing sub or email claim")
	}

	email := strings.ToLower(strings.TrimSpace(claims.Email))

	// The ID token's `sub` is what API auth middleware uses for every request.
	// Always resolve the profile row by that Cognito identity first — never
	// return a different user's row found only by email (breaks Google sign-in
	// after email/password signup for the same address).
	if u, err := db.GetUser(ctx, claims.Sub); err == nil {
		return u, nil
	}

	existingByEmail, err := db.GetUserByEmail(ctx, email)
	if err == nil && existingByEmail != nil {
		if existingByEmail.UserID == claims.Sub {
			return existingByEmail, nil
		}
		return nil, ErrOAuthEmailUsedWithDifferentIdentity
	}

	// Create new user record.
	name := strings.TrimSpace(claims.Name)
	if name == "" {
		name = email
	}

	user := &models.User{
		UserID:    claims.Sub,
		Email:     email,
		Name:      name,
		Role:      "customer",
		IsActive:  true,
		CreatedAt: now(),
		UpdatedAt: now(),
	}
	if err := db.PutUser(ctx, user); err != nil {
		return nil, fmt.Errorf("failed to create oauth user: %w", err)
	}

	return user, nil
}
