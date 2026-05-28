package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"shopreturngifts-api/internal/models"
)

// AdminGetDealers lists all dealers.
func (h *Handlers) AdminGetDealers(w http.ResponseWriter, r *http.Request) {
	dealers, err := h.db.GetDealers(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, models.Paginated[models.Dealer]{Items: dealers, Count: len(dealers)})
}

// AdminGetDealer returns one dealer.
func (h *Handlers) AdminGetDealer(w http.ResponseWriter, r *http.Request) {
	dealerID := chi.URLParam(r, "dealerId")
	d, err := h.db.GetDealer(r.Context(), dealerID)
	if err != nil {
		writeError(w, http.StatusNotFound, "dealer not found")
		return
	}
	writeJSON(w, http.StatusOK, d)
}

// AdminCreateDealer creates a new dealer.
func (h *Handlers) AdminCreateDealer(w http.ResponseWriter, r *http.Request) {
	var d models.Dealer
	if err := json.NewDecoder(r.Body).Decode(&d); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(d.Name) == "" {
		writeError(w, http.StatusBadRequest, "dealer name is required")
		return
	}
	d.DealerID = "DEALER#" + uuid.New().String()
	d.CreatedAt = now()
	d.UpdatedAt = now()
	if err := h.db.PutDealer(r.Context(), &d); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, d)
}

// AdminUpdateDealer updates an existing dealer (partial-friendly via raw map).
func (h *Handlers) AdminUpdateDealer(w http.ResponseWriter, r *http.Request) {
	dealerID := chi.URLParam(r, "dealerId")
	existing, err := h.db.GetDealer(r.Context(), dealerID)
	if err != nil {
		writeError(w, http.StatusNotFound, "dealer not found")
		return
	}

	// Decode into raw map first to detect key existence.
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(body, &raw); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	var updates models.Dealer
	if err := json.Unmarshal(body, &updates); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if _, ok := raw["name"]; ok {
		existing.Name = updates.Name
	}
	if _, ok := raw["companyName"]; ok {
		existing.CompanyName = updates.CompanyName
	}
	if _, ok := raw["email"]; ok {
		existing.Email = updates.Email
	}
	if _, ok := raw["phone"]; ok {
		existing.Phone = updates.Phone
	}
	if _, ok := raw["address"]; ok {
		existing.Address = updates.Address
	}
	if _, ok := raw["notes"]; ok {
		existing.Notes = updates.Notes
	}
	if _, ok := raw["isActive"]; ok {
		existing.IsActive = updates.IsActive
	}
	if _, ok := raw["contacts"]; ok {
		existing.Contacts = updates.Contacts
	}
	if _, ok := raw["productPrices"]; ok {
		existing.ProductPrices = updates.ProductPrices
	}
	existing.UpdatedAt = now()

	if err := h.db.PutDealer(r.Context(), existing); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, existing)
}

// AdminDeleteDealer removes a dealer.
func (h *Handlers) AdminDeleteDealer(w http.ResponseWriter, r *http.Request) {
	dealerID := chi.URLParam(r, "dealerId")
	if err := h.db.DeleteDealer(r.Context(), dealerID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
