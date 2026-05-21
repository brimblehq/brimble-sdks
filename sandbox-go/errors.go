package sandbox

import "fmt"

// APIError is returned when the Sandbox API responds with a non-2xx status.
type APIError struct {
	Status            int
	Message           string
	Endpoint          string
	ResponseBody      string
	RequestID         string
	RetryAfterSeconds *float64
}

func (e *APIError) Error() string {
	return fmt.Sprintf("sandbox api error (%d) %s: %s", e.Status, e.Endpoint, e.Message)
}

// AuthError indicates auth/permission failures (401/403).
type AuthError struct {
	*APIError
}

func (e *AuthError) Error() string { return e.APIError.Error() }

// ValidationError indicates invalid payload/state (400/422).
type ValidationError struct {
	*APIError
}

func (e *ValidationError) Error() string { return e.APIError.Error() }

// NotFoundError indicates missing resource (404).
type NotFoundError struct {
	*APIError
}

func (e *NotFoundError) Error() string { return e.APIError.Error() }

// RateLimitError indicates 429 with optional retry-after.
type RateLimitError struct {
	*APIError
}

func (e *RateLimitError) Error() string { return e.APIError.Error() }
