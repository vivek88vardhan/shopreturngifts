package store

import (
	"context"
	"fmt"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider"
	"github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider/types"

	"shopreturngifts-api/internal/models"
)

type cognitoAuthRecord struct {
	EmailVerified bool
	Status        string
	AuthProvider  string // "password" or "google"
}

// listCognitoAuthByEmail loads Cognito users in the pool keyed by normalized email.
func (db *DynamoDB) listCognitoAuthByEmail(ctx context.Context) (map[string]cognitoAuthRecord, error) {
	out := make(map[string]cognitoAuthRecord)
	if strings.TrimSpace(db.UserPoolID) == "" {
		return out, nil
	}

	var paginationToken *string
	for {
		resp, err := db.CognitoClient.ListUsers(ctx, &cognitoidentityprovider.ListUsersInput{
			UserPoolId:      aws.String(db.UserPoolID),
			PaginationToken: paginationToken,
			Limit:           aws.Int32(60),
		})
		if err != nil {
			return nil, err
		}

		for _, u := range resp.Users {
			rec := cognitoRecordFromUser(aws.ToString(u.Username), string(u.UserStatus), u.Attributes)
			email := ""
			for _, attr := range u.Attributes {
				if aws.ToString(attr.Name) == "email" {
					email = normalizeEmail(aws.ToString(attr.Value))
				}
			}
			if email != "" {
				out[email] = rec
			}
		}

		if resp.PaginationToken == nil || strings.TrimSpace(aws.ToString(resp.PaginationToken)) == "" {
			break
		}
		paginationToken = resp.PaginationToken
	}

	return out, nil
}

func applyCognitoAuthToUser(u *models.User, rec cognitoAuthRecord, found bool) {
	if !found {
		u.EmailVerified = nil
		u.CognitoEmailVerified = nil
		u.CognitoStatus = ""
		u.AuthProvider = ""
		return
	}
	attrVerified := rec.EmailVerified
	u.CognitoEmailVerified = &attrVerified
	u.AuthProvider = rec.AuthProvider
	if rec.AuthProvider == "google" {
		// Google users are verified by the IdP; password signup/reset flows do not apply.
		verified := rec.Status == string(types.UserStatusTypeConfirmed) ||
			rec.Status == string(types.UserStatusTypeExternalProvider)
		u.EmailVerified = &verified
		u.CognitoStatus = rec.Status
		return
	}
	verified := attrVerified && rec.Status == string(types.UserStatusTypeConfirmed)
	u.EmailVerified = &verified
	u.CognitoStatus = rec.Status
}

// EnrichUsersWithCognitoAuth sets emailVerified and cognitoStatus from the user pool.
func (db *DynamoDB) EnrichUsersWithCognitoAuth(ctx context.Context, users []models.User) error {
	byEmail, err := db.listCognitoAuthByEmail(ctx)
	if err != nil {
		return err
	}
	for i := range users {
		rec, found := byEmail[normalizeEmail(users[i].Email)]
		applyCognitoAuthToUser(&users[i], rec, found)
	}
	return nil
}

// EnrichUserWithCognitoAuth sets Cognito fields on a single user (uses ListUsers cache per call).
func (db *DynamoDB) EnrichUserWithCognitoAuth(ctx context.Context, user *models.User) error {
	if user == nil {
		return nil
	}
	rec, found, err := db.getCognitoAuthForEmail(ctx, user.Email)
	if err != nil {
		return err
	}
	applyCognitoAuthToUser(user, rec, found)
	return nil
}

func cognitoAuthProvider(username string, attrs []types.AttributeType) string {
	if strings.HasPrefix(strings.ToLower(strings.TrimSpace(username)), "google_") {
		return "google"
	}
	for _, attr := range attrs {
		if aws.ToString(attr.Name) != "identities" {
			continue
		}
		val := strings.ToLower(aws.ToString(attr.Value))
		if strings.Contains(val, "google") {
			return "google"
		}
	}
	return "password"
}

