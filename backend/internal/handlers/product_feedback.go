package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"shopreturngifts-api/internal/middleware"
	"shopreturngifts-api/internal/models"
)

// GetProductFeedback returns aggregate ratings and recent comments when the
// store has at least one of these features enabled.
func (h *Handlers) GetProductFeedback(w http.ResponseWriter, r *http.Request) {
	cfg, _ := h.db.GetConfig(r.Context())
	ratingsOn := cfg != nil && cfg.EnableRatings
	commentsOn := cfg != nil && cfg.EnableComments
	resp := models.ProductFeedbackResponse{
		RatingsEnabled:  ratingsOn,
		CommentsEnabled: commentsOn,
	}
	if !ratingsOn && !commentsOn {
		writeJSON(w, http.StatusOK, resp)
		return
	}

	pid := chi.URLParam(r, "productId")
	product, err := h.db.GetProduct(r.Context(), pid)
	if err != nil || product == nil || !product.IsActive {
		writeError(w, http.StatusNotFound, "product not found")
		return
	}

	ratings, comments, err := h.db.QueryProductFeedback(r.Context(), product.ProductID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load feedback")
		return
	}

	var sum int
	for _, x := range ratings {
		if x.Stars >= 1 && x.Stars <= 5 {
			sum += x.Stars
		}
	}
	if len(ratings) > 0 {
		resp.AverageRating = float64(sum) / float64(len(ratings))
	}
	resp.RatingCount = len(ratings)

	const maxComments = 50
	out := make([]models.ProductFeedbackCommentPublic, 0, len(comments))
	for i, c := range comments {
		if i >= maxComments {
			break
		}
		body := strings.TrimSpace(c.Body)
		if body == "" {
			continue
		}
		cid := strings.TrimSpace(c.CommentID)
		if cid == "" {
			continue
		}
		out = append(out, models.ProductFeedbackCommentPublic{
			CommentID: cid,
			UserName:  strings.TrimSpace(c.UserName),
			Body:      body,
			CreatedAt: c.CreatedAt,
		})
	}
	resp.Comments = out
	writeJSON(w, http.StatusOK, resp)
}

// PostProductRating sets the signed-in user's 1–5 star rating for a product.
func (h *Handlers) PostProductRating(w http.ResponseWriter, r *http.Request) {
	cfg, _ := h.db.GetConfig(r.Context())
	if cfg == nil || !cfg.EnableRatings {
		writeError(w, http.StatusForbidden, "product ratings are disabled")
		return
	}

	userID := middleware.GetUserID(r)
	user, err := h.db.GetUser(r.Context(), userID)
	if err != nil || user == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var body struct {
		Stars int `json:"stars"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Stars < 1 || body.Stars > 5 {
		writeError(w, http.StatusBadRequest, "stars must be between 1 and 5")
		return
	}

	pid := chi.URLParam(r, "productId")
	product, err := h.db.GetProduct(r.Context(), pid)
	if err != nil || product == nil || !product.IsActive {
		writeError(w, http.StatusNotFound, "product not found")
		return
	}

	displayName := strings.TrimSpace(user.Name)
	if displayName == "" {
		displayName = strings.TrimSpace(user.Email)
	}
	if err := h.db.PutProductRating(r.Context(), product.ProductID, userID, displayName, body.Stars); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save rating")
		return
	}

	ratings, _, err := h.db.QueryProductFeedback(r.Context(), product.ProductID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load ratings")
		return
	}
	var sum int
	for _, x := range ratings {
		if x.Stars >= 1 && x.Stars <= 5 {
			sum += x.Stars
		}
	}
	avg := 0.0
	if len(ratings) > 0 {
		avg = float64(sum) / float64(len(ratings))
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"averageRating": avg,
		"ratingCount":   len(ratings),
	})
}

// PostProductComment appends a comment for a product (authenticated).
func (h *Handlers) PostProductComment(w http.ResponseWriter, r *http.Request) {
	cfg, _ := h.db.GetConfig(r.Context())
	if cfg == nil || !cfg.EnableComments {
		writeError(w, http.StatusForbidden, "product comments are disabled")
		return
	}

	userID := middleware.GetUserID(r)
	user, err := h.db.GetUser(r.Context(), userID)
	if err != nil || user == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var body struct {
		Text string `json:"text"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	text := strings.TrimSpace(body.Text)
	if len(text) < 1 {
		writeError(w, http.StatusBadRequest, "comment cannot be empty")
		return
	}
	if len(text) > 500 {
		writeError(w, http.StatusBadRequest, "comment is too long (max 500 characters)")
		return
	}

	pid := chi.URLParam(r, "productId")
	product, err := h.db.GetProduct(r.Context(), pid)
	if err != nil || product == nil || !product.IsActive {
		writeError(w, http.StatusNotFound, "product not found")
		return
	}

	displayName := strings.TrimSpace(user.Name)
	if displayName == "" {
		displayName = strings.TrimSpace(user.Email)
	}
	commentID, err := h.db.PutProductComment(r.Context(), product.ProductID, userID, displayName, text)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save comment")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"commentId": commentID})
}
