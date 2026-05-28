package handlers

import (
	"context"
	"fmt"
	"html"
	"log"
	"os"
	"strings"

	"shopreturngifts-api/internal/email"
	"shopreturngifts-api/internal/models"
)

func siteURL() string {
	if u := strings.TrimSpace(os.Getenv("WEBSITE_URL")); u != "" {
		return strings.TrimRight(u, "/")
	}
	d := strings.TrimSpace(os.Getenv("FRONTEND_DOMAIN"))
	if d != "" && d != "*" && !strings.HasPrefix(d, "http") {
		return "https://" + d
	}
	if strings.HasPrefix(d, "http") {
		return strings.TrimRight(d, "/")
	}
	return ""
}

func (h *Handlers) publishEmail(ctx context.Context, msg email.Message) {
	if h.email == nil || !h.email.Enabled() {
		return
	}
	if err := h.email.Publish(ctx, msg); err != nil {
		log.Printf("email SNS publish failed event=%s audience=%s: %v", msg.Event, msg.Audience, err)
	}
}

// publishToCustomer sends only to the order/account holder — never to admin inboxes.
func (h *Handlers) publishToCustomer(ctx context.Context, order *models.Order, msg email.Message) {
	customer := h.customerEmailForOrder(ctx, order)
	if customer == "" {
		return
	}
	msg.Audience = email.AudienceCustomer
	msg.To = []string{customer}
	h.publishEmail(ctx, msg)
}

// publishToAdmins sends one SNS message per admin address (store inbox + admin users + alert list).
func (h *Handlers) publishToAdmins(ctx context.Context, msg email.Message) {
	msg.Audience = email.AudienceAdmin
	for _, addr := range h.adminEmails(ctx) {
		msg.To = []string{addr}
		h.publishEmail(ctx, msg)
	}
}

// publishToAdminInbox sends only to the configured store inbox (contact form, etc.).
func (h *Handlers) publishToAdminInbox(ctx context.Context, msg email.Message) {
	_, _, inbox := h.mailConfig(ctx)
	inbox = strings.TrimSpace(inbox)
	if inbox == "" || !strings.Contains(inbox, "@") {
		return
	}
	msg.Audience = email.AudienceAdmin
	msg.To = []string{inbox}
	h.publishEmail(ctx, msg)
}

// publishToAdminAddresses sends to an explicit admin-side list (e.g. stock alert emails from config).
func (h *Handlers) publishToAdminAddresses(ctx context.Context, addresses []string, msg email.Message) {
	msg.Audience = email.AudienceAdmin
	for _, addr := range addresses {
		addr = strings.TrimSpace(addr)
		if addr == "" || !strings.Contains(addr, "@") {
			continue
		}
		msg.To = []string{addr}
		h.publishEmail(ctx, msg)
	}
}

func (h *Handlers) customerEmailForOrder(ctx context.Context, order *models.Order) string {
	if order == nil {
		return ""
	}
	return h.userEmail(ctx, order.UserID, order.UserEmail)
}

func (h *Handlers) mailConfig(ctx context.Context) (storeName, fromEmail, adminInbox string) {
	storeName = "ShopReturnGifts"
	cfg, err := h.db.GetConfig(ctx)
	if err == nil && cfg != nil {
		if s := strings.TrimSpace(cfg.StoreName); s != "" {
			storeName = s
		}
		if s := strings.TrimSpace(cfg.ContactFromEmail); s != "" {
			fromEmail = s
		}
		if s := strings.TrimSpace(cfg.ContactToEmail); s != "" {
			adminInbox = s
		}
	}
	if fromEmail == "" {
		fromEmail = strings.TrimSpace(os.Getenv("CONTACT_FROM_EMAIL"))
	}
	if adminInbox == "" {
		adminInbox = strings.TrimSpace(os.Getenv("CONTACT_TO_EMAIL"))
	}
	return storeName, fromEmail, adminInbox
}

