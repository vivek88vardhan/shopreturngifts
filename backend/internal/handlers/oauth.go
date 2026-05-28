package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"

	"shopreturngifts-api/internal/store"
)

// oauthRedirectRequest is the JSON body for /auth/google and /auth/facebook.
type oauthRedirectRequest struct {
	RedirectURL string `json:"redirectUrl"`
}

// oauthRedirectResponse is the JSON response with the Cognito hosted-UI URL.
type oauthRedirectResponse struct {
	URL string `json:"url"`
}

// cognitoDomain returns the Cognito hosted-UI base URL.
func cognitoDomain() string {
	prefix := strings.TrimSpace(os.Getenv("COGNITO_DOMAIN_PREFIX"))
	region := strings.TrimSpace(os.Getenv("AWS_REGION"))
	if prefix == "" || region == "" {
		return ""
	}
	return fmt.Sprintf("https://%s.auth.%s.amazoncognito.com", prefix, region)
}

func (h *Handlers) oauthInitiate(w http.ResponseWriter, r *http.Request, idp string) {
	domain := cognitoDomain()
	if domain == "" {
		writeError(w, http.StatusServiceUnavailable, "social login is not configured")
		return
	}

	var req oauthRedirectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	callbackURL := strings.TrimSpace(req.RedirectURL)
	if callbackURL == "" {
		writeError(w, http.StatusBadRequest, "redirectUrl is required")
		return
	}

	clientID := strings.TrimSpace(os.Getenv("COGNITO_APP_CLIENT_ID"))

	params := url.Values{}
	params.Set("identity_provider", idp)
	params.Set("response_type", "code")
	params.Set("client_id", clientID)
	params.Set("redirect_uri", callbackURL)
	params.Set("scope", "openid email profile")

	authURL := fmt.Sprintf("%s/oauth2/authorize?%s", domain, params.Encode())

	writeJSON(w, http.StatusOK, oauthRedirectResponse{URL: authURL})
}

// GoogleLogin initiates Google OAuth via Cognito hosted UI.
func (h *Handlers) GoogleLogin(w http.ResponseWriter, r *http.Request) {
	h.oauthInitiate(w, r, "Google")
}

// oauthTokenRequest is the JSON body for /auth/oauth/callback.
type oauthTokenRequest struct {
	Code        string `json:"code"`
	RedirectURI string `json:"redirectUri"`
}

// OAuthCallback exchanges a Cognito authorization code for tokens.
func (h *Handlers) OAuthCallback(w http.ResponseWriter, r *http.Request) {
	domain := cognitoDomain()
	if domain == "" {
		writeError(w, http.StatusServiceUnavailable, "social login is not configured")
		return
	}

	var req oauthTokenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if strings.TrimSpace(req.Code) == "" || strings.TrimSpace(req.RedirectURI) == "" {
		writeError(w, http.StatusBadRequest, "code and redirectUri are required")
		return
	}

	clientID := strings.TrimSpace(os.Getenv("COGNITO_APP_CLIENT_ID"))

	// Exchange the authorization code for tokens via Cognito token endpoint.
	tokenURL := fmt.Sprintf("%s/oauth2/token", domain)
	form := url.Values{}
	form.Set("grant_type", "authorization_code")
	form.Set("code", req.Code)
	form.Set("client_id", clientID)
	form.Set("redirect_uri", req.RedirectURI)

	resp, err := http.PostForm(tokenURL, form)
	if err != nil {
		writeError(w, http.StatusBadGateway, "failed to exchange code")
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		writeError(w, http.StatusUnauthorized, "invalid or expired authorization code")
		return
	}

	var tokenResp struct {
		IDToken      string `json:"id_token"`
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    int    `json:"expires_in"`
		TokenType    string `json:"token_type"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to parse token response")
		return
	}

	// Parse the ID token to extract user info and create/update DynamoDB user.
	user, err := h.db.GetOrCreateOAuthUser(r.Context(), tokenResp.IDToken)
	if err != nil {
		if errors.Is(err, store.ErrOAuthEmailUsedWithDifferentIdentity) {
			writeError(w, http.StatusConflict, "This email is already registered with email and password. Sign in with your password, or ask an admin to enable account linking in Cognito if you need Google sign-in for the same email.")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to process user: "+err.Error())
		return
	}
	if !user.IsActive {
		writeError(w, http.StatusForbidden, "this account has been deactivated")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"token": tokenResp.IDToken,
		"user":  user,
	})
}
