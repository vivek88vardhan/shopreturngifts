package store

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider"
	"github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider/types"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	dyntypes "github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/google/uuid"

	"shopreturngifts-api/internal/models"
)

// ErrSignupEmailAlreadyInUse is returned when email/password signup is attempted
// for an email that already has a profile in DynamoDB (e.g. created via Google).
var ErrSignupEmailAlreadyInUse = errors.New("signup: email already registered")

// DynamoDB is the data store backed by DynamoDB single-table design.
type DynamoDB struct {
	Client        *dynamodb.Client
	TableName     string
	S3Client      *s3.Client
	S3Bucket      string
	CognitoClient *cognitoidentityprovider.Client
	UserPoolID    string
	AppClientID   string
}

func now() string {
	return time.Now().UTC().Format(time.RFC3339)
}

// ─── Auth ───

func (db *DynamoDB) Login(ctx context.Context, req models.LoginRequest) (*models.AuthResponse, error) {
	email := normalizeEmail(req.Email)
	loginIdentifier := strings.TrimSpace(req.Email)
	if loginIdentifier == "" {
		loginIdentifier = email
	}

	out, err := db.CognitoClient.InitiateAuth(ctx, &cognitoidentityprovider.InitiateAuthInput{
		AuthFlow: types.AuthFlowTypeUserPasswordAuth,
		ClientId: aws.String(db.AppClientID),
		AuthParameters: map[string]string{
			"USERNAME": loginIdentifier,
			"PASSWORD": req.Password,
		},
	})
	if err != nil {
		if mapped := mapCognitoAuthError(err); errors.Is(mapped, ErrUserNotConfirmed) || errors.Is(mapped, ErrInvalidLogin) {
			return nil, mapped
		}
		return nil, fmt.Errorf("authentication failed: %w", err)
	}

	token := aws.ToString(out.AuthenticationResult.IdToken)

	user, err := db.GetUserByEmail(ctx, email)
	if err != nil {
		return nil, err
	}
	if !user.IsActive {
		return nil, fmt.Errorf("account is disabled")
	}

	return &models.AuthResponse{User: user, Token: token}, nil
}

func (db *DynamoDB) Signup(ctx context.Context, req models.SignupRequest) (*models.SignupResponse, error) {
	email := normalizeEmail(req.Email)
	if email == "" {
		return nil, fmt.Errorf("signup failed: invalid email")
	}
	if existing, err := db.GetUserByEmail(ctx, email); err == nil && existing != nil {
		return nil, ErrSignupEmailAlreadyInUse
	}

	out, err := db.CognitoClient.SignUp(ctx, &cognitoidentityprovider.SignUpInput{
		ClientId: aws.String(db.AppClientID),
		Username: aws.String(email),
		Password: aws.String(req.Password),
		UserAttributes: []types.AttributeType{
			{Name: aws.String("email"), Value: aws.String(email)},
			{Name: aws.String("name"), Value: aws.String(strings.TrimSpace(req.Name))},
		},
	})
	if err != nil {
		return nil, fmt.Errorf("signup failed: %w", err)
	}

	userID := aws.ToString(out.UserSub)
	if userID == "" {
		userID = uuid.New().String()
	}

	// Create user record in DynamoDB
	user := &models.User{
		UserID:    userID,
		Email:     email,
		Name:      strings.TrimSpace(req.Name),
		Role:      "customer",
		IsActive:  true,
		CreatedAt: now(),
		UpdatedAt: now(),
	}
	if err := db.PutUser(ctx, user); err != nil {
		return nil, err
	}

	return &models.SignupResponse{
		User:              user,
		NeedsVerification: true,
		Message:           "Please check your email for a verification code.",
	}, nil
}

func (db *DynamoDB) ConfirmSignup(ctx context.Context, req models.ConfirmSignupRequest) (*models.AuthResponse, error) {
	email := normalizeEmail(req.Email)
	_, err := db.CognitoClient.ConfirmSignUp(ctx, &cognitoidentityprovider.ConfirmSignUpInput{
		ClientId:         aws.String(db.AppClientID),
		Username:         aws.String(email),
		ConfirmationCode: aws.String(strings.TrimSpace(req.Code)),
	})
	if err != nil && !isAlreadyConfirmedError(err) {
		return nil, fmt.Errorf("verification failed: %w", err)
	}

	user, err := db.GetUserByEmail(ctx, email)
	if err != nil {
		return nil, err
	}

	return &models.AuthResponse{User: user}, nil
}

func (db *DynamoDB) ResendVerificationCode(ctx context.Context, req models.ResendCodeRequest) error {
	_, err := db.CognitoClient.ResendConfirmationCode(ctx, &cognitoidentityprovider.ResendConfirmationCodeInput{
		ClientId: aws.String(db.AppClientID),
		Username: aws.String(normalizeEmail(req.Email)),
	})
	if err != nil {
		return mapCognitoResendError(err)
	}
	return nil
}

func (db *DynamoDB) ConfirmForgotPassword(ctx context.Context, req models.ConfirmForgotPasswordRequest) error {
	_, err := db.CognitoClient.ConfirmForgotPassword(ctx, &cognitoidentityprovider.ConfirmForgotPasswordInput{
		ClientId:         aws.String(db.AppClientID),
		Username:         aws.String(normalizeEmail(req.Email)),
		ConfirmationCode: aws.String(strings.TrimSpace(req.Code)),
		Password:         aws.String(req.NewPassword),
	})
	if err != nil {
		return fmt.Errorf("password reset failed: %w", err)
	}
	return nil
}

// ChangePassword updates the Cognito password for an email/password user.
func (db *DynamoDB) ChangePassword(ctx context.Context, email, oldPassword, newPassword string) error {
	email = normalizeEmail(email)
	authOut, err := db.CognitoClient.InitiateAuth(ctx, &cognitoidentityprovider.InitiateAuthInput{
		AuthFlow: types.AuthFlowTypeUserPasswordAuth,
		ClientId: aws.String(db.AppClientID),
		AuthParameters: map[string]string{
			"USERNAME": email,
			"PASSWORD": oldPassword,
		},
	})
	if err != nil {
		return fmt.Errorf("current password is incorrect or account uses social sign-in only")
	}
	access := aws.ToString(authOut.AuthenticationResult.AccessToken)
	if access == "" {
		return fmt.Errorf("unable to verify current password")
	}
	_, err = db.CognitoClient.ChangePassword(ctx, &cognitoidentityprovider.ChangePasswordInput{
		AccessToken:      aws.String(access),
		PreviousPassword: aws.String(oldPassword),
		ProposedPassword: aws.String(newPassword),
	})
	if err != nil {
		return fmt.Errorf("password change failed: %w", err)
	}
	return nil
}

