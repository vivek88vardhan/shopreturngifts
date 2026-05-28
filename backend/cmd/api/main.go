package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	chiadapter "github.com/awslabs/aws-lambda-go-api-proxy/chi"
	"github.com/go-chi/chi/v5"

	"shopreturngifts-api/internal/handlers"
	"shopreturngifts-api/internal/middleware"
	"shopreturngifts-api/internal/router"
	"shopreturngifts-api/internal/store"
	stripeutil "shopreturngifts-api/internal/stripe"
)

var chiAdapter *chiadapter.ChiLambda

func init() {
	chiAdapter = chiadapter.New(buildRouter())
}

func buildRouter() *chi.Mux {
	// Initialize Stripe from Secrets Manager
	if err := stripeutil.InitFromSecretsManager(context.Background()); err != nil {
		log.Printf("stripe initialization from Secrets Manager failed: %v", err)
		// Try fallback: read from environment variable if available
		if secretKey := strings.TrimSpace(os.Getenv("STRIPE_SECRET_KEY")); secretKey != "" {
			if err := stripeutil.Init(secretKey); err != nil {
				log.Printf("stripe fallback initialization also failed: %v", err)
			}
		}
	}

	cfg, err := config.LoadDefaultConfig(context.Background())
	if err != nil {
		log.Fatalf("unable to load AWS config: %v", err)
	}

	dynamo := dynamodb.NewFromConfig(cfg)
	s3Client := s3.NewFromConfig(cfg)
	cognitoClient := cognitoidentityprovider.NewFromConfig(cfg)

	db := &store.DynamoDB{
		Client:        dynamo,
		TableName:     os.Getenv("TABLE_NAME"),
		S3Client:      s3Client,
		S3Bucket:      os.Getenv("S3_BUCKET"),
		CognitoClient: cognitoClient,
		UserPoolID:    os.Getenv("COGNITO_USER_POOL_ID"),
		AppClientID:   os.Getenv("COGNITO_APP_CLIENT_ID"),
	}

	h := handlers.New(db)
	auth := middleware.NewAuth(
		os.Getenv("COGNITO_USER_POOL_ID"),
		os.Getenv("AWS_REGION"),
		os.Getenv("COGNITO_APP_CLIENT_ID"),
	)

	return router.New(h, auth)
}

func handler(ctx context.Context, req events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	return chiAdapter.ProxyWithContext(ctx, req)
}

func main() {
	if os.Getenv("AWS_LAMBDA_RUNTIME_API") == "" {
		port := os.Getenv("PORT")
		if port == "" {
			port = "9000"
		}

		addr := ":" + port
		log.Printf("starting local HTTP server on %s", addr)
		if err := http.ListenAndServe(addr, buildRouter()); err != nil {
			log.Fatalf("local server failed: %v", err)
		}
		return
	}

	lambda.Start(handler)
}
