package email

import (
	"fmt"
	"html"
	"os"
	"strings"
	"time"
)

func WrapHTML(storeName, title, bodyHTML, actionURL, actionLabel string) string {
	storeName = html.EscapeString(strings.TrimSpace(storeName))
	if storeName == "" {
		storeName = "ShopReturnGifts"
	}
	title = html.EscapeString(strings.TrimSpace(title))
	logo := strings.TrimSpace(os.Getenv("EMAIL_LOGO_URL"))
	brand := fmt.Sprintf(`<p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#8a6a18;">%s</p>`, storeName)
	if logo != "" {
		brand = fmt.Sprintf(`<img src="%s" alt="%s" width="160" style="display:block;max-width:160px;height:auto;">`, html.EscapeString(logo), storeName)
	}
	action := ""
	if strings.TrimSpace(actionURL) != "" {
		label := html.EscapeString(strings.TrimSpace(actionLabel))
		if label == "" {
			label = "View details"
		}
		action = fmt.Sprintf(
			`<p style="margin:24px 0 0;"><a href="%s" style="display:inline-block;background:#d9a441;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600;">%s</a></p>`,
			html.EscapeString(actionURL),
			label,
		)
	}
	return fmt.Sprintf(`<!doctype html><html><body style="font-family:'Google Sans',Roboto,Arial,Helvetica,sans-serif;background:#f6f2ea;padding:24px;margin:0;">
<div style="max-width:580px;margin:0 auto;background:#fff;border-radius:16px;border:1px solid #eadfca;overflow:hidden;">
<div style="padding:22px 28px;border-bottom:1px solid #f0e6d3;background:#fffaf0;">%s</div>
<div style="padding:28px;">
<h1 style="margin:0 0 16px;font-size:20px;color:#1a1a1a;">%s</h1>
<div style="font-size:14px;line-height:1.6;color:#333;">%s</div>
%s
</div>
<div style="padding:18px 28px;background:#faf7f0;border-top:1px solid #f0e6d3;font-size:11px;line-height:1.5;color:#888;">
<p style="margin:0;">This is an automated message from %s.</p>
<p style="margin:8px 0 0;">&copy; %d %s. All rights reserved.</p>
</div>
</div></body></html>`, brand, title, bodyHTML, action, storeName, time.Now().UTC().Year(), storeName)
}

func PlainParagraph(s string) string {
	return html.EscapeString(strings.TrimSpace(s))
}
