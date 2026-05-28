package coupons

import (
	"math"
	"strings"

	"shopreturngifts-api/internal/models"
)

const (
	TypePercent = "percent"
	TypeFlat    = "flat"
)

// FlatRedemption breaks down how a flat-dollar coupon applies to merchandise + shipping.
type FlatRedemption struct {
	FaceValue           float64 // coupon face value (e.g. $20)
	Applied             float64 // dollars taken off this order (merchandise + shipping)
	Unused              float64 // face value not used on this order (forfeited on one-time use)
	MerchandiseDiscount float64
	ShippingDiscount    float64
}

// IsFlat reports whether the coupon deducts a fixed dollar amount.
func IsFlat(c *models.Coupon) bool {
	if c == nil {
		return false
	}
	if strings.EqualFold(strings.TrimSpace(c.DiscountType), TypeFlat) {
		return true
	}
	return c.DiscountAmount > 0 && c.DiscountPercent <= 0
}

// FlatRedemptionForOrder applies a flat coupon to merchandise subtotal plus shipping fee.
func FlatRedemptionForOrder(merchandiseSubtotal, shippingFee float64, c *models.Coupon) FlatRedemption {
	out := FlatRedemption{}
	if c == nil || !IsFlat(c) {
		return out
	}
	out.FaceValue = c.DiscountAmount
	if out.FaceValue <= 0 || merchandiseSubtotal < 0 || shippingFee < 0 {
		return out
	}
	eligible := merchandiseSubtotal + shippingFee
	if eligible <= 0 {
		out.Unused = out.FaceValue
		return out
	}
	out.Applied = out.FaceValue
	if out.Applied > eligible {
		out.Applied = eligible
	}
	out.Unused = out.FaceValue - out.Applied
	out.MerchandiseDiscount = out.Applied
	if out.MerchandiseDiscount > merchandiseSubtotal {
		out.MerchandiseDiscount = merchandiseSubtotal
	}
	out.ShippingDiscount = out.Applied - out.MerchandiseDiscount
	return out
}

// DiscountAmount returns the dollar discount applied on this order.
// For flat coupons, pass shippingFee so delivery can be covered (see FlatRedemptionForOrder).
func DiscountAmount(merchandiseSubtotal, shippingFee float64, c *models.Coupon) float64 {
	if c == nil {
		return 0
	}
	if IsFlat(c) {
		return FlatRedemptionForOrder(merchandiseSubtotal, shippingFee, c).Applied
	}
	if merchandiseSubtotal <= 0 || c.DiscountPercent <= 0 {
		return 0
	}
	return merchandiseSubtotal * c.DiscountPercent / 100
}

// BetterCoupon returns the coupon that saves more on the given order amounts.
func BetterCoupon(merchandiseSubtotal, shippingFee float64, a, b *models.Coupon) *models.Coupon {
	if a == nil {
		return b
	}
	if b == nil {
		return a
	}
	if DiscountAmount(merchandiseSubtotal, shippingFee, b) > DiscountAmount(merchandiseSubtotal, shippingFee, a) {
		return b
	}
	return a
}

// NormalizeCreate ensures discount fields are consistent before persistence.
func NormalizeCreate(c *models.Coupon) error {
	if c == nil {
		return nil
	}
	c.DiscountType = strings.ToLower(strings.TrimSpace(c.DiscountType))
	if c.DiscountType == TypeFlat {
		c.DiscountPercent = 0
		if c.DiscountAmount <= 0 {
			return errInvalidFlat
		}
		return nil
	}
	c.DiscountType = TypePercent
	c.DiscountAmount = 0
	if c.DiscountPercent <= 0 || c.DiscountPercent > 100 {
		return errInvalidPercent
	}
	return nil
}

type simpleError string

func (e simpleError) Error() string { return string(e) }

const (
	errInvalidFlat    = simpleError("flat discount amount must be greater than zero")
	errInvalidPercent = simpleError("discount percent must be between 1 and 100")
)

// RoundMoney rounds to cents for comparisons.
func RoundMoney(v float64) float64 {
	return math.Round(v*100) / 100
}
