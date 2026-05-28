package orderlimits

import (
	"math"

	"shopreturngifts-api/internal/models"
)

// MaxQtyPerProduct returns the per-line quantity cap for a single SKU in one order.
// The value is always sourced from the DynamoDB store config (StoreConfig.MaxQtyPerProduct).
// When that field is 0 or absent the function returns math.MaxInt32, meaning only the
// product's available stock constrains the quantity.
func MaxQtyPerProduct(cfg *models.StoreConfig) int {
	if cfg != nil && cfg.MaxQtyPerProduct > 0 {
		return cfg.MaxQtyPerProduct
	}
	return math.MaxInt32
}