// ─── Products ───

// stripProductPrefix removes the "PRODUCT#" prefix from a product ID if present.
func stripProductPrefix(id string) string {
	return strings.TrimPrefix(id, "PRODUCT#")
}

// filterValidImages removes blob: URLs from image lists
func filterValidImages(images []string) []string {
	if len(images) == 0 {
		return images
	}
	valid := make([]string, 0, len(images))
	for _, img := range images {
		if !strings.HasPrefix(img, "blob:") {
			valid = append(valid, img)
		}
	}
	return valid
}

func (db *DynamoDB) GetProducts(ctx context.Context, category, search string, limit int) (*models.Paginated[models.Product], error) {
	input := &dynamodb.QueryInput{
		TableName:              aws.String(db.TableName),
		KeyConditionExpression: aws.String("GSI1PK = :sk"),
		ExpressionAttributeValues: map[string]dyntypes.AttributeValue{
			":sk": &dyntypes.AttributeValueMemberS{Value: "PRODUCT"},
		},
		IndexName: aws.String("GSI1"),
	}
	if limit > 0 {
		input.Limit = aws.Int32(int32(limit))
	}

	out, err := db.Client.Query(ctx, input)
	if err != nil {
		return nil, err
	}

	var products []models.Product
	if err := attributevalue.UnmarshalListOfMaps(out.Items, &products); err != nil {
		return nil, err
	}

	// Strip PRODUCT# prefix from IDs and filter out blob URLs from images
	for i := range products {
		products[i].ProductID = stripProductPrefix(products[i].ProductID)
		products[i].Images = filterValidImages(products[i].Images)
	}

	// Client-side filtering for simplicity
	filtered := make([]models.Product, 0, len(products))
	for _, p := range products {
		if category != "" && p.Category != category {
			continue
		}
		if search != "" {
			if !contains(p.Name, search) && !contains(p.Description, search) {
				continue
			}
		}
		filtered = append(filtered, p)
	}

	return &models.Paginated[models.Product]{Items: filtered, Count: len(filtered)}, nil
}

func (db *DynamoDB) GetProduct(ctx context.Context, productID string) (*models.Product, error) {
	cleanID := stripProductPrefix(productID)
	out, err := db.Client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(db.TableName),
		Key: map[string]dyntypes.AttributeValue{
			"PK": &dyntypes.AttributeValueMemberS{Value: "PRODUCT#" + cleanID},
			"SK": &dyntypes.AttributeValueMemberS{Value: "PRODUCT#" + cleanID},
		},
	})
	if err != nil {
		return nil, err
	}
	if out.Item == nil {
		return nil, fmt.Errorf("product not found")
	}

	var product models.Product
	if err := attributevalue.UnmarshalMap(out.Item, &product); err != nil {
		return nil, err
	}
	product.ProductID = stripProductPrefix(product.ProductID)
	product.Images = filterValidImages(product.Images)
	return &product, nil
}

func (db *DynamoDB) PutProduct(ctx context.Context, p *models.Product) error {
	p.ProductID = stripProductPrefix(p.ProductID)
	p.Images = filterValidImages(p.Images)
	item, err := attributevalue.MarshalMap(p)
	if err != nil {
		return err
	}
	item["PK"] = &dyntypes.AttributeValueMemberS{Value: "PRODUCT#" + p.ProductID}
	item["SK"] = &dyntypes.AttributeValueMemberS{Value: "PRODUCT#" + p.ProductID}
	item["GSI1PK"] = &dyntypes.AttributeValueMemberS{Value: "PRODUCT"}
	item["GSI1SK"] = &dyntypes.AttributeValueMemberS{Value: p.CreatedAt}

	_, err = db.Client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(db.TableName),
		Item:      item,
	})
	return err
}

func (db *DynamoDB) DeleteProduct(ctx context.Context, productID string) error {
	cleanID := stripProductPrefix(productID)
	_, err := db.Client.DeleteItem(ctx, &dynamodb.DeleteItemInput{
		TableName: aws.String(db.TableName),
		Key: map[string]dyntypes.AttributeValue{
			"PK": &dyntypes.AttributeValueMemberS{Value: "PRODUCT#" + cleanID},
			"SK": &dyntypes.AttributeValueMemberS{Value: "PRODUCT#" + cleanID},
		},
	})
	return err
}

// ─── Categories ───

func (db *DynamoDB) GetCategories(ctx context.Context) ([]models.Category, error) {
	out, err := db.Client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(db.TableName),
		KeyConditionExpression: aws.String("GSI1PK = :sk"),
		ExpressionAttributeValues: map[string]dyntypes.AttributeValue{
			":sk": &dyntypes.AttributeValueMemberS{Value: "CATEGORY"},
		},
		IndexName: aws.String("GSI1"),
	})
	if err != nil {
		return nil, err
	}

	var categories []models.Category
	if err := attributevalue.UnmarshalListOfMaps(out.Items, &categories); err != nil {
		return nil, err
	}
	for i := range categories {
		categories[i].CategoryID = strings.TrimPrefix(categories[i].CategoryID, "CATEGORY#")
	}
	return categories, nil
}

func (db *DynamoDB) GetCategory(ctx context.Context, categoryID string) (*models.Category, error) {
	out, err := db.Client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(db.TableName),
		Key: map[string]dyntypes.AttributeValue{
			"PK": &dyntypes.AttributeValueMemberS{Value: "CATEGORY#" + categoryID},
			"SK": &dyntypes.AttributeValueMemberS{Value: "CATEGORY#" + categoryID},
		},
	})
	if err != nil {
		return nil, err
	}
	if out.Item == nil {
		return nil, fmt.Errorf("category not found")
	}
	var c models.Category
	if err := attributevalue.UnmarshalMap(out.Item, &c); err != nil {
		return nil, err
	}
	c.CategoryID = strings.TrimPrefix(c.CategoryID, "CATEGORY#")
	return &c, nil
}

