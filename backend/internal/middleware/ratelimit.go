package middleware

import (
	"fmt"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// windowEntry tracks request count within a fixed time window for a single IP.
type windowEntry struct {
	count       int
	windowStart time.Time
}

// ipRateLimiter enforces a fixed-window per-IP rate limit.
type ipRateLimiter struct {
	mu      sync.Mutex
	clients map[string]*windowEntry
	limit   int
	window  time.Duration
}

// newIPRateLimiter creates a new rate limiter and starts a background cleanup
// goroutine that removes stale entries every 2×window to cap memory usage.
func newIPRateLimiter(limit int, window time.Duration) *ipRateLimiter {
	l := &ipRateLimiter{
		clients: make(map[string]*windowEntry),
		limit:   limit,
		window:  window,
	}
	go func() {
		ticker := time.NewTicker(window * 2)
		defer ticker.Stop()
		for range ticker.C {
			l.mu.Lock()
			cutoff := time.Now().Add(-window * 2)
			for ip, e := range l.clients {
				if e.windowStart.Before(cutoff) {
					delete(l.clients, ip)
				}
			}
			l.mu.Unlock()
		}
	}()
	return l
}

// allow returns true if the request from ip is within the rate limit for the
// current fixed window, or false if the limit has been exceeded.
func (l *ipRateLimiter) allow(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	e, ok := l.clients[ip]
	if !ok || now.Sub(e.windowStart) >= l.window {
		l.clients[ip] = &windowEntry{count: 1, windowStart: now}
		return true
	}
	if e.count >= l.limit {
		return false
	}
	e.count++
	return true
}

// clientIP extracts the real client IP from the request.
// X-Forwarded-For is checked first because CloudFront always sets it; the
// left-most value is the original client IP. Falls back to RemoteAddr.
func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		// Take the first (leftmost) IP — this is the actual client.
		parts := strings.SplitN(xff, ",", 2)
		if ip := net.ParseIP(strings.TrimSpace(parts[0])); ip != nil {
			return ip.String()
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// RateLimitMiddleware returns a chi-compatible middleware that limits each
// source IP to at most limit requests per window using a fixed-window counter.
// Excess requests receive HTTP 429 with a Retry-After header set to the
// remaining window duration in seconds.
func RateLimitMiddleware(limit int, window time.Duration) func(http.Handler) http.Handler {
	limiter := newIPRateLimiter(limit, window)
	retryAfter := fmt.Sprintf("%.0f", window.Seconds())
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !limiter.allow(clientIP(r)) {
				w.Header().Set("Content-Type", "text/plain; charset=utf-8")
				w.Header().Set("Retry-After", retryAfter)
				http.Error(w, "too many requests — please try again later", http.StatusTooManyRequests)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