func (h *Handlers) userEmail(ctx context.Context, userID, fallback string) string {
	if e := strings.TrimSpace(fallback); e != "" {
		return e
	}
	if userID == "" {
		return ""
	}
	u, err := h.db.GetUser(ctx, userID)
	if err != nil || u == nil {
		return ""
	}
	return strings.TrimSpace(u.Email)
}

func (h *Handlers) adminEmails(ctx context.Context) []string {
	var out []string
	seen := map[string]bool{}

	add := func(e string) {
		e = strings.TrimSpace(e)
		if e == "" || !strings.Contains(e, "@") {
			return
		}
		key := strings.ToLower(e)
		if seen[key] {
			return
		}
		seen[key] = true
		out = append(out, e)
	}

	_, _, adminInbox := h.mailConfig(ctx)
	add(adminInbox)

	cfg, _ := h.db.GetConfig(ctx)
	if cfg != nil {
		for _, e := range strings.Split(cfg.LowStockAlertEmails, ",") {
			add(e)
		}
	}

	users, err := h.db.GetUsers(ctx)
	if err == nil {
		for _, u := range users.Items {
			if u.IsActive && strings.EqualFold(strings.TrimSpace(u.Role), "admin") {
				add(u.Email)
			}
		}
	}
	return out
}

func orderEmailContext(order *models.Order) (num string, total string) {
	if order == nil {
		return "", ""
	}
	num = strings.TrimSpace(order.OrderNumber)
	if num == "" {
		num = order.OrderID
	}
	cur := strings.TrimSpace(order.Currency)
	if cur == "" {
		cur = "USD"
	}
	total = formatMoney(cur, order.Total)
	return num, total
}

func (h *Handlers) emailOrderPlaced(ctx context.Context, order *models.Order) {
	if order == nil {
		return
	}
	storeName, from, _ := h.mailConfig(ctx)
	num, total := orderEmailContext(order)
	link := siteURL() + customerOrderLink(order.OrderID)

	body := fmt.Sprintf("Your order %s is ready. Complete payment to confirm. Order total: %s.", num, total)
	h.publishToCustomer(ctx, order, email.Message{
		Event:     email.EventOrderPlaced,
		Subject:   fmt.Sprintf("[%s] Complete payment for order %s", storeName, num),
		TextBody:  body + "\n\n" + link,
		HTMLBody:  email.WrapHTML(storeName, "Complete your payment", email.PlainParagraph(body), link, "Finish checkout"),
		FromEmail: from,
		StoreName: storeName,
	})

	adminBody := fmt.Sprintf("Order %s was placed and is awaiting payment. Customer total: %s.", num, total)
	h.publishToAdmins(ctx, email.Message{
		Event:     email.EventOrderPlaced,
		Subject:   fmt.Sprintf("[%s] New order %s — awaiting payment", storeName, num),
		TextBody:  adminBody + "\n\n" + siteURL() + adminOrdersLink(),
		HTMLBody:  email.WrapHTML(storeName, "New order awaiting payment", email.PlainParagraph(adminBody), siteURL()+adminOrdersLink(), "View in admin"),
		FromEmail: from,
		StoreName: storeName,
	})
}

func (h *Handlers) emailOrderPaid(ctx context.Context, order *models.Order) {
	if order == nil {
		return
	}
	storeName, from, _ := h.mailConfig(ctx)
	num, total := orderEmailContext(order)
	link := siteURL() + customerOrderLink(order.OrderID)

	custBody := fmt.Sprintf("Payment of %s for order %s was successful. We're preparing your order.", total, num)
	if strings.TrimSpace(order.InvoiceS3Key) != "" {
		custBody += " Your invoice is available from your order details."
	}
	h.publishToCustomer(ctx, order, email.Message{
		Event:     email.EventPaymentConfirmation,
		Subject:   fmt.Sprintf("[%s] Payment confirmed — order %s", storeName, num),
		TextBody:  custBody + "\n\n" + link,
		HTMLBody:  email.WrapHTML(storeName, "Payment received", email.PlainParagraph(custBody), link, "View order"),
		FromEmail: from,
		StoreName: storeName,
	})

	adminBody := fmt.Sprintf("Order %s has been paid (%s) and is ready to process.", num, total)
	h.publishToAdmins(ctx, email.Message{
		Event:     email.EventOrderPaid,
		Subject:   fmt.Sprintf("[%s] Order %s paid", storeName, num),
		TextBody:  adminBody,
		HTMLBody:  email.WrapHTML(storeName, "Order paid", email.PlainParagraph(adminBody), siteURL()+adminOrdersLink(), "Open orders"),
		FromEmail: from,
		StoreName: storeName,
	})
}