func (db *DynamoDB) PutCategory(ctx context.Context, c *models.Category) error {
	item, err := attributevalue.MarshalMap(c)
	if err != nil {
		return err
	}
	item["PK"] = &dyntypes.AttributeValueMemberS{Value: "CATEGORY#" + c.CategoryID}
	item["SK"] = &dyntypes.AttributeValueMemberS{Value: "CATEGORY#" + c.CategoryID}
	item["GSI1PK"] = &dyntypes.AttributeValueMemberS{Value: "CATEGORY"}
	item["GSI1SK"] = &dyntypes.AttributeValueMemberS{Value: fmt.Sprintf("%04d", c.SortOrder)}

	_, err = db.Client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(db.TableName),
		Item:      item,
	})
	return err
}

// ─── Audit Logs ───

func (db *DynamoDB) PutAuditLog(ctx context.Context, a *models.AuditLog) error {
	item, err := attributevalue.MarshalMap(a)
	if err != nil {
		return err
	}
	item["PK"] = &dyntypes.AttributeValueMemberS{Value: "AUDIT#" + a.AuditID}
	item["SK"] = &dyntypes.AttributeValueMemberS{Value: "AUDIT#" + a.AuditID}
	item["GSI1PK"] = &dyntypes.AttributeValueMemberS{Value: "AUDIT"}
	item["GSI1SK"] = &dyntypes.AttributeValueMemberS{Value: a.CreatedAt}

	_, err = db.Client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(db.TableName),
		Item:      item,
	})
	return err
}

func (db *DynamoDB) GetAuditLogs(ctx context.Context) ([]models.AuditLog, error) {
	out, err := db.Client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(db.TableName),
		KeyConditionExpression: aws.String("GSI1PK = :pk"),
		ExpressionAttributeValues: map[string]dyntypes.AttributeValue{
			":pk": &dyntypes.AttributeValueMemberS{Value: "AUDIT"},
		},
		IndexName:        aws.String("GSI1"),
		ScanIndexForward: aws.Bool(false),
		Limit:            aws.Int32(200),
	})
	if err != nil {
		return nil, err
	}
	var logs []models.AuditLog
	if err := attributevalue.UnmarshalListOfMaps(out.Items, &logs); err != nil {
		return nil, err
	}
	for i := range logs {
		logs[i].AuditID = strings.TrimPrefix(logs[i].AuditID, "AUDIT#")
	}
	return logs, nil
}

func (db *DynamoDB) DeleteCategory(ctx context.Context, categoryID string) error {
	_, err := db.Client.DeleteItem(ctx, &dynamodb.DeleteItemInput{
		TableName: aws.String(db.TableName),
		Key: map[string]dyntypes.AttributeValue{
			"PK": &dyntypes.AttributeValueMemberS{Value: "CATEGORY#" + categoryID},
			"SK": &dyntypes.AttributeValueMemberS{Value: "CATEGORY#" + categoryID},
		},
	})
	return err
}

// ─── Users ───

func (db *DynamoDB) GetUser(ctx context.Context, userID string) (*models.User, error) {
	normalizedUserID := trimEntityPrefix(userID, "USER#")

	out, err := db.Client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(db.TableName),
		Key: map[string]dyntypes.AttributeValue{
			"PK": &dyntypes.AttributeValueMemberS{Value: "USER#" + normalizedUserID},
			"SK": &dyntypes.AttributeValueMemberS{Value: "USER#" + normalizedUserID},
		},
	})
	if err != nil {
		return nil, err
	}
	if out.Item == nil {
		return nil, fmt.Errorf("user not found")
	}

	return unmarshalUserItem(out.Item)
}

func (db *DynamoDB) GetUserByEmail(ctx context.Context, email string) (*models.User, error) {
	normalizedEmail := normalizeEmail(email)
	legacyEmail := strings.TrimSpace(email)
	if normalizedEmail == "" {
		return nil, fmt.Errorf("user not found")
	}

	if user, err := db.queryUserByEmailIndex(ctx, normalizedEmail); err == nil {
		return user, nil
	}

	if legacyEmail != "" && legacyEmail != normalizedEmail {
		if user, err := db.queryUserByEmailIndex(ctx, legacyEmail); err == nil {
			return user, nil
		}
	}

	user, err := db.scanUserByEmail(ctx, normalizedEmail, legacyEmail)
	if err != nil {
		return nil, err
	}

	return user, nil
}

func (db *DynamoDB) queryUserByEmailIndex(ctx context.Context, email string) (*models.User, error) {
	out, err := db.Client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(db.TableName),
		IndexName:              aws.String("GSI2"),
		KeyConditionExpression: aws.String("GSI2PK = :email"),
		ExpressionAttributeValues: map[string]dyntypes.AttributeValue{
			":email": &dyntypes.AttributeValueMemberS{Value: "EMAIL#" + email},
		},
		Limit: aws.Int32(1),
	})
	if err != nil {
		return nil, err
	}
	if len(out.Items) == 0 {
		return nil, fmt.Errorf("user not found")
	}

	return unmarshalUserItem(out.Items[0])
}

func (db *DynamoDB) scanUserByEmail(ctx context.Context, normalizedEmail, legacyEmail string) (*models.User, error) {
	expressionValues := map[string]dyntypes.AttributeValue{
		":userPrefix":      &dyntypes.AttributeValueMemberS{Value: "USER#"},
		":emailNormalized": &dyntypes.AttributeValueMemberS{Value: normalizedEmail},
	}

	filter := "begins_with(PK, :userPrefix) AND #email = :emailNormalized"
	if legacyEmail != "" && legacyEmail != normalizedEmail {
		expressionValues[":emailLegacy"] = &dyntypes.AttributeValueMemberS{Value: legacyEmail}
		filter = "begins_with(PK, :userPrefix) AND (#email = :emailNormalized OR #email = :emailLegacy)"
	}

	var exclusiveStartKey map[string]dyntypes.AttributeValue

	for {
		out, err := db.Client.Scan(ctx, &dynamodb.ScanInput{
			TableName: aws.String(db.TableName),
			ExpressionAttributeNames: map[string]string{
				"#email": "Email",
			},
			ExpressionAttributeValues: expressionValues,
			FilterExpression:          aws.String(filter),
			Limit:                     aws.Int32(25),
			ExclusiveStartKey:         exclusiveStartKey,
		})
		if err != nil {
			return nil, err
		}

		if len(out.Items) > 0 {
			user, err := unmarshalUserItem(out.Items[0])
			if err != nil {
				return nil, err
			}

			if user.Email != normalizedEmail {
				user.Email = normalizedEmail
			}

			if userNeedsEmailIndexBackfill(out.Items[0], user) {
				if err := db.PutUser(ctx, user); err != nil {
					return nil, err
				}
			}

			return user, nil
		}

		if len(out.LastEvaluatedKey) == 0 {
			return nil, fmt.Errorf("user not found")
		}

		exclusiveStartKey = out.LastEvaluatedKey
	}
}

