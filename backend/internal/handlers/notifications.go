package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"shopreturngifts-api/internal/middleware"
	"shopreturngifts-api/internal/models"
)

// GetNotifications returns in-app notifications for the authenticated user only.
func (h *Handlers) GetNotifications(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	items, err := h.db.ListNotifications(r.Context(), userID, 50)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load notifications")
		return
	}

	unread := 0
	for _, n := range items {
		if strings.TrimSpace(n.ReadAt) == "" {
			unread++
		}
	}

	writeJSON(w, http.StatusOK, models.NotificationListResponse{
		Items:       items,
		UnreadCount: unread,
	})
}

// MarkNotificationRead marks a single notification as read (owner only).
func (h *Handlers) MarkNotificationRead(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	notificationID := chi.URLParam(r, "notificationId")
	if strings.TrimSpace(notificationID) == "" {
		writeError(w, http.StatusBadRequest, "notification id is required")
		return
	}

	if _, err := h.db.GetNotification(r.Context(), userID, notificationID); err != nil {
		writeError(w, http.StatusNotFound, "notification not found")
		return
	}

	if err := h.db.MarkNotificationRead(r.Context(), userID, notificationID, now()); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update notification")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// MarkAllNotificationsRead marks every notification for the authenticated user.
func (h *Handlers) MarkAllNotificationsRead(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	if err := h.db.MarkAllNotificationsRead(r.Context(), userID, now()); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update notifications")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// MarkNotificationsReadBatch accepts { "notificationIds": ["..."] }.
func (h *Handlers) MarkNotificationsReadBatch(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	var body struct {
		NotificationIDs []string `json:"notificationIds"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	readAt := now()
	for _, id := range body.NotificationIDs {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		if _, err := h.db.GetNotification(r.Context(), userID, id); err != nil {
			continue
		}
		_ = h.db.MarkNotificationRead(r.Context(), userID, id, readAt)
	}
	w.WriteHeader(http.StatusNoContent)
}