func (h *Handlers) emailOrderStatus(ctx context.Context, order *models.Order, status string) {
	if order == nil {
		return
	}
	var title, body string
	num, _ := orderEmailContext(order)
	switch status {
	case "Processing":
		title = "Order is being prepared"
		body = fmt.Sprintf("We're packing order %s now.", num)
	case "Shipped":
		title = "Order shipped"
		body = fmt.Sprintf("Order %s is on its way!", num)
		if t := strings.TrimSpace(order.TrackingNumber); t != "" {
			body += " Tracking: " + t
		}
	case "Delivered":
		title = "Order delivered"
		body = fmt.Sprintf("Order %s has been delivered. Enjoy!", num)
	case "Cancelled":
		title = "Order cancelled"
		body = fmt.Sprintf("Order %s was cancelled.", num)
		if reason := strings.TrimSpace(order.CancelReason); reason != "" {
			body += " Reason: " + reason
		}
	case "Failed":
		title = "Payment failed"
		body = fmt.Sprintf("We couldn't process payment for order %s. Please try again.", num)
	default:
		return
	}

	storeName, from, _ := h.mailConfig(ctx)
	link := siteURL() + customerOrderLink(order.OrderID)
	h.publishToCustomer(ctx, order, email.Message{
		Event:     email.EventOrderStatus,
		Subject:   fmt.Sprintf("[%s] %s — order %s", storeName, title, num),
		TextBody:  body + "\n\n" + link,
		HTMLBody:  email.WrapHTML(storeName, title, email.PlainParagraph(body), link, "View order"),
		FromEmail: from,
		StoreName: storeName,
	})
}

func (h *Handlers) emailOrderCancelled(ctx context.Context, order *models.Order, byCustomer bool) {
	if order == nil {
		return
	}
	storeName, from, _ := h.mailConfig(ctx)
	num, _ := orderEmailContext(order)
	link := siteURL() + customerOrderLink(order.OrderID)

	cancelBody := fmt.Sprintf("Order %s was cancelled.", num)
	h.publishToCustomer(ctx, order, email.Message{
		Event:     email.EventOrderCancelled,
		Subject:   fmt.Sprintf("[%s] Order %s cancelled", storeName, num),
		TextBody:  cancelBody,
		HTMLBody:  email.WrapHTML(storeName, "Order cancelled", email.PlainParagraph(cancelBody), link, "View order"),
		FromEmail: from,
		StoreName: storeName,
	})

	if byCustomer {
		adminBody := fmt.Sprintf("Customer cancelled order %s.", num)
		h.publishToAdmins(ctx, email.Message{
			Event:     email.EventAdminNotification,
			Subject:   fmt.Sprintf("[%s] Order %s cancelled by customer", storeName, num),
			TextBody:  adminBody,
			HTMLBody:  email.WrapHTML(storeName, "Order cancelled", email.PlainParagraph(adminBody), siteURL()+adminOrdersLink(), "Admin orders"),
			FromEmail: from,
			StoreName: storeName,
		})
	}
}

func (h *Handlers) emailOrderRefunded(ctx context.Context, order *models.Order, partial bool) {
	if order == nil {
		return
	}
	storeName, from, _ := h.mailConfig(ctx)
	num, _ := orderEmailContext(order)
	title := "Refund issued"
	body := fmt.Sprintf("A refund has been processed for order %s.", num)
	if partial {
		title = "Partial refund issued"
		body = fmt.Sprintf("A partial refund has been processed for order %s.", num)
	}
	link := siteURL() + customerOrderLink(order.OrderID)
	h.publishToCustomer(ctx, order, email.Message{
		Event:     email.EventOrderRefunded,
		Subject:   fmt.Sprintf("[%s] %s — order %s", storeName, title, num),
		TextBody:  body,
		HTMLBody:  email.WrapHTML(storeName, title, email.PlainParagraph(body), link, "View order"),
		FromEmail: from,
		StoreName: storeName,
	})
}

