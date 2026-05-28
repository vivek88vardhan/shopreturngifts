package shipping

import "shopreturngifts-api/internal/models"

const (
	DefaultFreeShippingMin = 50.0
	DefaultShippingFee     = 4.99
)

// Defaults returns the effective free-shipping threshold and flat shipping fee.
// Zero or negative stored values mean "use default" for that field.
func Defaults(cfg *models.StoreConfig) (minOrder, fee float64) {
	minOrder, fee = DefaultFreeShippingMin, DefaultShippingFee
	if cfg == nil {
		return minOrder, fee
	}
	if cfg.FreeShippingMinOrderAmount > 0 {
		minOrder = cfg.FreeShippingMinOrderAmount
	}
	if cfg.ShippingFee > 0 {
		fee = cfg.ShippingFee
	}
	return minOrder, fee
}

// Fee returns the flat delivery charge on merchandise subtotal (after coupon).
// This amount is added to the order total but is not included in the tax base.
func Fee(merchandiseSubtotal float64, cfg *models.StoreConfig) float64 {
	minOrder, flatFee := Defaults(cfg)
	if merchandiseSubtotal >= minOrder {
		return 0
	}
	return flatFee
}