func (db *DynamoDB) PutUser(ctx context.Context, u *models.User) error {
	u.UserID = trimEntityPrefix(u.UserID, "USER#")
	u.Email = normalizeEmail(u.Email)

	item, err := attributevalue.MarshalMap(u)
	if err != nil {
		return err
	}
	item["PK"] = &dyntypes.AttributeValueMemberS{Value: "USER#" + u.UserID}
	item["SK"] = &dyntypes.AttributeValueMemberS{Value: "USER#" + u.UserID}
	item["GSI1PK"] = &dyntypes.AttributeValueMemberS{Value: "USER"}
	item["GSI1SK"] = &dyntypes.AttributeValueMemberS{Value: u.CreatedAt}
	item["GSI2PK"] = &dyntypes.AttributeValueMemberS{Value: "EMAIL#" + u.Email}
	item["GSI2SK"] = &dyntypes.AttributeValueMemberS{Value: "USER#" + u.UserID}

	_, err = db.Client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(db.TableName),
		Item:      item,
	})
	return err
}

func (db *DynamoDB) GetUsers(ctx context.Context) (*models.Paginated[models.User], error) {
	out, err := db.Client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(db.TableName),
		IndexName:              aws.String("GSI1"),
		KeyConditionExpression: aws.String("GSI1PK = :sk"),
		ExpressionAttributeValues: map[string]dyntypes.AttributeValue{
			":sk": &dyntypes.AttributeValueMemberS{Value: "USER"},
		},
	})
	if err != nil {
		return nil, err
	}

	users := make([]models.User, 0, len(out.Items))
	for _, item := range out.Items {
		user, err := unmarshalUserItem(item)
		if err != nil {
			return nil, err
		}
		users = append(users, *user)
	}
	return &models.Paginated[models.User]{Items: users, Count: len(users)}, nil
}

func (db *DynamoDB) DeleteUser(ctx context.Context, userID string) error {
	_, err := db.Client.DeleteItem(ctx, &dynamodb.DeleteItemInput{
		TableName: aws.String(db.TableName),
		Key: map[string]dyntypes.AttributeValue{
			"PK": &dyntypes.AttributeValueMemberS{Value: "USER#" + userID},
			"SK": &dyntypes.AttributeValueMemberS{Value: "USER#" + userID},
		},
	})
	return err
}

