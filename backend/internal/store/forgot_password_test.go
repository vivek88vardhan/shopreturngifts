package store

import (
	"testing"

	"github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider/types"
)

func TestNeedsEmailVerificationFirst(t *testing.T) {
	if needsEmailVerificationFirst(cognitoAuthRecord{}, false) {
		t.Fatal("unknown user should not require verification first")
	}
	if !needsEmailVerificationFirst(cognitoAuthRecord{Status: string(types.UserStatusTypeUnconfirmed)}, true) {
		t.Fatal("unconfirmed should require verification first")
	}
	if needsEmailVerificationFirst(cognitoAuthRecord{
		Status:        string(types.UserStatusTypeConfirmed),
		EmailVerified: false,
	}, true) {
		t.Fatal("confirmed with email_verified=false should use ForgotPassword, not signup verify")
	}
}

func TestIsConfirmedWithoutEmailFlag(t *testing.T) {
	if !isConfirmedWithoutEmailFlag(cognitoAuthRecord{
		Status:        string(types.UserStatusTypeConfirmed),
		EmailVerified: false,
	}, true) {
		t.Fatal("expected confirmed without email flag")
	}
}