func cognitoRecordFromUser(username, status string, attrs []types.AttributeType) cognitoAuthRecord {
	rec := cognitoAuthRecord{
		Status:       status,
		AuthProvider: cognitoAuthProvider(username, attrs),
	}
	for _, attr := range attrs {
		switch aws.ToString(attr.Name) {
		case "email_verified":
			rec.EmailVerified = strings.EqualFold(aws.ToString(attr.Value), "true")
		}
	}
	return rec
}

// getCognitoAuthForEmail looks up one user in the pool by email (username).
func (db *DynamoDB) getCognitoAuthForEmail(ctx context.Context, email string) (cognitoAuthRecord, bool, error) {
	email = normalizeEmail(email)
	if email == "" || strings.TrimSpace(db.UserPoolID) == "" {
		return cognitoAuthRecord{}, false, nil
	}

	out, err := db.CognitoClient.AdminGetUser(ctx, &cognitoidentityprovider.AdminGetUserInput{
		UserPoolId: aws.String(db.UserPoolID),
		Username:   aws.String(email),
	})
	if err != nil {
		if cognitoErrorCode(err) == "UserNotFoundException" {
			return cognitoAuthRecord{}, false, nil
		}
		return cognitoAuthRecord{}, false, err
	}

	rec := cognitoRecordFromUser(aws.ToString(out.Username), string(out.UserStatus), out.UserAttributes)
	return rec, true, nil
}

// AdminRepairCognitoAuth confirms UNCONFIRMED signups and sets email_verified=true so users can sign in
// or receive password-reset email. Signup/resend-code flows do not apply once Cognito leaves UNCONFIRMED.
func (db *DynamoDB) AdminRepairCognitoAuth(ctx context.Context, email string) (string, error) {
	email = normalizeEmail(email)
	if email == "" || strings.TrimSpace(db.UserPoolID) == "" {
		return "", fmt.Errorf("email and user pool are required")
	}

	rec, found, err := db.getCognitoAuthForEmail(ctx, email)
	if err != nil {
		return "", err
	}
	if !found {
		return "", fmt.Errorf("no Cognito user for this email")
	}

	var steps []string
	if rec.Status == string(types.UserStatusTypeUnconfirmed) {
		_, err := db.CognitoClient.AdminConfirmSignUp(ctx, &cognitoidentityprovider.AdminConfirmSignUpInput{
			UserPoolId: aws.String(db.UserPoolID),
			Username:   aws.String(email),
		})
		if err != nil {
			return "", fmt.Errorf("confirm signup: %w", err)
		}
		steps = append(steps, "signup confirmed without code")
	}

	if !rec.EmailVerified {
		if err := db.AdminSetCognitoEmailVerified(ctx, email); err != nil {
			return "", err
		}
		steps = append(steps, "email marked verified")
	}

	if len(steps) == 0 {
		return "Cognito account already verified.", nil
	}
	return "Cognito account repaired (" + strings.Join(steps, ", ") +
		"). User can sign in with their password or use Forgot password to set a new one.", nil
}

// AdminSetCognitoEmailVerified sets email_verified=true for a Cognito user (fixes CONFIRMED accounts stuck without reset email).
func (db *DynamoDB) AdminSetCognitoEmailVerified(ctx context.Context, email string) error {
	email = normalizeEmail(email)
	if email == "" || strings.TrimSpace(db.UserPoolID) == "" {
		return fmt.Errorf("email and user pool are required")
	}
	_, err := db.CognitoClient.AdminUpdateUserAttributes(ctx, &cognitoidentityprovider.AdminUpdateUserAttributesInput{
		UserPoolId: aws.String(db.UserPoolID),
		Username:   aws.String(email),
		UserAttributes: []types.AttributeType{
			{Name: aws.String("email_verified"), Value: aws.String("true")},
		},
	})
	if err != nil {
		return fmt.Errorf("update cognito email_verified: %w", err)
	}
	return nil
}
