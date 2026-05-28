package handlers

import (
	"context"
	"log"
	"math"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"shopreturngifts-api/internal/middleware"
	"shopreturngifts-api/internal/models"
	"shopreturngifts-api/internal/store"
)

// ─── API Handlers ───

// GetMyRewards returns the authenticated user's reward summary, config, and
// recent ledger history.
func (h *Handlers) GetMyRewards(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	if _, err := h.db.PromoteEligibleRewardsForUser(r.Context(), userID, time.Now().UTC()); err != nil {
		log.Printf("reward promotion for user %s: %v", userID, err)
	}
	config, _ := h.db.GetConfig(r.Context())
	cfg := effectiveRewardConfig(config)

	summary, err := h.db.GetRewardSummary(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load rewards")
		return
	}

	history, _ := h.db.GetRewardLedger(r.Context(), userID, 50)
	if history == nil {
		history = []models.RewardLedgerEntry{}
	}

	writeJSON(w, http.StatusOK, models.RewardSummaryResponse{
		Summary: *summary,
		Config:  cfg,
		History: history,
	})
}

// AdminListRewards returns every registered user's reward balances for the admin overview.
// Users without reward activity appear with zero balances (customers and admins).
func (h *Handlers) AdminListRewards(w http.ResponseWriter, r *http.Request) {
	config, _ := h.db.GetConfig(r.Context())
	cfg := effectiveRewardConfig(config)

	usersPag, err := h.db.GetUsers(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load users")
		return
	}

	summaries, err := h.db.ListRewardSummaries(r.Context())
	if err != nil {
		log.Printf("AdminListRewards: ListRewardSummaries failed (continuing with user list only): %v", err)
		summaries = nil
	}

	summaryByUser := make(map[string]models.RewardSummary, len(summaries))
	for _, s := range summaries {
		if s.UserID != "" {
			summaryByUser[s.UserID] = s
		}
	}

	seen := make(map[string]bool, len(usersPag.Items))
	items := make([]models.AdminRewardListItem, 0, len(usersPag.Items))
	for _, u := range usersPag.Items {
		seen[u.UserID] = true
		summary, ok := summaryByUser[u.UserID]
		if !ok {
			summary = models.RewardSummary{UserID: u.UserID}
		}
		items = append(items, models.AdminRewardListItem{
			UserID:    u.UserID,
			UserName:  u.Name,
			UserEmail: u.Email,
			UserRole:  u.Role,
			Summary:   summary,
		})
	}
	for userID, summary := range summaryByUser {
		if seen[userID] {
			continue
		}
		item := models.AdminRewardListItem{
			UserID:  userID,
			Summary: summary,
		}
		if u, uerr := h.db.GetUser(r.Context(), userID); uerr == nil && u != nil {
			item.UserName = u.Name
			item.UserEmail = u.Email
			item.UserRole = u.Role
		} else {
			item.ProfileMissing = true
		}
		items = append(items, item)
	}

	sort.Slice(items, func(i, j int) bool {
		ai := items[i].Summary.AvailablePoints + items[i].Summary.PendingPoints + items[i].Summary.LifetimePointsEarned
		aj := items[j].Summary.AvailablePoints + items[j].Summary.PendingPoints + items[j].Summary.LifetimePointsEarned
		if ai != aj {
			return ai > aj
		}
		ni := strings.ToLower(items[i].UserName)
		nj := strings.ToLower(items[j].UserName)
		if ni != nj {
			return ni < nj
		}
		return strings.ToLower(items[i].UserEmail) < strings.ToLower(items[j].UserEmail)
	})

	writeJSON(w, http.StatusOK, models.AdminRewardListResponse{
		Items:  items,
		Config: cfg,
	})
}

