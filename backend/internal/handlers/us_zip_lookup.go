package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

var zippopotamHTTPClient = &http.Client{Timeout: 8 * time.Second}

// zippopotamResponse matches https://api.zippopotam.us/us/{zip} JSON (field names contain spaces).
type zippopotamResponse struct {
	Places []struct {
		PlaceName         string `json:"place name"`
		StateAbbreviation string `json:"state abbreviation"`
	} `json:"places"`
}

func usZipBaseDigits(zip string) string {
	z := strings.TrimSpace(zip)
	if i := strings.IndexByte(z, '-'); i > 0 {
		z = z[:i]
	}
	if len(z) > 5 {
		z = z[:5]
	}
	return z
}

func isUSCountry(country string) bool {
	c := strings.ToLower(strings.TrimSpace(country))
	c = strings.ReplaceAll(c, ".", "")
	c = strings.TrimSpace(c)
	switch c {
	case "", "us", "usa", "united states", "united states of america", "u s", "u s a":
		return true
	default:
		return false
	}
}

func ensureUSCountryCode(country string) string {
	if isUSCountry(country) {
		return "US"
	}
	return strings.TrimSpace(country)
}

// validateUSZipCityStateMatch calls the public Zippopotam API to ensure ZIP exists and city/state match USPS-style data.
func validateUSZipCityStateMatch(ctx context.Context, zip, city, state string) error {
	if strings.TrimSpace(zip) == "" {
		return fmt.Errorf("zip is required")
	}
	if !reUSZip.MatchString(strings.TrimSpace(zip)) {
		return fmt.Errorf("zip must be a valid US ZIP code (e.g. 85001)")
	}
	zip5 := usZipBaseDigits(zip)
	if len(zip5) != 5 {
		return fmt.Errorf("zip must be a valid US ZIP code (e.g. 85001)")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.zippopotam.us/us/"+zip5, nil)
	if err != nil {
		return fmt.Errorf("could not verify ZIP code")
	}
	req.Header.Set("Accept", "application/json")

	resp, err := zippopotamHTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("could not verify address (postal lookup failed); please try again")
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return fmt.Errorf("ZIP code is not a recognized US postal code")
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		_ = body
		return fmt.Errorf("could not verify ZIP code; please try again")
	}

	var parsed zippopotamResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return fmt.Errorf("could not verify ZIP code; please try again")
	}
	if len(parsed.Places) == 0 {
		return fmt.Errorf("ZIP code is not a recognized US postal code")
	}

	wantState := strings.ToUpper(strings.TrimSpace(state))
	wantCity := normalizePlaceName(city)
	if wantCity == "" {
		return fmt.Errorf("city is required")
	}

	var stateOK, cityOK bool
	var cityNames []string
	seen := map[string]struct{}{}
	for _, p := range parsed.Places {
		abbr := strings.ToUpper(strings.TrimSpace(p.StateAbbreviation))
		if abbr == wantState {
			stateOK = true
		}
		n := strings.TrimSpace(p.PlaceName)
		if n != "" {
			if _, ok := seen[n]; !ok {
				seen[n] = struct{}{}
				cityNames = append(cityNames, n)
			}
		}
		if placeNameMatchesCity(n, wantCity) {
			cityOK = true
		}
	}

	if !stateOK {
		return fmt.Errorf("state does not match ZIP code %s", zip5)
	}
	if !cityOK {
		if len(cityNames) > 5 {
			cityNames = cityNames[:5]
		}
		if len(cityNames) > 0 {
			return fmt.Errorf("city does not match ZIP %s (examples for this ZIP: %s)", zip5, strings.Join(cityNames, ", "))
		}
		return fmt.Errorf("city does not match ZIP code %s", zip5)
	}
	return nil
}

func normalizePlaceName(s string) string {
	return strings.ToLower(strings.TrimSpace(strings.Join(strings.Fields(s), " ")))
}

func placeNameMatchesCity(placeName, normalizedWantCity string) bool {
	if normalizedWantCity == "" {
		return false
	}
	n := normalizePlaceName(placeName)
	if n == "" {
		return false
	}
	if n == normalizedWantCity {
		return true
	}
	// Allow "St. Louis" vs "Saint Louis" style mismatches: compare without dots.
	n2 := strings.ReplaceAll(n, ".", "")
	w2 := strings.ReplaceAll(normalizedWantCity, ".", "")
	if n2 == w2 {
		return true
	}
	return false
}