// CreateUserAsAdmin provisions a Cognito user (email/password) and persists the profile in DynamoDB.
func (db *DynamoDB) CreateUserAsAdmin(ctx context.Context, req models.CreateUserRequest) (*models.User, error) {
	email := normalizeEmail(req.Email)
	name := strings.TrimSpace(req.Name)
	password := strings.TrimSpace(req.Password)
	if email == "" || name == "" || len(password) < 8 {
		return nil, fmt.Errorf("name, email, and password (at least 8 characters) are required")
	}

	userType := strings.ToUpper(strings.TrimSpace(req.UserType))
	if userType == "" {
		userType = "B2B"
	}
	if userType != "B2B" && userType != "B2C" {
		return nil, fmt.Errorf("userType must be B2B or B2C")
	}

	role := strings.ToLower(strings.TrimSpace(req.Role))
	if role == "" {
		role = "customer"
	}
	if role != "admin" && role != "customer" {
		return nil, fmt.Errorf("role must be 'admin' or 'customer'")
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	addr := req.Address
	if strings.TrimSpace(addr.Country) == "" {
		addr.Country = "US"
	}

	if _, err := db.GetUserByEmail(ctx, email); err == nil {
		return nil, fmt.Errorf("a user with this email already exists")
	}

	if strings.TrimSpace(db.UserPoolID) == "" {
		return nil, fmt.Errorf("user pool is not configured")
	}

	createOut, err := db.CognitoClient.AdminCreateUser(ctx, &cognitoidentityprovider.AdminCreateUserInput{
		UserPoolId: aws.String(db.UserPoolID),
		Username:   aws.String(email),
		UserAttributes: []types.AttributeType{
			{Name: aws.String("email"), Value: aws.String(email)},
			{Name: aws.String("email_verified"), Value: aws.String("true")},
			{Name: aws.String("name"), Value: aws.String(name)},
		},
		MessageAction:     types.MessageActionTypeSuppress,
		TemporaryPassword: aws.String(password),
	})
	if err != nil {
		low := strings.ToLower(err.Error())
		if strings.Contains(low, "usernameexists") {
			return nil, fmt.Errorf("a user with this email already exists")
		}
		return nil, fmt.Errorf("create user in Cognito: %w", err)
	}

	sub := ""
	if createOut.User != nil {
		for _, attr := range createOut.User.Attributes {
			if aws.ToString(attr.Name) == "sub" {
				sub = aws.ToString(attr.Value)
				break
			}
		}
	}
	if sub == "" {
		_, _ = db.CognitoClient.AdminDeleteUser(ctx, &cognitoidentityprovider.AdminDeleteUserInput{
			UserPoolId: aws.String(db.UserPoolID),
			Username:   aws.String(email),
		})
		return nil, fmt.Errorf("Cognito did not return a user id")
	}

	_, err = db.CognitoClient.AdminSetUserPassword(ctx, &cognitoidentityprovider.AdminSetUserPasswordInput{
		UserPoolId: aws.String(db.UserPoolID),
		Username:   aws.String(email),
		Password:   aws.String(password),
		Permanent:  true,
	})
	if err != nil {
		_, _ = db.CognitoClient.AdminDeleteUser(ctx, &cognitoidentityprovider.AdminDeleteUserInput{
			UserPoolId: aws.String(db.UserPoolID),
			Username:   aws.String(email),
		})
		return nil, fmt.Errorf("set password: %w", err)
	}

	ts := now()
	user := &models.User{
		UserID:    sub,
		Email:     email,
		Name:      name,
		Phone:     strings.TrimSpace(req.Phone),
		Address:   addr,
		Role:      role,
		UserType:  userType,
		IsActive:  isActive,
		CreatedAt: ts,
		UpdatedAt: ts,
	}
	if err := db.PutUser(ctx, user); err != nil {
		_, _ = db.CognitoClient.AdminDeleteUser(ctx, &cognitoidentityprovider.AdminDeleteUserInput{
			UserPoolId: aws.String(db.UserPoolID),
			Username:   aws.String(email),
		})
		return nil, err
	}

	if role == "admin" {
		if err := db.AddUserToAdminGroup(ctx, email); err != nil {
			log.Printf("CreateUserAsAdmin: failed to add %s to admin group: %v", email, err)
		}
	}

	return user, nil
}

// ─── Orders ───

func (db *DynamoDB) GetOrders(ctx context.Context, userID string) (*models.Paginated[models.Order], error) {
	input := &dynamodb.QueryInput{
		TableName:              aws.String(db.TableName),
		KeyConditionExpression: aws.String("GSI1PK = :pk"),
		ExpressionAttributeValues: map[string]dyntypes.AttributeValue{
			":pk": &dyntypes.AttributeValueMemberS{Value: "USER#" + userID + "#ORDER"},
		},
		IndexName:        aws.String("GSI1"),
		ScanIndexForward: aws.Bool(false),
	}

	out, err := db.Client.Query(ctx, input)
	if err != nil {
		return nil, err
	}

	var orders []models.Order
	if err := attributevalue.UnmarshalListOfMaps(out.Items, &orders); err != nil {
		return nil, err
	}
	for index := range orders {
		normalizeOrder(&orders[index])
	}
	return &models.Paginated[models.Order]{Items: orders, Count: len(orders)}, nil
}

// DebitOrderInventoryIfPaid subtracts each order line's qty from product stock once (idempotent).
func (db *DynamoDB) DebitOrderInventoryIfPaid(ctx context.Context, orderID string) error {
	order, err := db.GetOrder(ctx, orderID)
	if err != nil {
		return err
	}
	ps := strings.ToLower(strings.TrimSpace(order.PaymentStatus))
	if ps != "paid" && ps != "partially_refunded" {
		return nil
	}
	if strings.TrimSpace(order.InventoryDebitedAt) != "" {
		return nil
	}
	for _, it := range order.Items {
		pid := stripProductPrefix(it.ProductID)
		p, err := db.GetProduct(ctx, pid)
		if err != nil {
			return fmt.Errorf("product %s: %w", pid, err)
		}
		q := it.Qty
		if q < 1 {
			q = 1
		}
		newStock := p.Stock - q
		if newStock < 0 {
			newStock = 0
		}
		p.Stock = newStock
		p.UpdatedAt = now()
		if err := db.PutProduct(ctx, p); err != nil {
			return err
		}
	}
	order.InventoryDebitedAt = now()
	order.UpdatedAt = now()
	return db.PutOrder(ctx, order)
}

func (db *DynamoDB) GetAllOrders(ctx context.Context, status string) (*models.Paginated[models.Order], error) {
	input := &dynamodb.QueryInput{
		TableName:              aws.String(db.TableName),
		KeyConditionExpression: aws.String("GSI2PK = :pk"),
		ExpressionAttributeValues: map[string]dyntypes.AttributeValue{
			":pk": &dyntypes.AttributeValueMemberS{Value: "ORDER"},
		},
		IndexName:        aws.String("GSI2"),
		ScanIndexForward: aws.Bool(false),
	}

	out, err := db.Client.Query(ctx, input)
	if err != nil {
		return nil, err
	}

	var orders []models.Order
	if err := attributevalue.UnmarshalListOfMaps(out.Items, &orders); err != nil {
		return nil, err
	}
	for index := range orders {
		normalizeOrder(&orders[index])
	}

	if status != "" {
		filtered := make([]models.Order, 0)
		for _, o := range orders {
			if o.Status == status {
				filtered = append(filtered, o)
			}
		}
		return &models.Paginated[models.Order]{Items: filtered, Count: len(filtered)}, nil
	}

	return &models.Paginated[models.Order]{Items: orders, Count: len(orders)}, nil
}

func (db *DynamoDB) GetOrder(ctx context.Context, orderID string) (*models.Order, error) {
	out, err := db.Client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(db.TableName),
		Key: map[string]dyntypes.AttributeValue{
			"PK": &dyntypes.AttributeValueMemberS{Value: "ORDER#" + orderID},
			"SK": &dyntypes.AttributeValueMemberS{Value: "ORDER#" + orderID},
		},
	})
	if err != nil {
		return nil, err
	}
	if out.Item == nil {
		return nil, fmt.Errorf("order not found")
	}

	var order models.Order
	if err := attributevalue.UnmarshalMap(out.Item, &order); err != nil {
		return nil, err
	}
	normalizeOrder(&order)
	return &order, nil
}

func (db *DynamoDB) PutOrder(ctx context.Context, o *models.Order) error {
	item, err := attributevalue.MarshalMap(o)
	if err != nil {
		return err
	}
	item["PK"] = &dyntypes.AttributeValueMemberS{Value: "ORDER#" + o.OrderID}
	item["SK"] = &dyntypes.AttributeValueMemberS{Value: "ORDER#" + o.OrderID}
	// GSI1: user's orders
	item["GSI1PK"] = &dyntypes.AttributeValueMemberS{Value: "USER#" + o.UserID + "#ORDER"}
	item["GSI1SK"] = &dyntypes.AttributeValueMemberS{Value: o.CreatedAt}
	// GSI2: all orders (for admin)
	item["GSI2PK"] = &dyntypes.AttributeValueMemberS{Value: "ORDER"}
	item["GSI2SK"] = &dyntypes.AttributeValueMemberS{Value: o.CreatedAt}

	_, err = db.Client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(db.TableName),
		Item:      item,
	})
	return err
}

func (db *DynamoDB) GetOrderByStripeChargeID(ctx context.Context, chargeID string) (*models.Order, error) {
	if strings.TrimSpace(chargeID) == "" {
		return nil, fmt.Errorf("charge id is required")
	}

	out, err := db.Client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(db.TableName),
		IndexName:              aws.String("GSI2"),
		KeyConditionExpression: aws.String("GSI2PK = :pk"),
		ExpressionAttributeValues: map[string]dyntypes.AttributeValue{
			":pk": &dyntypes.AttributeValueMemberS{Value: "ORDER"},
		},
	})
	if err != nil {
		return nil, err
	}

	for _, item := range out.Items {
		var order models.Order
		if err := attributevalue.UnmarshalMap(item, &order); err != nil {
			return nil, err
		}
		normalizeOrder(&order)
		if order.StripeChargeID == chargeID {
			return &order, nil
		}
	}

	return nil, fmt.Errorf("order not found")
}

