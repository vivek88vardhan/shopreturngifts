package email

// Event types published to SNS for transactional email delivery.
const (
	EventOrderPlaced           = "order_placed"
	EventOrderPaid             = "order_paid"
	EventPaymentConfirmation   = "payment_confirmation"
	EventOrderStatus           = "order_status"
	EventOrderCancelled        = "order_cancelled"
	EventOrderRefunded         = "order_refunded"
	EventAdminNotification     = "admin_notification"
	EventContactSubmission     = "contact_submission"
	EventPromotion             = "promotion"
	EventRewardEarned          = "reward_earned"
	EventRewardRedeemed        = "reward_redeemed"
	EventLowStockAlert         = "low_stock_alert"
)

// Audience distinguishes customer-facing mail from store/admin mail.
const (
	AudienceCustomer = "customer"
	AudienceAdmin    = "admin"
)

// Message is the JSON payload published to the email SNS topic.
type Message struct {
	Event      string   `json:"event"`
	Audience   string   `json:"audience,omitempty"` // customer | admin
	To         []string `json:"to"`
	Subject    string   `json:"subject"`
	TextBody   string   `json:"textBody"`
	HTMLBody   string   `json:"htmlBody,omitempty"`
	FromEmail  string   `json:"fromEmail,omitempty"`
	ReplyTo    []string `json:"replyTo,omitempty"`
	StoreName  string   `json:"storeName,omitempty"`
}