// AdminGetUserRewards returns a specific user's reward summary and history.
func (h *Handlers) AdminGetUserRewards(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "userId")
	if userID == "" {
		writeError(w, http.StatusBadRequest, "missing userId")
		return
	}

	if _, err := h.db.PromoteEligibleRewardsForUser(r.Context(), userID, time.Now().UTC()); err != nil {
		log.Printf("reward promotion (admin view) for user %s: %v", userID, err)
	}

	config, _ := h.db.GetConfig(r.Context())
	cfg := effectiveRewardConfig(config)

	summary, err := h.db.GetRewardSummary(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load rewards")
		return
	}

	history, _ := h.db.GetRewardLedger(r.Context(), userID, 100)
	if history == nil {
		history = []models.RewardLedgerEntry{}
	}

	writeJSON(w, http.StatusOK, models.RewardSummaryResponse{
		Summary: *summary,
		Config:  cfg,
		History: history,
	})
}

// AdminSweepRewards promotes pending reward entries whose eligibility window
// has elapsed from "pending" to "available".
func (h *Handlers) AdminSweepRewards(w http.ResponseWriter, r *http.Request) {
	cutoff := time.Now().UTC()
	entries, err := h.db.QueryPendingRewardEntries(r.Context(), cutoff, 500)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "sweep query failed: "+err.Error())
		return
	}

	promoted := 0
	for _, e := range entries {
		if err := h.db.UpdateRewardLedgerStatus(r.Context(), e.UserID, e.CreatedAt, e.EntryID, "available"); err != nil {
			log.Printf("sweep: failed to promote entry %s for user %s: %v", e.EntryID, e.UserID, err)
			continue
		}
		_ = h.db.AdjustRewardSummary(r.Context(), e.UserID, store.RewardSummaryDelta{
			PendingPoints:   -e.Points,
			AvailablePoints: e.Points,
		})
		promoted++
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"scanned":  len(entries),
		"promoted": promoted,
	})
}

// ─── Internal helpers ───

// effectiveRewardConfig extracts the reward-relevant fields from StoreConfig
// into a slim RewardConfig value suitable for business-logic checks and API
// responses.
func effectiveRewardConfig(cfg *models.StoreConfig) models.RewardConfig {
	if cfg == nil {
		return models.RewardConfig{}
	}
	return models.RewardConfig{
		Enabled:             cfg.RewardsEnabled,
		SpendThresholdCents: cfg.RewardSpendThresholdCents,
		PointsPerThreshold:  cfg.RewardPointsPerThreshold,
		PointValueCents:     cfg.RewardPointValueCents,
		EligibilityDays:     cfg.RewardEligibilityDays,
	}
}

// pointsToCents converts reward points to their cash-equivalent in cents.
func pointsToCents(cfg models.RewardConfig, points int64) int64 {
	if cfg.PointValueCents <= 0 {
		return 0
	}
	return points * cfg.PointValueCents
}

// recordRewardEarning credits pending reward points when an order is delivered.
// Points are calculated as: floor(orderSubtotalCents / spendThreshold) * pointsPerThreshold.
// The earned points start in "pending" status and become "available" after
// the eligibility window passes.
func (h *Handlers) recordRewardEarning(ctx context.Context, order *models.Order) {
	if order == nil || order.RewardPointsEarned > 0 {
		return
	}
	config, err := h.db.GetConfig(ctx)
	if err != nil || config == nil {
		return
	}
	cfg := effectiveRewardConfig(config)
	if !cfg.Enabled || cfg.SpendThresholdCents <= 0 || cfg.PointsPerThreshold <= 0 {
		return
	}

	subtotalCents := int64(math.Round(order.Subtotal * 100))
	points := (subtotalCents / cfg.SpendThresholdCents) * cfg.PointsPerThreshold
	if points <= 0 {
		return
	}

	eligDays := cfg.EligibilityDays
	if eligDays <= 0 {
		eligDays = 15
	}
	eligibleAt := time.Now().UTC().AddDate(0, 0, eligDays).Format(time.RFC3339)

	entry := &models.RewardLedgerEntry{
		UserID:     order.UserID,
		Type:       "earn",
		Status:     "pending",
		Points:     points,
		OrderID:    order.OrderID,
		OrderTotal: subtotalCents,
		EligibleAt: eligibleAt,
	}
	if err := h.db.PutRewardLedgerEntry(ctx, entry); err != nil {
		log.Printf("reward earn failed for order %s: %v", order.OrderID, err)
		return
	}

	order.RewardPointsEarned = points
	order.RewardEarnEntryID = entry.EntryID

	_ = h.db.AdjustRewardSummary(ctx, order.UserID, store.RewardSummaryDelta{
		LifetimeSpendCents:   subtotalCents,
		LifetimePointsEarned: points,
		PendingPoints:        points,
	})
	h.emailRewardEarned(ctx, order, points)
}

