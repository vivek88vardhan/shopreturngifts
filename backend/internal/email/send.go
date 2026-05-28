package email

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/sesv2"
	sestypes "github.com/aws/aws-sdk-go-v2/service/sesv2/types"
	"github.com/aws/smithy-go"
)

// ErrSESIdentityNotVerified means SES sandbox rejected From or To (verify identities or request production access).
var ErrSESIdentityNotVerified = errors.New("ses: email identity not verified")

func newSESClient(ctx context.Context) (*sesv2.Client, error) {
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

func defaultFromEmail(msg Message) string {
	if f := strings.TrimSpace(msg.FromEmail); f != "" {
		return f
	}
	if f := strings.TrimSpace(os.Getenv("CONTACT_FROM_EMAIL")); f != "" {
		return f
	}
	return ""
}

// Send delivers one message via Amazon SES (used by the SNS email worker Lambda).
func Send(ctx context.Context, msg Message) error {
	to := uniqueNonEmpty(msg.To)
	if len(to) == 0 {
		return fmt.Errorf("email: no recipients for event %s", msg.Event)
	}
	switch strings.TrimSpace(msg.Audience) {
	case AudienceCustomer:
		if len(to) != 1 {
			return fmt.Errorf("email: customer audience requires exactly one recipient (got %d) for event %s", len(to), msg.Event)
		}
	case AudienceAdmin:
		if len(to) != 1 {
			return fmt.Errorf("email: admin audience sends one admin per message (got %d) for event %s", len(to), msg.Event)
		}
	}
	from := defaultFromEmail(msg)
	if from == "" {
		return fmt.Errorf("email: CONTACT_FROM_EMAIL is not configured")
	}
	subject := strings.TrimSpace(msg.Subject)
	if subject == "" {
		return fmt.Errorf("email: empty subject for event %s", msg.Event)
	}
	textBody := strings.TrimSpace(msg.TextBody)
	if textBody == "" {
		textBody = subject
	}

	client, err := newSESClient(ctx)
	if err != nil {
		return err
	}

	body := &sestypes.Body{
		Text: &sestypes.Content{Data: aws.String(textBody), Charset: aws.String("UTF-8")},
	}
	if htmlBody := strings.TrimSpace(msg.HTMLBody); htmlBody != "" {
		body.Html = &sestypes.Content{Data: aws.String(htmlBody), Charset: aws.String("UTF-8")}
	}

	input := &sesv2.SendEmailInput{
		FromEmailAddress: aws.String(from),
		Destination: &sestypes.Destination{
			ToAddresses: to,
		},
		Content: &sestypes.EmailContent{
			Simple: &sestypes.Message{
				Subject: &sestypes.Content{Data: aws.String(subject), Charset: aws.String("UTF-8")},
				Body:    body,
			},
		},
	}
	if len(msg.ReplyTo) > 0 {
		input.ReplyToAddresses = uniqueNonEmpty(msg.ReplyTo)
	}

	_, err = client.SendEmail(ctx, input)
	if err != nil && IsSESIdentityNotVerified(err) {
		return fmt.Errorf("%w (from=%q to=%v): %v", ErrSESIdentityNotVerified, from, to, err)
	}
	return err
}

// IsSESIdentityNotVerified reports SES sandbox / unverified identity rejections.
func IsSESIdentityNotVerified(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, ErrSESIdentityNotVerified) {
		return true
	}
	var ae smithy.APIError
	if errors.As(err, &ae) && ae.ErrorCode() == "MessageRejected" {
		return true
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "not verified") ||
		strings.Contains(msg, "failed the check in region")
}

// SESVerificationHint returns operator guidance when IsSESIdentityNotVerified is true.
func SESVerificationHint() string {
	region := strings.TrimSpace(os.Getenv("AWS_REGION"))
	if region == "" {
		region = "us-east-1"
	}
	return fmt.Sprintf(
		"Amazon SES is in sandbox mode: verify the From address in SES (%s → Identities), "+
			"and either verify each recipient email or request production access (Account dashboard → Request production access).",
		region,
	)
}

func uniqueNonEmpty(addrs []string) []string {
	seen := make(map[string]bool, len(addrs))
	var out []string
	for _, a := range addrs {
		a = strings.TrimSpace(a)
		if a == "" || !strings.Contains(a, "@") || seen[strings.ToLower(a)] {
			continue
		}
		seen[strings.ToLower(a)] = true
		out = append(out, a)
	}
	return out
}
