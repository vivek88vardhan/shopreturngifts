package store

import (
	"errors"
	"testing"

	"github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider/types"
	"github.com/aws/smithy-go"
)

type fakeAPIError struct {
	code    string
	message string
}

func (e *fakeAPIError) Error() string   { return e.message }
func (e *fakeAPIError) ErrorCode() string { return e.code }
func (e *fakeAPIError) ErrorMessage() string { return e.message }
func (e *fakeAPIError) ErrorFault() smithy.ErrorFault { return smithy.FaultUnknown }

func TestMapCognitoAuthError_UserNotConfirmed(t *testing.T) {
	err := mapCognitoAuthError(&fakeAPIError{code: "UserNotConfirmedException", message: "not confirmed"})
	if !errors.Is(err, ErrUserNotConfirmed) {
		t.Fatalf("got %v, want ErrUserNotConfirmed", err)
	}
}

func TestMapCognitoAuthError_InvalidLogin(t *testing.T) {
	err := mapCognitoAuthError(&fakeAPIError{code: "NotAuthorizedException", message: "incorrect"})
	if !errors.Is(err, ErrInvalidLogin) {
		t.Fatalf("got %v, want ErrInvalidLogin", err)
	}
}

func TestMapCognitoAuthError_TypedException(t *testing.T) {
	err := mapCognitoAuthError(&types.UserNotConfirmedException{
		Message: strPtr("User is not confirmed."),
	})
	if !errors.Is(err, ErrUserNotConfirmed) {
		t.Fatalf("got %v, want ErrUserNotConfirmed", err)
	}
}

func strPtr(s string) *string { return &s }
