package handlers

import (
	"context"
	"fmt"
	"html"
	"net/http"
	"os"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/sesv2"
	sestypes "github.com/aws/aws-sdk-go-v2/service/sesv2/types"

	"shopreturngifts-api/internal/email"
	"shopreturngifts-api/internal/models"
)

func sendStockAlertSES(ctx context.Context, client *sesv2.Client, from, to, subject, textBody, htmlBody string) error {
	_, err := client.SendEmail(ctx, &sesv2.SendEmailInput{
		FromEmailAddress: aws.String(from),
		Destination: &sestypes.Destination{
			ToAddresses: []string{to},
		},
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

func parseAlertEmailList(raw string) []string {
	var out []string
	for _, part := range strings.Split(raw, ",") {
		e := strings.TrimSpace(part)
		if e == "" || !strings.Contains(e, "@") {
			continue
		}
		out = append(out, e)
	}
	return out
}

// AdminSendLowStockAlert emails the configured comma-separated addresses a summary of products at/below the low-stock threshold.
func (h *Handlers) AdminSendLowStockAlert(w http.ResponseWriter, r *http.Request) {
	cfg, err := h.db.GetConfig(r.Context())
	if err != nil || cfg == nil {
		writeError(w, http.StatusInternalServerError, "failed to load store configuration")
		return
	}
	recipients := parseAlertEmailList(cfg.LowStockAlertEmails)
	if len(recipients) == 0 {
		writeError(w, http.StatusBadRequest, "no stock alert email addresses configured (comma-separated list in Stock Alert Settings)")
		return
	}

	fromEmail := strings.TrimSpace(cfg.ContactFromEmail)
	if fromEmail == "" {
		fromEmail = strings.TrimSpace(os.Getenv("CONTACT_FROM_EMAIL"))
	}
	if fromEmail == "" {
		writeError(w, http.StatusServiceUnavailable, "no verified sender: set Contact from email in Store Configuration (Notifications or Config) or CONTACT_FROM_EMAIL in the environment")
		return
	}

	list, err := h.db.GetProducts(r.Context(), "", "", 0)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	threshold := cfg.LowStockThreshold
	if threshold <= 0 {
		threshold = 10
	}
	var low []models.Product
	for _, p := range list.Items {
		if p.IsActive && p.Stock <= threshold {
			low = append(low, p)
		}
	}

	var lines []string
	for _, p := range low {
		lines = append(lines, fmt.Sprintf("- %s (%s) — stock %d", p.Name, p.ProductID, p.Stock))
	}
	if len(lines) == 0 {
		lines = []string{"(No products are currently at or below the threshold.)"}
	}

	subject := fmt.Sprintf("[%s] Low stock alert (%d items)", strings.TrimSpace(cfg.StoreName), len(low))
	textBody := fmt.Sprintf("Low stock threshold: ≤ %d units\n\n%s\n", threshold, strings.Join(lines, "\n"))
	htmlRows := ""
	for _, p := range low {
		htmlRows += fmt.Sprintf("<tr><td style=\"padding:6px 8px;\">%s</td><td style=\"padding:6px 8px;\">%s</td><td style=\"padding:6px 8px;\">%d</td></tr>",
			html.EscapeString(p.Name), html.EscapeString(p.ProductID), p.Stock)
	}
	if htmlRows == "" {
		htmlRows = "<tr><td colspan=\"3\" style=\"padding:12px;\">No products at or below threshold.</td></tr>"
	}
	htmlBody := fmt.Sprintf(`<!doctype html><html><body style="font-family:'Google Sans',Roboto,Arial,sans-serif;background:#f7f7f7;padding:24px;">
<div style="max-width:640px;margin:0 auto;background:#fff;border-radius:8px;padding:24px;">
<h2 style="margin:0 0 12px;">Low stock alert</h2>
<p style="color:#555;font-size:14px;">Threshold: ≤ %d units</p>
<table style="width:100%%;border-collapse:collapse;font-size:14px;margin-top:12px;">
<thead><tr style="background:#f0f0f0;text-align:left;"><th style="padding:8px;">Product</th><th style="padding:8px;">ID</th><th style="padding:8px;">Stock</th></tr></thead>
<tbody>%s</tbody>
</table>
</div></body></html>`, threshold, htmlRows)

	storeName := strings.TrimSpace(cfg.StoreName)
	if storeName == "" {
		storeName = "ShopReturnGifts"
	}

	if h.email != nil && h.email.Enabled() {
		h.publishToAdminAddresses(r.Context(), recipients, email.Message{
			Event:     email.EventLowStockAlert,
			Subject:   subject,
			TextBody:  textBody,
			HTMLBody:  htmlBody,
			FromEmail: fromEmail,
			StoreName: storeName,
		})
	} else {
		client, err := newSESv2Client(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to load AWS config")
			return
		}
		for _, to := range recipients {
			if err := sendStockAlertSES(r.Context(), client, fromEmail, to, subject, textBody, htmlBody); err != nil {
				writeError(w, http.StatusInternalServerError, fmt.Sprintf("failed to send to %s", to))
				return
			}
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"sent":     len(recipients),
		"products": len(low),
	})
}
