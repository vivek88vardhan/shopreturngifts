package email

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/sns"
	snstypes "github.com/aws/aws-sdk-go-v2/service/sns/types"
)

// Publisher enqueues transactional emails on an SNS topic for async SES delivery.
type Publisher struct {
	client   *sns.Client
	topicARN string
}

// NewPublisherFromEnv returns a publisher when EMAIL_SNS_TOPIC_ARN is set.
func NewPublisherFromEnv(ctx context.Context) *Publisher {
	arn := strings.TrimSpace(os.Getenv("EMAIL_SNS_TOPIC_ARN"))
	if arn == "" {
		log.Printf("email: EMAIL_SNS_TOPIC_ARN not set — in-app notifications only (no outbound email via SNS)")
		return &Publisher{}
	}
	cfg, err := awsconfig.LoadDefaultConfig(ctx)
	if err != nil {
		log.Printf("email: aws config failed: %v", err)
		return &Publisher{}
	}
	return &Publisher{
		client:   sns.NewFromConfig(cfg),
		topicARN: arn,
	}
}

func (p *Publisher) Enabled() bool {
	return p != nil && p.client != nil && p.topicARN != ""
}

// Publish sends the message to SNS (non-blocking for callers; failures are logged).
func (p *Publisher) Publish(ctx context.Context, msg Message) error {
	if !p.Enabled() {
		return nil
	}
	if len(uniqueNonEmpty(msg.To)) == 0 {
		return nil
	}
	raw, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	attrs := map[string]snstypes.MessageAttributeValue{}
	if e := strings.TrimSpace(msg.Event); e != "" {
		attrs["event"] = snstypes.MessageAttributeValue{
			DataType:    aws.String("String"),
			StringValue: aws.String(e),
		}
	}
	_, err = p.client.Publish(ctx, &sns.PublishInput{
		TopicArn:          aws.String(p.topicARN),
		Message:           aws.String(string(raw)),
		MessageAttributes: attrs,
	})
	return err
}
