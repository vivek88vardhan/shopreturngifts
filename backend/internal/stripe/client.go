package stripeutil

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/secretsmanager"
	stripe "github.com/stripe/stripe-go/v82"
)

var initialized bool

// SecretsPayload represents the Secrets Manager secret structure
type SecretsPayload struct {
	StripePublishableKey string `json:"STRIPE_PUBLISHABLE_KEY"`
	StripeSecretKey      string `json:"STRIPE_SECRET_KEY"`
	StripeWebhookSecret  string `json:"STRIPE_WEBHOOK_SECRET"`
}

// InitFromSecretsManager reads Stripe secrets from AWS Secrets Manager
func InitFromSecretsManager(ctx context.Context) error {
	stage := strings.TrimSpace(os.Getenv("STAGE"))
	if stage == "" {
		stage = "prod"
	}

	secretName := fmt.Sprintf("ecommerce/%s/backend", stage)
	region := strings.TrimSpace(os.Getenv("AWS_REGION"))
	if region == "" {
		region = "us-east-1"
	}

	// Load AWS config
	cfg, err := config.LoadDefaultConfig(ctx, config.WithRegion(region))
	if err != nil {
		return fmt.Errorf("failed to load AWS config: %v", err)
	}

	// Create Secrets Manager client
	smClient := secretsmanager.NewFromConfig(cfg)

	// Get secret from Secrets Manager
	result, err := smClient.GetSecretValue(ctx, &secretsmanager.GetSecretValueInput{
		SecretId: &secretName,
	})
	if err != nil {
		return fmt.Errorf("failed to retrieve secret %s: %v", secretName, err)
	}

	// Parse secret JSON
	var secrets SecretsPayload
	if err := json.Unmarshal([]byte(*result.SecretString), &secrets); err != nil {
		return fmt.Errorf("failed to parse secret JSON: %v", err)
	}

	// Validate and initialize Stripe
	secretKey := strings.TrimSpace(secrets.StripeSecretKey)
	if secretKey == "" {
		return fmt.Errorf("STRIPE_SECRET_KEY is empty in Secrets Manager")
	}

	stripe.Key = secretKey
	initialized = true
	log.Printf("stripe SDK initialized from Secrets Manager (secret: %s)", secretName)
	return nil
}

// Init initializes Stripe with a provided secret key (fallback method)
func Init(secretKey string) error {
	secretKey = strings.TrimSpace(secretKey)
	if secretKey == "" {
		initialized = false
		return fmt.Errorf("missing STRIPE_SECRET_KEY")
	}

	stripe.Key = secretKey
	initialized = true
	log.Printf("stripe SDK initialized with provided key")
	return nil
}

func IsInitialized() bool {
	return initialized
}
