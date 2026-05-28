package handlers

import (
	"context"
	"fmt"
	"log"
	"strings"

	"shopreturngifts-api/internal/models"
)

func customerOrderLink(orderID string) string {
	return "/orders/" + strings.TrimPrefix(orderID, "ORDER#")
}

func adminOrdersLink() string {
	return "/admin/orders"
}

func (h *Handlers) notifyUser(ctx context.Context, userID, title, body, typ, link string) {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return
	}
	n := &models.Notification{
		UserID: userID,
		Title:  strings.TrimSpace(title),
		Body:   strings.TrimSpace(body),
		Type:   typ,
		Link:   strings.TrimSpace(link),
	}
	if n.Title == "" {
		return
	}
	if n.Type == "" {
		n.Type = "system"
	}
	if err := h.db.CreateNotification(ctx, n); err != nil {
		log.Printf("notification create failed (user=%s): %v", userID, err)
	}
}

func (h *Handlers) notifyAdmins(ctx context.Context, title, body, typ, link string) {
	ids, err := h.db.ListActiveAdminUserIDs(ctx)
	if err != nil {
		log.Printf("list admin users for notifications: %v", err)
		return
	}
	for _, id := range ids {
		h.notifyUser(ctx, id, title, body, typ, link)
	}
}

func (h *Handlers) notifyOrderCreated(ctx context.Context, order *models.Order) {
	if order == nil {
		return
	}
	num := order.OrderNumber
	if num == "" {
		num = order.OrderID
	}
	h.notifyUser(ctx, order.UserID,
		"Complete your payment",
		fmt.Sprintf("Order %s is ready — finish checkout to confirm your order.", num),
		"order",
		customerOrderLink(order.OrderID),
	)
	h.notifyAdmins(ctx,
		"New order awaiting payment",
		fmt.Sprintf("Order %s was placed and is waiting for payment.", num),
		"order",
		adminOrdersLink(),
	)
	h.emailOrderPlaced(ctx, order)
}

func (h *Handlers) notifyOrderPaid(ctx context.Context, order *models.Order) {
	if order == nil {
		return
	}
	num := order.OrderNumber
	if num == "" {
		num = order.OrderID
	}
	h.notifyUser(ctx, order.UserID,
		"Payment received",
		fmt.Sprintf("Thanks! Your payment for order %s was successful. We're preparing your items.", num),
		"order",
		customerOrderLink(order.OrderID),
	)
	h.notifyAdmins(ctx,
		"Order paid",
		fmt.Sprintf("Order %s has been paid and is ready to process.", num),
		"order",
		adminOrdersLink(),
	)
	h.emailOrderPaid(ctx, order)
}

func (h *Handlers) notifyOrderStatus(ctx context.Context, order *models.Order, status string) {
	if order == nil {
		return
	}
	num := order.OrderNumber
	if num == "" {
		num = order.OrderID
	}
	var title, body string
	switch status {
	case "Processing":
		title = "Order is being prepared"
		body = fmt.Sprintf("We're packing order %s now.", num)
	case "Shipped":
		title = "Order shipped"
		body = fmt.Sprintf("Great news — order %s is on its way!", num)
	case "Delivered":
		title = "Order delivered"
		body = fmt.Sprintf("Order %s has been marked as delivered. Enjoy!", num)
	case "Cancelled":
		title = "Order cancelled"
		body = fmt.Sprintf("Order %s was cancelled.", num)
		if reason := strings.TrimSpace(order.CancelReason); reason != "" {
			body += " Reason: " + reason
		}
	case "Failed":
		title = "Payment failed"
		body = fmt.Sprintf("We couldn't process payment for order %s. Please try again or contact support.", num)
	default:
		return
	}
	h.notifyUser(ctx, order.UserID, title, body, "order", customerOrderLink(order.OrderID))
	h.emailOrderStatus(ctx, order, status)
}

func (h *Handlers) notifyOrderCancelledByCustomer(ctx context.Context, order *models.Order) {
	if order == nil {
		return
	}
	num := order.OrderNumber
	if num == "" {
		num = order.OrderID
	}
	h.notifyUser(ctx, order.UserID,
		"Order cancelled",
		fmt.Sprintf("You cancelled order %s.", num),
		"order",
		customerOrderLink(order.OrderID),
	)
	h.notifyAdmins(ctx,
		"Order cancelled by customer",
		fmt.Sprintf("Customer cancelled order %s.", num),
		"order",
		adminOrdersLink(),
	)
	h.emailOrderCancelled(ctx, order, true)
}

func (h *Handlers) notifyOrderRefunded(ctx context.Context, order *models.Order, partial bool) {
	if order == nil {
		return
	}
	num := order.OrderNumber
	if num == "" {
		num = order.OrderID
	}
	title := "Refund issued"
	body := fmt.Sprintf("A refund has been processed for order %s.", num)
	if partial {
		title = "Partial refund issued"
		body = fmt.Sprintf("A partial refund has been processed for order %s.", num)
	}
	h.notifyUser(ctx, order.UserID, title, body, "order", customerOrderLink(order.OrderID))
	h.emailOrderRefunded(ctx, order, partial)
}

func (h *Handlers) notifyContactSubmission(ctx context.Context, name, subject string) {
	h.notifyAdmins(ctx,
		"New contact message",
		fmt.Sprintf("%s sent a %s inquiry via the contact form.", strings.TrimSpace(name), subject),
		"contact",
		"/contact",
	)
}
