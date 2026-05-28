package freebie

import (
	"strings"
	"time"

	"shopreturngifts-api/internal/models"
)

const DefaultMinOrderAmount = 50

// MinOrderAmount returns the merchandise threshold for the free gift (default $50).
func MinOrderAmount(cfg *models.StoreConfig) float64 {
	if cfg == nil || cfg.FreebieMinOrderAmount <= 0 {
		return DefaultMinOrderAmount
	}
	return cfg.FreebieMinOrderAmount
}

func productID(cfg *models.StoreConfig) string {
	if cfg == nil {
		return ""
	}
	return strings.TrimSpace(cfg.FreebieProductID)
}

// PromotionConfigured is true when admin enabled the offer and picked a product.
func PromotionConfigured(cfg *models.StoreConfig) bool {
	return cfg != nil && cfg.FreebieEnabled && productID(cfg) != ""
}

// IsPromotionActive checks enabled flag, product, and optional start/end window.
func IsPromotionActive(cfg *models.StoreConfig, now time.Time) bool {
	if !PromotionConfigured(cfg) {
		return false
	}
	if t, ok := parseTime(cfg.FreebieStartsAt); ok && now.Before(t) {
		return false
	}
	if t, ok := parseTime(cfg.FreebieEndsAt); ok && now.After(t) {
		return false
	}
	return true
}

// IsEligible returns whether paid merchandise subtotal qualifies for the free item.
func IsEligible(paidSubtotal float64, cfg *models.StoreConfig, now time.Time) bool {
	if !IsPromotionActive(cfg, now) {
		return false
	}
	return paidSubtotal >= MinOrderAmount(cfg)
}

func parseTime(s string) (time.Time, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}, false
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t.UTC(), true
	}
	if t, err := time.Parse(time.RFC3339Nano, s); err == nil {
		return t.UTC(), true
	}
	return time.Time{}, false
}
