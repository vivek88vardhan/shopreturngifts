package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/sesv2"
	sestypes "github.com/aws/aws-sdk-go-v2/service/sesv2/types"
	"github.com/aws/smithy-go"
)

// ContactRequest is the body for /contact submissions.
type ContactRequest struct {
	Name    string `json:"name"`
	Email   string `json:"email"`
	Subject string `json:"subject"` // general | dealership | complaint
	Message string `json:"message"`
}

var contactSubjectLabels = map[string]string{
	"general":    "General Inquiry",
	"dealership": "Dealership / Partnership",
	"complaint":  "Issue or Complaint",
}

// SubmitContact handles public contact form submissions and emails them via SES.
// POST /contact (public, no auth)
func (h *Handlers) SubmitContact(w http.ResponseWriter, r *http.Request) {
	var req ContactRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Server-side validation (mirror frontend zod schema)
	req.Name = strings.TrimSpace(req.Name)
	req.Email = strings.TrimSpace(req.Email)
	req.Subject = strings.TrimSpace(strings.ToLower(req.Subject))
	req.Message = strings.TrimSpace(req.Message)

	if req.Name == "" || len(req.Name) > 100 {
		writeError(w, http.StatusBadRequest, "name is required (max 100 chars)")
		return
	}
	if req.Email == "" || len(req.Email) > 255 || !strings.Contains(req.Email, "@") {
		writeError(w, http.StatusBadRequest, "valid email is required")
		return
	}
	if _, ok := contactSubjectLabels[req.Subject]; !ok {
		writeError(w, http.StatusBadRequest, "subject must be general, dealership, or complaint")
		return
	}
	if len(req.Message) < 10 || len(req.Message) > 2000 {
		writeError(w, http.StatusBadRequest, "message must be 10-2000 characters")
		return
	}

	cfg, cfgErr := h.db.GetConfig(r.Context())
	if cfgErr != nil {
		log.Printf("[contact] GetConfig failed (using env fallbacks only): %v", cfgErr)
	}
	fromEmail := strings.TrimSpace(os.Getenv("CONTACT_FROM_EMAIL"))
	if cfg != nil && strings.TrimSpace(cfg.ContactFromEmail) != "" {
		fromEmail = strings.TrimSpace(cfg.ContactFromEmail)
	}
	toEmail := strings.TrimSpace(os.Getenv("CONTACT_TO_EMAIL"))
	if cfg != nil && strings.TrimSpace(cfg.ContactToEmail) != "" {
		toEmail = strings.TrimSpace(cfg.ContactToEmail)
	}
	if fromEmail == "" || toEmail == "" {
		log.Printf("[contact] missing mail config: from set=%v to set=%v (set contactFromEmail/contactToEmail in admin Notifications or CONTACT_FROM_EMAIL/CONTACT_TO_EMAIL env)", fromEmail != "", toEmail != "")
		writeError(w, http.StatusServiceUnavailable, "We're unable to send your message from the website right now. Please try again later.")
		return
	}

	if h.email != nil && h.email.Enabled() {
		subjectLabel := contactSubjectLabels[req.Subject]
		h.emailContactSubmission(r.Context(), req.Name, req.Email, subjectLabel, req.Message)
	} else if err := h.sendContactEmail(r.Context(), fromEmail, toEmail, req); err != nil {
		var ae smithy.APIError
		if errors.As(err, &ae) {
			log.Printf("[contact] SES send failed: code=%s message=%s fault=%s from=%q to=%q visitorReplyTo=%q: %v",
				ae.ErrorCode(), ae.ErrorMessage(), ae.ErrorFault(), fromEmail, toEmail, req.Email, err)
		} else {
			log.Printf("[contact] SES send failed: from=%q to=%q visitorReplyTo=%q: %v", fromEmail, toEmail, req.Email, err)
		}
		if sesSendLooksLikeMissingOrUnverifiedIdentity(err) {
			region := strings.TrimSpace(os.Getenv("AWS_REGION"))
			if region == "" {
				region = "the same AWS region as this API"
			}
			writeError(w, http.StatusServiceUnavailable,
				"This store cannot send email yet: the sender address must be verified in Amazon SES. "+
					"In the AWS console open SES, choose region "+region+
					", then Identities → Create identity → Email address, verify the From address, and try again. "+
					"In SES sandbox, the inbox (To) address must also be verified if it is different from From.")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to send message; please try again later")
		return
	}

	subjectLabel := contactSubjectLabels[req.Subject]
	h.notifyContactSubmission(r.Context(), req.Name, subjectLabel)

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "message": "Message sent successfully"})
}

