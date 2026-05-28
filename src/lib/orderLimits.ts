/**
 * Effective uncapped sentinel — used when DynamoDB store config has no maxQtyPerProduct set.
 * Math.min(NO_QTY_CAP, stock) === stock, so the only real limit becomes available stock.
 */
export const NO_QTY_CAP = 99_999;

// Initialise to uncapped; updated by configureOrderLimits once the config is fetched.
let maxQtyPerProduct = NO_QTY_CAP;

/**
 * Sync quantity limits from GET /api/config/theme (DynamoDB store config).
 * Called by StoreLayout whenever the theme config loads or changes.
 * When the DynamoDB value is absent or 0 the cap is treated as unlimited (limited by stock only).
 */
export function configureOrderLimits(config?: { maxQtyPerProduct?: number } | null): void {
  if (config?.maxQtyPerProduct != null && config.maxQtyPerProduct > 0) {
    maxQtyPerProduct = Math.floor(config.maxQtyPerProduct);
  } else {
    maxQtyPerProduct = NO_QTY_CAP;
  }
}

export function getMaxQtyPerProduct(): number {
  return maxQtyPerProduct;
}