func normalizeOrder(order *models.Order) {
	if order == nil {
		return
	}
	order.OrderID = strings.TrimPrefix(order.OrderID, "ORDER#")
}

// ─── Config ───

func (db *DynamoDB) GetConfig(ctx context.Context) (*models.StoreConfig, error) {
	out, err := db.Client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(db.TableName),
		Key: map[string]dyntypes.AttributeValue{
			"PK": &dyntypes.AttributeValueMemberS{Value: "CONFIG"},
			"SK": &dyntypes.AttributeValueMemberS{Value: "CONFIG"},
		},
	})
	if err != nil {
		return nil, err
	}
	envStripePublishableKey := strings.TrimSpace(os.Getenv("STRIPE_PUBLISHABLE_KEY"))
	if out.Item == nil {
		log.Printf("GetConfig: no item in DynamoDB, returning defaults")
		return &models.StoreConfig{StoreName: "ShopReturnGifts", Currency: "USD", StripePublishableKey: envStripePublishableKey}, nil
	}

	var config models.StoreConfig
	if err := attributevalue.UnmarshalMap(out.Item, &config); err != nil {
		return nil, err
	}
	log.Printf("GetConfig: retrieved stripeAutoTaxEnabled=%v, taxRate=%.2f from DynamoDB", config.StripeAutoTaxEnabled, config.TaxRate)

	// If the stored key is missing or looks like a placeholder (real Stripe
	// publishable keys start with pk_live_ or pk_test_ and are 80+ chars),
	// fall back to the environment variable so that local dev and
	// misconfigured DynamoDB entries never break the checkout flow.
	if !strings.HasPrefix(config.StripePublishableKey, "pk_") || len(config.StripePublishableKey) < 20 {
		config.StripePublishableKey = envStripePublishableKey
	}
	return &config, nil
}

func (db *DynamoDB) PutConfig(ctx context.Context, c *models.StoreConfig) error {
	log.Printf("PutConfig: saving config with stripeAutoTaxEnabled=%v, taxRate=%.2f to DynamoDB", c.StripeAutoTaxEnabled, c.TaxRate)
	item, err := attributevalue.MarshalMap(c)
	if err != nil {
		return err
	}
	item["PK"] = &dyntypes.AttributeValueMemberS{Value: "CONFIG"}
	item["SK"] = &dyntypes.AttributeValueMemberS{Value: "CONFIG"}

	_, err = db.Client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(db.TableName),
		Item:      item,
	})
	if err != nil {
		log.Printf("PutConfig error: %v", err)
		return err
	}
	log.Printf("PutConfig: successfully saved config to DynamoDB")
	return err
}

// ─── S3 ───

func (db *DynamoDB) GetPresignedUploadURL(ctx context.Context, key string) (string, error) {
	// Derive expected content-type from the file extension in the key.
	contentType := "image/jpeg"
	switch {
	case strings.HasSuffix(strings.ToLower(key), ".png"):
		contentType = "image/png"
	case strings.HasSuffix(strings.ToLower(key), ".webp"):
		contentType = "image/webp"
	}

	presigner := s3.NewPresignClient(db.S3Client)
	req, err := presigner.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(db.S3Bucket),
		Key:         aws.String(key),
		ContentType: aws.String(contentType),
	})
	if err != nil {
		return "", err
	}
	return req.URL, nil
}

func (db *DynamoDB) GetPresignedDownloadURL(ctx context.Context, key string) (string, error) {
	presigner := s3.NewPresignClient(db.S3Client)
	req, err := presigner.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(db.S3Bucket),
		Key:    aws.String(key),
	}, func(opts *s3.PresignOptions) {
		opts.Expires = 15 * time.Minute
	})
	if err != nil {
		return "", err
	}
	return req.URL, nil
}

func (db *DynamoDB) PutObject(ctx context.Context, key string, body []byte, contentType string) error {
	_, err := db.S3Client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(db.S3Bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(body),
		ContentType: aws.String(contentType),
	})
	return err
}

func (db *DynamoDB) GetPublicURL(key string) string {
	return fmt.Sprintf("https://%s.s3.amazonaws.com/%s", db.S3Bucket, key)
}

// ─── Helpers ───

func isAlreadyConfirmedError(err error) bool {
	if err == nil {
		return false
	}

	var notAuthorizedErr *types.NotAuthorizedException
	if errors.As(err, &notAuthorizedErr) {
		return strings.Contains(strings.ToLower(notAuthorizedErr.Error()), "current status is confirmed")
	}

	return strings.Contains(strings.ToLower(err.Error()), "current status is confirmed")
}

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func unmarshalUserItem(item map[string]dyntypes.AttributeValue) (*models.User, error) {
	var user models.User
	if err := attributevalue.UnmarshalMap(item, &user); err != nil {
		return nil, err
	}

	if pk, ok := getStringAttribute(item, "PK"); ok {
		user.UserID = trimEntityPrefix(pk, "USER#")
	} else {
		user.UserID = trimEntityPrefix(user.UserID, "USER#")
	}

	user.Email = normalizeEmail(user.Email)

	return &user, nil
}

func userNeedsEmailIndexBackfill(item map[string]dyntypes.AttributeValue, user *models.User) bool {
	expectedGSI2PK := "EMAIL#" + user.Email
	expectedGSI2SK := "USER#" + user.UserID

	gsi2pk, hasGSI2PK := getStringAttribute(item, "GSI2PK")
	gsi2sk, hasGSI2SK := getStringAttribute(item, "GSI2SK")

	return !hasGSI2PK || !hasGSI2SK || gsi2pk != expectedGSI2PK || gsi2sk != expectedGSI2SK
}

func getStringAttribute(item map[string]dyntypes.AttributeValue, key string) (string, bool) {
	attr, ok := item[key].(*dyntypes.AttributeValueMemberS)
	if !ok {
		return "", false
	}

	return attr.Value, true
}

func trimEntityPrefix(value, prefix string) string {
	trimmed := strings.TrimSpace(value)
	for strings.HasPrefix(trimmed, prefix) {
		trimmed = strings.TrimPrefix(trimmed, prefix)
	}
	return trimmed
}

