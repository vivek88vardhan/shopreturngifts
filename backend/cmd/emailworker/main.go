package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"

	"shopreturngifts-api/internal/email"
)

func handler(ctx context.Context, event events.SNSEvent) error {
	for _, record := range event.Records {
		var msg email.Message
		if err := json.Unmarshal([]byte(record.SNS.Message), &msg); err != nil {
			log.Printf("email worker: invalid SNS payload: %v", err)
			continue
		}
		if err := email.Send(ctx, msg); err != nil {
			if errors.Is(err, email.ErrSESIdentityNotVerified) || email.IsSESIdentityNotVerified(err) {
				log.Printf(
					"email worker: SES rejected event=%s audience=%s to=%v — %s Raw: %v",
					msg.Event, msg.Audience, msg.To, email.SESVerificationHint(), err,
				)
				// Do not retry forever; fix identities in SES console.
				continue
			}
			log.Printf("email worker: send failed event=%s audience=%s to=%v: %v", msg.Event, msg.Audience, msg.To, err)
			return err
		}
		log.Printf("email worker: sent event=%s audience=%s to=%v", msg.Event, msg.Audience, msg.To)
	}
	return nil
}

func main() {
	lambda.Start(handler)
}
