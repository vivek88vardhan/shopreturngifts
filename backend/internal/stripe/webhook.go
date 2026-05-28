package stripeutil

import (
	stripe "github.com/stripe/stripe-go/v82"
	"github.com/stripe/stripe-go/v82/webhook"
)

func VerifyWebhook(body []byte, signature string, secret string) (stripe.Event, error) {
	return webhook.ConstructEvent(body, signature, secret)
}