func (h *Handlers) emailContactSubmission(ctx context.Context, name, visitorEmail, subjectLabel, message string) {
	storeName, from, adminInbox := h.mailConfig(ctx)
	if adminInbox == "" {
		return
	}
	textBody := fmt.Sprintf("New contact form submission\n\nName: %s\nEmail: %s\nSubject: %s\n\nMessage:\n%s\n", name, visitorEmail, subjectLabel, message)
	htmlBody := fmt.Sprintf(`<p><strong>%s</strong> sent a message.</p>
<p><strong>Subject:</strong> %s<br/><strong>Email:</strong> <a href="mailto:%s">%s</a></p>
<div style="margin-top:12px;padding:12px;background:#fafafa;border-left:3px solid #d9a441;white-space:pre-wrap;">%s</div>`,
		html.EscapeString(name), html.EscapeString(subjectLabel),
		html.EscapeString(visitorEmail), html.EscapeString(visitorEmail),
		html.EscapeString(message))

	h.publishToAdminInbox(ctx, email.Message{
		Event:     email.EventContactSubmission,
		Subject:   fmt.Sprintf("[%s] Contact: %s — %s", storeName, subjectLabel, name),
		TextBody:  textBody,
		HTMLBody:  email.WrapHTML(storeName, "New contact message", htmlBody, "", ""),
		FromEmail: from,
		ReplyTo:   []string{visitorEmail},
		StoreName: storeName,
	})
}

func (h *Handlers) emailRewardEarned(ctx context.Context, order *models.Order, points int64) {
	if order == nil || points <= 0 {
		return
	}
	storeName, from, _ := h.mailConfig(ctx)
	num, _ := orderEmailContext(order)
	body := fmt.Sprintf("You earned %d reward points from order %s. Points are pending until your eligibility period ends.", points, num)
	link := siteURL() + "/profile"
	h.publishToCustomer(ctx, order, email.Message{
		Event:     email.EventRewardEarned,
		Subject:   fmt.Sprintf("[%s] You earned %d reward points", storeName, points),
		TextBody:  body,
		HTMLBody:  email.WrapHTML(storeName, "Rewards earned", email.PlainParagraph(body), link, "View rewards"),
		FromEmail: from,
		StoreName: storeName,
	})
}

func (h *Handlers) emailRewardRedeemed(ctx context.Context, order *models.Order, points int64) {
	if order == nil || points <= 0 {
		return
	}
	storeName, from, _ := h.mailConfig(ctx)
	num, _ := orderEmailContext(order)
	body := fmt.Sprintf("You redeemed %d reward points on order %s.", points, num)
	link := siteURL() + "/profile"
	h.publishToCustomer(ctx, order, email.Message{
		Event:     email.EventRewardRedeemed,
		Subject:   fmt.Sprintf("[%s] Reward points redeemed", storeName),
		TextBody:  body,
		HTMLBody:  email.WrapHTML(storeName, "Rewards redeemed", email.PlainParagraph(body), link, "View rewards"),
		FromEmail: from,
		StoreName: storeName,
	})
}

func (h *Handlers) emailPromotionAdmin(ctx context.Context, headline, detail string) {
	storeName, from, _ := h.mailConfig(ctx)
	h.publishToAdmins(ctx, email.Message{
		Event:     email.EventPromotion,
		Subject:   fmt.Sprintf("[%s] Promotion update", storeName),
		TextBody:  detail,
		HTMLBody:  email.WrapHTML(storeName, headline, email.PlainParagraph(detail), siteURL()+"/admin", "Open admin"),
		FromEmail: from,
		StoreName: storeName,
	})
}