func contains(s, substr string) bool {
	if substr == "" {
		return true
	}
	sLower := strings.ToLower(strings.TrimSpace(s))
	subLower := strings.ToLower(strings.TrimSpace(substr))
	if subLower == "" {
		return true
	}
	return strings.Contains(sLower, subLower)
}

// ─── Coupons ───

func (db *DynamoDB) GetCoupons(ctx context.Context) ([]models.Coupon, error) {
	out, err := db.Client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(db.TableName),
		IndexName:              aws.String("GSI1"),
		KeyConditionExpression: aws.String("GSI1PK = :pk"),
		ExpressionAttributeValues: map[string]dyntypes.AttributeValue{
			":pk": &dyntypes.AttributeValueMemberS{Value: "COUPONS"},
		},
	})
	if err != nil {
		return nil, err
	}
	var coupons []models.Coupon
	if err := attributevalue.UnmarshalListOfMaps(out.Items, &coupons); err != nil {
		return nil, err
	}
	return coupons, nil
}

func (db *DynamoDB) GetCoupon(ctx context.Context, couponID string) (*models.Coupon, error) {
	out, err := db.Client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(db.TableName),
		Key: map[string]dyntypes.AttributeValue{
			"PK": &dyntypes.AttributeValueMemberS{Value: couponID},
			"SK": &dyntypes.AttributeValueMemberS{Value: couponID},
		},
	})
	if err != nil {
		return nil, err
	}
	if out.Item == nil {
		return nil, fmt.Errorf("coupon not found")
	}
	var c models.Coupon
	if err := attributevalue.UnmarshalMap(out.Item, &c); err != nil {
		return nil, err
	}
	return &c, nil
}

func (db *DynamoDB) GetCouponByCode(ctx context.Context, code string) (*models.Coupon, error) {
	coupons, err := db.GetCoupons(ctx)
	if err != nil {
		return nil, err
	}
	for i := range coupons {
		if strings.EqualFold(coupons[i].Code, code) {
			return &coupons[i], nil
		}
	}
	return nil, fmt.Errorf("coupon not found")
}

func (db *DynamoDB) PutCoupon(ctx context.Context, c *models.Coupon) error {
	item, err := attributevalue.MarshalMap(c)
	if err != nil {
		return err
	}
	item["SK"] = &dyntypes.AttributeValueMemberS{Value: c.CouponID}
	item["GSI1PK"] = &dyntypes.AttributeValueMemberS{Value: "COUPONS"}
	item["GSI1SK"] = &dyntypes.AttributeValueMemberS{Value: c.Code}
	_, err = db.Client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(db.TableName),
		Item:      item,
	})
	return err
}

func (db *DynamoDB) DeleteCoupon(ctx context.Context, couponID string) error {
	_, err := db.Client.DeleteItem(ctx, &dynamodb.DeleteItemInput{
		TableName: aws.String(db.TableName),
		Key: map[string]dyntypes.AttributeValue{
			"PK": &dyntypes.AttributeValueMemberS{Value: couponID},
			"SK": &dyntypes.AttributeValueMemberS{Value: couponID},
		},
	})
	return err
}

// ─── Coupon Redemptions ───

func couponRedemptionPK(userID string) string { return "COUPONREDEMPTION#" + userID }

// GetUserCouponRedemptions returns all coupon redemptions for a user.
func (db *DynamoDB) GetUserCouponRedemptions(ctx context.Context, userID string) ([]models.CouponRedemption, error) {
	out, err := db.Client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(db.TableName),
		KeyConditionExpression: aws.String("PK = :pk"),
		ExpressionAttributeValues: map[string]dyntypes.AttributeValue{
			":pk": &dyntypes.AttributeValueMemberS{Value: couponRedemptionPK(userID)},
		},
	})
	if err != nil {
		return nil, err
	}
	var redemptions []models.CouponRedemption
	if err := attributevalue.UnmarshalListOfMaps(out.Items, &redemptions); err != nil {
		return nil, err
	}
	return redemptions, nil
}

// HasUserRedeemedCoupon returns true if the user has already redeemed this coupon.
func (db *DynamoDB) HasUserRedeemedCoupon(ctx context.Context, userID, couponID string) (bool, error) {
	out, err := db.Client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(db.TableName),
		Key: map[string]dyntypes.AttributeValue{
			"PK": &dyntypes.AttributeValueMemberS{Value: couponRedemptionPK(userID)},
			"SK": &dyntypes.AttributeValueMemberS{Value: couponID},
		},
	})
	if err != nil {
		return false, err
	}
	return out.Item != nil, nil
}

// RecordCouponRedemption persists a redemption record (idempotent on PK+SK).
func (db *DynamoDB) RecordCouponRedemption(ctx context.Context, userID, couponID, couponCode, orderID string) error {
	red := models.CouponRedemption{
		PK:         couponRedemptionPK(userID),
		SK:         couponID,
		UserID:     userID,
		CouponID:   couponID,
		CouponCode: couponCode,
		OrderID:    orderID,
		RedeemedAt: now(),
	}
	item, err := attributevalue.MarshalMap(red)
	if err != nil {
		return err
	}
	_, err = db.Client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(db.TableName),
		Item:      item,
	})
	return err
}

// ─── Dealers ───

func dealerKey(dealerID string) string {
	if strings.HasPrefix(dealerID, "DEALER#") {
		return dealerID
	}
	return "DEALER#" + dealerID
}

func (db *DynamoDB) GetDealers(ctx context.Context) ([]models.Dealer, error) {
	out, err := db.Client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(db.TableName),
		IndexName:              aws.String("GSI1"),
		KeyConditionExpression: aws.String("GSI1PK = :pk"),
		ExpressionAttributeValues: map[string]dyntypes.AttributeValue{
			":pk": &dyntypes.AttributeValueMemberS{Value: "DEALERS"},
		},
	})
	if err != nil {
		return nil, err
	}
	var dealers []models.Dealer
	if err := attributevalue.UnmarshalListOfMaps(out.Items, &dealers); err != nil {
		return nil, err
	}
	return dealers, nil
}

