package store

import (
	"testing"

	"shopreturngifts-api/internal/models"
)

func TestApplyCognitoAuthToUser(t *testing.T) {
	t.Run("not found", func(t *testing.T) {
		u := &models.User{Email: "a@b.com"}
		applyCognitoAuthToUser(u, cognitoAuthRecord{}, false)
		if u.EmailVerified != nil || u.CognitoEmailVerified != nil {
			t.Fatalf("expected nil verification fields, got EmailVerified=%v CognitoEmailVerified=%v", u.EmailVerified, u.CognitoEmailVerified)
		}
	})

	t.Run("unconfirmed signup", func(t *testing.T) {
		u := &models.User{Email: "a@b.com"}
		applyCognitoAuthToUser(u, cognitoAuthRecord{EmailVerified: false, Status: "UNCONFIRMED"}, true)
		if u.EmailVerified == nil || *u.EmailVerified {
			t.Fatalf("expected false verified, got %v", u.EmailVerified)
		}
	})

	t.Run("confirmed verified", func(t *testing.T) {
		u := &models.User{Email: "a@b.com"}
		applyCognitoAuthToUser(u, cognitoAuthRecord{EmailVerified: true, Status: "CONFIRMED", AuthProvider: "password"}, true)
		if u.EmailVerified == nil || !*u.EmailVerified {
			t.Fatalf("expected true verified, got %v", u.EmailVerified)
		}
	})

	t.Run("google federated", func(t *testing.T) {
		u := &models.User{Email: "user@gmail.com"}
		applyCognitoAuthToUser(u, cognitoAuthRecord{
			EmailVerified: true,
			Status:        "EXTERNAL_PROVIDER",
			AuthProvider:  "google",
		}, true)
		if u.AuthProvider != "google" {
			t.Fatalf("expected google provider, got %q", u.AuthProvider)
		}
		if u.EmailVerified == nil || !*u.EmailVerified {
			t.Fatalf("expected google user treated as verified, got %v", u.EmailVerified)
		}
	})
}

func TestCognitoAuthProvider(t *testing.T) {
	if got := cognitoAuthProvider("Google_123", nil); got != "google" {
		t.Fatalf("expected google, got %q", got)
	}
	if got := cognitoAuthProvider("user@example.com", nil); got != "password" {
		t.Fatalf("expected password, got %q", got)
	}
}