func (h *Handlers) sendContactEmail(ctx context.Context, from, to string, req ContactRequest) error {
	client, err := newSESv2Client(ctx)
	if err != nil {
		return fmt.Errorf("ses client: %w", err)
	}

	subjectLabel := contactSubjectLabels[req.Subject]
	subject := fmt.Sprintf("[Contact] %s — %s", subjectLabel, req.Name)

	textBody := fmt.Sprintf(
		"New contact form submission\n\nName: %s\nEmail: %s\nSubject: %s\n\nMessage:\n%s\n",
		req.Name, req.Email, subjectLabel, req.Message,
	)

	htmlBody := fmt.Sprintf(`<!doctype html><html><body style="font-family:'Google Sans',Roboto,Arial,sans-serif;background:#f7f7f7;padding:24px;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:24px;">
<h2 style="margin:0 0 16px;color:#222;">New contact form submission</h2>
<table style="font-size:14px;color:#333;width:100%%;">
<tr><td style="padding:6px 0;width:90px;color:#888;">Name</td><td style="padding:6px 0;">%s</td></tr>
<tr><td style="padding:6px 0;color:#888;">Email</td><td style="padding:6px 0;"><a href="mailto:%s">%s</a></td></tr>
<tr><td style="padding:6px 0;color:#888;">Subject</td><td style="padding:6px 0;">%s</td></tr>
</table>
<div style="margin-top:18px;padding:14px;background:#fafafa;border-left:3px solid #d9a441;border-radius:4px;color:#333;font-size:14px;line-height:1.5;white-space:pre-wrap;">%s</div>
</div></body></html>`,
		html.EscapeString(req.Name),
		html.EscapeString(req.Email), html.EscapeString(req.Email),
		html.EscapeString(subjectLabel),
		html.EscapeString(req.Message),
	)

	_, err = client.SendEmail(ctx, &sesv2.SendEmailInput{
		FromEmailAddress: aws.String(from),
		Destination: &sestypes.Destination{
			ToAddresses: []string{to},
		},
		ReplyToAddresses: []string{req.Email},
		Content: &sestypes.EmailContent{
			Simple: &sestypes.Message{
				Subject: &sestypes.Content{Data: aws.String(subject), Charset: aws.String("UTF-8")},
				Body: &sestypes.Body{
					Text: &sestypes.Content{Data: aws.String(textBody), Charset: aws.String("UTF-8")},
					Html: &sestypes.Content{Data: aws.String(htmlBody), Charset: aws.String("UTF-8")},
				},
			},
		},
	})
	return err
}

// sesSendLooksLikeMissingOrUnverifiedIdentity matches common SES v2 failures when
// no identity exists or From/To are not verified in this region (empty SES console).
func sesSendLooksLikeMissingOrUnverifiedIdentity(err error) bool {
	var ae smithy.APIError
	if !errors.As(err, &ae) {
		return false
	}
	msg := strings.ToLower(ae.ErrorMessage())
	switch ae.ErrorCode() {
	case "MessageRejected", "MailFromDomainNotVerified", "NotFoundException":
		return true
	case "BadRequestException":
		if strings.Contains(msg, "not verified") ||
			strings.Contains(msg, "not a verified") ||
			strings.Contains(msg, "identity") && strings.Contains(msg, "does not exist") {
			return true
		}
	}
	return strings.Contains(msg, "not verified") ||
		strings.Contains(msg, "not a verified identity") ||
		strings.Contains(msg, "email address is not verified")
}