// recordRewardRedemption debits reward points when payment is confirmed for
// an order that used points at checkout.
func (h *Handlers) recordRewardRedemption(ctx context.Context, order *models.Order) {
	if order == nil || order.RewardPointsRedeemed <= 0 {
		return
	}
	if order.RewardRedeemEntryID != "" {
		return
	}

	entry := &models.RewardLedgerEntry{
		UserID:     order.UserID,
		Type:       "redeem",
		Status:     "redeemed",
		Points:     order.RewardPointsRedeemed,
		OrderID:    order.OrderID,
		OrderTotal: order.RewardDiscountCents,
	}
	if err := h.db.PutRewardLedgerEntry(ctx, entry); err != nil {
		log.Printf("reward redeem failed for order %s: %v", order.OrderID, err)
		return
	}

	order.RewardRedeemEntryID = entry.EntryID

	_ = h.db.AdjustRewardSummary(ctx, order.UserID, store.RewardSummaryDelta{
		AvailablePoints: -order.RewardPointsRedeemed,
		RedeemedPoints:  order.RewardPointsRedeemed,
	})
	h.emailRewardRedeemed(ctx, order, order.RewardPointsRedeemed)
}

// reverseRewardForOrder reverses any reward earnings and restores any
// redeemed points when an order is cancelled or fully refunded.
func (h *Handlers) reverseRewardForOrder(ctx context.Context, order *models.Order) {
	if order == nil {
		return
	}

	// Reverse earn entry if one was recorded.
	if order.RewardEarnEntryID != "" && order.RewardPointsEarned > 0 {
		reverseEntry := &models.RewardLedgerEntry{
			UserID:  order.UserID,
			Type:    "reverse",
			Status:  "reversed",
			Points:  order.RewardPointsEarned,
			OrderID: order.OrderID,
			Note:    "order cancelled",
		}
		if err := h.db.PutRewardLedgerEntry(ctx, reverseEntry); err != nil {
			log.Printf("reward reverse-earn failed for order %s: %v", order.OrderID, err)
		} else {
			_ = h.db.AdjustRewardSummary(ctx, order.UserID, store.RewardSummaryDelta{
				PendingPoints:  -order.RewardPointsEarned,
				ReversedPoints: order.RewardPointsEarned,
			})
		}
	}

	// Restore redeemed points if any were used.
	if order.RewardRedeemEntryID != "" && order.RewardPointsRedeemed > 0 {
		restoreEntry := &models.RewardLedgerEntry{
			UserID:  order.UserID,
			Type:    "reverse",
			Status:  "reversed",
			Points:  order.RewardPointsRedeemed,
			OrderID: order.OrderID,
			Note:    "redemption reversed – order cancelled",
		}
		if err := h.db.PutRewardLedgerEntry(ctx, restoreEntry); err != nil {
			log.Printf("reward reverse-redeem failed for order %s: %v", order.OrderID, err)
		} else {
			_ = h.db.AdjustRewardSummary(ctx, order.UserID, store.RewardSummaryDelta{
				AvailablePoints: order.RewardPointsRedeemed,
				RedeemedPoints:  -order.RewardPointsRedeemed,
			})
		}
	}
}
