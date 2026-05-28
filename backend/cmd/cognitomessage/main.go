package main

import (
	"context"
	"fmt"
	"html"
	"os"
	"strings"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
)

const storeName = "ShopReturnGifts"

func handler(ctx context.Context, event events.CognitoEventUserPoolsCustomMessage) (events.CognitoEventUserPoolsCustomMessage, error) {
	code := strings.TrimSpace(event.Request.CodeParameter)
	if code == "" {
		code = "{####}"
	}
	username := strings.TrimSpace(event.Request.UsernameParameter)
	if username == "" {
		username = strings.TrimSpace(event.UserName)
	}

	title, intro, subject := messageCopy(event.TriggerSource)
	if event.TriggerSource == "CustomMessage_AdminCreateUser" {
		event.Response.EmailSubject = storeName + " account invitation"
		event.Response.EmailMessage = adminInviteHTML(username, code)
		return event, nil
	}

	event.Response.EmailSubject = subject
	event.Response.EmailMessage = codeHTML(title, intro, code)
	return event, nil
}

func messageCopy(trigger string) (title, intro, subject string) {
	switch trigger {
	case "CustomMessage_ForgotPassword":
		return "Reset your password", "Use this code to reset your ShopReturnGifts password.", storeName + " password reset code"
	case "CustomMessage_ResendCode":
		return "Verify your email", "Here is your new ShopReturnGifts verification code.", storeName + " verification code"
	default:
		return "Verify your email", "Welcome to ShopReturnGifts. Use this code to finish creating your account.", storeName + " verification code"
	}
}

func codeHTML(title, intro, code string) string {
	body := fmt.Sprintf(
		`<p style="margin:0 0 16px;">%s</p>
<div style="margin:24px 0;padding:18px 20px;border:1px solid #e8d6a8;background:#fff8e6;border-radius:12px;text-align:center;">
  <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#8a6a18;">Verification code</p>
  <p style="margin:0;font-size:30px;line-height:1.2;font-weight:700;letter-spacing:0.16em;color:#1f2937;">%s</p>
</div>
<p style="margin:0;">This code expires soon. If you did not request this email, you can safely ignore it.</p>`,
		html.EscapeString(intro),
		html.EscapeString(code),
	)
	return wrapHTML(title, body)
}

func adminInviteHTML(username, tempPassword string) string {
	body := fmt.Sprintf(
		`<p style="margin:0 0 16px;">An account was created for you at ShopReturnGifts.</p>
<p style="margin:0 0 8px;"><strong>Username:</strong> %s</p>
<p style="margin:0 0 16px;"><strong>Temporary password:</strong> %s</p>
<p style="margin:0;">Sign in and set a new password when prompted.</p>`,
		html.EscapeString(username),
		html.EscapeString(tempPassword),
	)
	return wrapHTML("Your ShopReturnGifts account is ready", body)
}

func wrapHTML(title, bodyHTML string) string {
	logo := strings.TrimSpace(os.Getenv("EMAIL_LOGO_URL"))
	site := strings.TrimRight(strings.TrimSpace(os.Getenv("WEBSITE_URL")), "/")
	brand := `<div style="font-size:22px;font-weight:800;letter-spacing:0.02em;color:#1f2937;">ShopReturnGifts</div>`
	if logo != "" {
		brand = fmt.Sprintf(`<img src="%s" alt="ShopReturnGifts" width="160" style="display:block;max-width:160px;height:auto;">`, html.EscapeString(logo))
	}
	year := time.Now().UTC().Year()
	siteLink := ""
	if site != "" {
		siteLink = fmt.Sprintf(`<p style="margin:8px 0 0;"><a href="%s" style="color:#8a6a18;text-decoration:none;">Visit ShopReturnGifts</a></p>`, html.EscapeString(site))
	}

	return fmt.Sprintf(`<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f2ea;font-family:'Google Sans',Roboto,Arial,Helvetica,sans-serif;color:#1f2937;">
    <div style="max-width:600px;margin:0 auto;padding:28px 16px;">
      <div style="background:#ffffff;border:1px solid #eadfca;border-radius:18px;overflow:hidden;">
        <div style="padding:24px 28px;border-bottom:1px solid #f0e6d3;background:#fffaf0;">%s</div>
        <div style="padding:28px;">
          <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;color:#111827;">%s</h1>
          <div style="font-size:15px;line-height:1.65;color:#374151;">%s</div>
        </div>
        <div style="padding:20px 28px;background:#faf7f0;border-top:1px solid #f0e6d3;font-size:12px;line-height:1.5;color:#6b7280;">
          <p style="margin:0;">This is an automated security email from ShopReturnGifts.</p>
          %s
          <p style="margin:12px 0 0;">&copy; %d ShopReturnGifts. All rights reserved.</p>
        </div>
      </div>
    </div>
  </body>
</html>`, brand, html.EscapeString(title), bodyHTML, siteLink, year)
}

func main() {
	lambda.Start(handler)
}
