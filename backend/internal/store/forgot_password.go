package store

import (
	"context"
	"log"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider"
	"github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider/types"

	"shopreturngifts-api/internal/models"
)

const (
	forgotAccountVerified           = "verified"
	forgotAccountNeedsVerification  = "needs_verification"
	forgotAccountUnknown            = "unknown"
)

// needsEmailVerificationFirst is only for UNCONFIRMED signups (signup verification code).
// CONFIRMED users with email_verified=false must use ForgotPassword, not resend signup code.
func needsEmailVerificationFirst(rec cognitoAuthRecord, found bool) bool {
	return found && rec.Status == string(types.UserStatusTypeUnconfirmed)
}

func isConfirmedWithoutEmailFlag(rec cognitoAuthRecord, found bool) bool {
	return found &&
		rec.Status == string(types.UserStatusTypeConfirmed) &&
		!rec.EmailVerified
}

// RequestForgotPassword sends a Cognito password-reset code when the account can receive email.
func (db *DynamoDB) RequestForgotPassword(ctx context.Context, req models.ForgotPasswordRequest) models.ForgotPasswordResponse {
	email := normalizeEmail(req.Email)
	if email == "" {
		return models.ForgotPasswordResponse{
			Message:      "email is required",
			Hint:         "invalid_email",
			Delivered:    false,
			AccountState: forgotAccountUnknown,
		}
	}

	rec, found, lookupErr := db.getCognitoAuthForEmail(ctx, email)
	if lookupErr != nil {
		log.Printf("forgot password: cognito lookup failed for %s: %v", email, lookupErr)
		// Continue — do not block verified users if lookup fails transiently.
	}

	if found && needsEmailVerificationFirst(rec, found) {
		return models.ForgotPasswordResponse{
			Message: "This account is not verified yet. Enter the signup verification code first; " +
				"after that we can email you a password reset code.",
			Hint:         "verify_email_first",
			Delivered:    false,
			AccountState: forgotAccountNeedsVerification,
		}
	}

	out, err := db.CognitoClient.ForgotPassword(ctx, &cognitoidentityprovider.ForgotPasswordInput{
		ClientId: aws.String(db.AppClientID),
		Username: aws.String(email),
	})
	if err != nil {
		log.Printf("forgot password: cognito ForgotPassword failed for %s: %v", email, err)
		resp := mapForgotPasswordError(err)
		if isConfirmedWithoutEmailFlag(rec, found) {
			resp.Hint = "cognito_email_flag"
			resp.Message = "Cognito will not send a reset code until this account's email is marked verified. " +
				"Use Forgot password again after an admin fixes the account (Admin → Users), or complete signup verification if you never did."
			resp.AccountState = forgotAccountVerified
		} else if found && needsEmailVerificationFirst(rec, found) {
			resp.AccountState = forgotAccountNeedsVerification
		} else if found {
			resp.AccountState = forgotAccountUnknown
		}
		return resp
	}

	_ = out // CodeDeliveryDetails present when Cognito accepts the request.

	if found {
		msg := "We sent a password reset code to your email. Check your inbox and spam or junk folder."
		state := forgotAccountVerified
		if isConfirmedWithoutEmailFlag(rec, found) {
			state = forgotAccountVerified
		} else if needsEmailVerificationFirst(rec, found) {
			state = forgotAccountNeedsVerification
		}
		return models.ForgotPasswordResponse{
			Message:      msg,
			Delivered:    true,
			AccountState: state,
		}
	}

	// Cognito may return success without sending mail (unknown email with PreventUserExistenceErrors).
	return models.ForgotPasswordResponse{
		Message: "If an account exists for this email, a reset code was sent — check inbox and spam. " +
			"If you recently signed up, verify your email first, then try again.",
		Hint:         "check_inbox",
		Delivered:    false,
		AccountState: forgotAccountUnknown,
	}
}
