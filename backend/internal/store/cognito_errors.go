package store

import (
	"errors"
	"fmt"
	"strings"

	"github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider/types"
	"github.com/aws/smithy-go"

	"shopreturngifts-api/internal/models"
)

// ErrUserNotConfirmed is returned when Cognito requires email verification before sign-in.
var ErrUserNotConfirmed = errors.New("user email is not verified")

// ErrInvalidLogin is returned for wrong password or unknown user (generic client message).
var ErrInvalidLogin = errors.New("invalid login credentials")

// ErrUserAlreadyConfirmed is returned when resend/confirm is called for a verified user.
var ErrUserAlreadyConfirmed = errors.New("user is already confirmed")

func cognitoErrorCode(err error) string {
	if err == nil {
		return ""
	}
	var apiErr smithy.APIError
	if errors.As(err, &apiErr) {
		return apiErr.ErrorCode()
	}
	return ""
}

func mapCognitoAuthError(err error) error {
	if err == nil {
		return nil
	}

	switch cognitoErrorCode(err) {
	case "UserNotConfirmedException":
		return ErrUserNotConfirmed
	case "NotAuthorizedException":
		// Wrong password, or confirm on already-confirmed user (handled elsewhere).
		return ErrInvalidLogin
	case "UserNotFoundException":
		return ErrInvalidLogin
	case "InvalidPasswordException":
		return ErrInvalidLogin
	}

	var unconfirmed *types.UserNotConfirmedException
	if errors.As(err, &unconfirmed) {
		return ErrUserNotConfirmed
	}

	msg := strings.ToLower(err.Error())
	if strings.Contains(msg, "usernotconfirmed") || strings.Contains(msg, "not confirmed") {
		return ErrUserNotConfirmed
	}

	return err
}

func mapCognitoResendError(err error) error {
	if err == nil {
		return nil
	}

	code := cognitoErrorCode(err)
	msg := strings.ToLower(err.Error())

	switch code {
	case "UserNotFoundException":
		return fmt.Errorf("no account found for this email")
	case "InvalidParameterException":
		if strings.Contains(msg, "already confirmed") || strings.Contains(msg, "confirmed user") {
			return ErrUserAlreadyConfirmed
		}
	case "LimitExceededException":
		return fmt.Errorf("too many attempts; please wait a few minutes and try again")
	case "CodeDeliveryFailureException":
		return fmt.Errorf("could not send verification email; try again later")
	}

	if strings.Contains(msg, "already confirmed") {
		return ErrUserAlreadyConfirmed
	}

	return err
}

func mapForgotPasswordError(err error) models.ForgotPasswordResponse {
	if err == nil {
		return models.ForgotPasswordResponse{
			Message:      "We sent a password reset code to your email. Check your inbox and spam or junk folder.",
			Delivered:    true,
			AccountState: forgotAccountVerified,
		}
	}

	code := cognitoErrorCode(err)
	msg := strings.ToLower(err.Error())

	switch code {
	case "UserNotConfirmedException":
		return models.ForgotPasswordResponse{
			Message: "This account is not verified yet. Enter the signup verification code first; " +
				"after that we can email you a password reset code.",
			Hint:         "verify_email_first",
			Delivered:    false,
			AccountState: forgotAccountNeedsVerification,
		}
	case "InvalidParameterException":
		if strings.Contains(msg, "verified") || strings.Contains(msg, "no registered") {
			return models.ForgotPasswordResponse{
				Message: "This account is not verified yet. Enter the signup verification code first; " +
					"after that we can email you a password reset code.",
				Hint:         "verify_email_first",
				Delivered:    false,
				AccountState: forgotAccountNeedsVerification,
			}
		}
	case "LimitExceededException":
		return models.ForgotPasswordResponse{
			Message:      "Too many reset attempts. Please wait a few minutes and try again.",
			Hint:         "rate_limited",
			Delivered:    false,
			AccountState: forgotAccountUnknown,
		}
	case "CodeDeliveryFailureException":
		return models.ForgotPasswordResponse{
			Message:      "We couldn't send the reset email right now. Try again in a few minutes.",
			Hint:         "delivery_failed",
			Delivered:    false,
			AccountState: forgotAccountUnknown,
		}
	}

	if strings.Contains(msg, "not confirmed") || strings.Contains(msg, "usernotconfirmed") {
		return models.ForgotPasswordResponse{
			Message: "This account is not verified yet. Enter the signup verification code first; " +
				"after that we can email you a password reset code.",
			Hint:         "verify_email_first",
			Delivered:    false,
			AccountState: forgotAccountNeedsVerification,
		}
	}

	return models.ForgotPasswordResponse{
		Message: "If an account exists for this email, a reset code may have been sent — check inbox and spam. " +
			"If you recently signed up, verify your email first.",
		Hint:         "check_inbox",
		Delivered:    false,
		AccountState: forgotAccountUnknown,
	}
}