func (db *DynamoDB) GetDealer(ctx context.Context, dealerID string) (*models.Dealer, error) {
	pk := dealerKey(dealerID)
	out, err := db.Client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(db.TableName),
		Key: map[string]dyntypes.AttributeValue{
			"PK": &dyntypes.AttributeValueMemberS{Value: pk},
			"SK": &dyntypes.AttributeValueMemberS{Value: pk},
		},
	})
	if err != nil {
		return nil, err
	}
	if out.Item == nil {
		return nil, fmt.Errorf("dealer not found")
	}
	var d models.Dealer
	if err := attributevalue.UnmarshalMap(out.Item, &d); err != nil {
		return nil, err
	}
	return &d, nil
}

func (db *DynamoDB) PutDealer(ctx context.Context, d *models.Dealer) error {
	item, err := attributevalue.MarshalMap(d)
	if err != nil {
		return err
	}
	item["SK"] = &dyntypes.AttributeValueMemberS{Value: d.DealerID}
	item["GSI1PK"] = &dyntypes.AttributeValueMemberS{Value: "DEALERS"}
	item["GSI1SK"] = &dyntypes.AttributeValueMemberS{Value: strings.ToLower(d.Name)}
	_, err = db.Client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(db.TableName),
		Item:      item,
	})
	return err
}

func (db *DynamoDB) DeleteDealer(ctx context.Context, dealerID string) error {
	pk := dealerKey(dealerID)
	_, err := db.Client.DeleteItem(ctx, &dynamodb.DeleteItemInput{
		TableName: aws.String(db.TableName),
		Key: map[string]dyntypes.AttributeValue{
			"PK": &dyntypes.AttributeValueMemberS{Value: pk},
			"SK": &dyntypes.AttributeValueMemberS{Value: pk},
		},
	})
	return err
}

// ─── Refunds ───
//
// Refund records are stored as PK="REFUND#<refundId>" SK="REFUND#<refundId>"
// with GSI1PK="REFUND" for global listing.

func refundKey(refundID string) string {
	id := strings.TrimPrefix(refundID, "REFUND#")
	return "REFUND#" + id
}

func stripRefundPrefix(id string) string {
	return strings.TrimPrefix(id, "REFUND#")
}

func (db *DynamoDB) PutRefund(ctx context.Context, r *models.Refund) error {
	r.RefundID = stripRefundPrefix(r.RefundID)
	item, err := attributevalue.MarshalMap(r)
	if err != nil {
		return err
	}
	pk := refundKey(r.RefundID)
	item["PK"] = &dyntypes.AttributeValueMemberS{Value: pk}
	item["SK"] = &dyntypes.AttributeValueMemberS{Value: pk}
	item["GSI1PK"] = &dyntypes.AttributeValueMemberS{Value: "REFUND"}
	item["GSI1SK"] = &dyntypes.AttributeValueMemberS{Value: r.CreatedAt}

	_, err = db.Client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(db.TableName),
		Item:      item,
	})
	return err
}

func (db *DynamoDB) GetRefund(ctx context.Context, refundID string) (*models.Refund, error) {
	pk := refundKey(refundID)
	out, err := db.Client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(db.TableName),
		Key: map[string]dyntypes.AttributeValue{
			"PK": &dyntypes.AttributeValueMemberS{Value: pk},
			"SK": &dyntypes.AttributeValueMemberS{Value: pk},
		},
	})
	if err != nil {
		return nil, err
	}
	if out.Item == nil {
		return nil, fmt.Errorf("refund not found")
	}
	var refund models.Refund
	if err := attributevalue.UnmarshalMap(out.Item, &refund); err != nil {
		return nil, err
	}
	refund.RefundID = stripRefundPrefix(refund.RefundID)
	return &refund, nil
}

func (db *DynamoDB) GetRefunds(ctx context.Context) ([]models.Refund, error) {
	out, err := db.Client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(db.TableName),
		IndexName:              aws.String("GSI1"),
		KeyConditionExpression: aws.String("GSI1PK = :pk"),
		ExpressionAttributeValues: map[string]dyntypes.AttributeValue{
			":pk": &dyntypes.AttributeValueMemberS{Value: "REFUND"},
		},
		ScanIndexForward: aws.Bool(false),
	})
	if err != nil {
		return nil, err
	}
	var refunds []models.Refund
	if err := attributevalue.UnmarshalListOfMaps(out.Items, &refunds); err != nil {
		return nil, err
	}
	for i := range refunds {
		refunds[i].RefundID = stripRefundPrefix(refunds[i].RefundID)
	}
	return refunds, nil
}

// ─── Cognito admin-group helpers ───

// AddUserToAdminGroup adds the user (by Cognito username = email) to the "admin" group.
func (db *DynamoDB) AddUserToAdminGroup(ctx context.Context, email string) error {
	if strings.TrimSpace(db.UserPoolID) == "" {
		return nil // no-op when Cognito is not configured (e.g. local)
	}
	_, err := db.CognitoClient.AdminAddUserToGroup(ctx, &cognitoidentityprovider.AdminAddUserToGroupInput{
		GroupName:  aws.String("admin"),
		UserPoolId: aws.String(db.UserPoolID),
		Username:   aws.String(normalizeEmail(email)),
	})
	return err
}

// RemoveUserFromAdminGroup removes the user from the "admin" group.
func (db *DynamoDB) RemoveUserFromAdminGroup(ctx context.Context, email string) error {
	if strings.TrimSpace(db.UserPoolID) == "" {
		return nil
	}
	_, err := db.CognitoClient.AdminRemoveUserFromGroup(ctx, &cognitoidentityprovider.AdminRemoveUserFromGroupInput{
		GroupName:  aws.String("admin"),
		UserPoolId: aws.String(db.UserPoolID),
		Username:   aws.String(normalizeEmail(email)),
	})
	return err
}

// AdminSetUserEnabled enables or disables sign-in for the Cognito user (username = email).
func (db *DynamoDB) AdminSetUserEnabled(ctx context.Context, email string, enabled bool) error {
	if strings.TrimSpace(db.UserPoolID) == "" {
		return nil
	}
	u := normalizeEmail(email)
	if u == "" {
		return fmt.Errorf("email is required")
	}
	if enabled {
		_, err := db.CognitoClient.AdminEnableUser(ctx, &cognitoidentityprovider.AdminEnableUserInput{
			UserPoolId: aws.String(db.UserPoolID),
			Username:   aws.String(u),
		})
		return err
	}
	_, err := db.CognitoClient.AdminDisableUser(ctx, &cognitoidentityprovider.AdminDisableUserInput{
		UserPoolId: aws.String(db.UserPoolID),
		Username:   aws.String(u),
	})
	return err
}
