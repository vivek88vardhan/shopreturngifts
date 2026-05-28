package handlers

import (
	"context"
	"os"
	"strings"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/sesv2"
)

// newSESv2Client returns an SES API v2 client. When SES_REGION is set, that
// region is used so verified identities in a different region than the Lambda
// still work.
func newSESv2Client(ctx context.Context) (*sesv2.Client, error) {
	cfg, err := awsconfig.LoadDefaultConfig(ctx)
	if err != nil {
		return nil, err
	}
	if r := strings.TrimSpace(os.Getenv("SES_REGION")); r != "" {
		return sesv2.NewFromConfig(cfg, func(o *sesv2.Options) {
			o.Region = r
		}), nil
	}
	return sesv2.NewFromConfig(cfg), nil
}
