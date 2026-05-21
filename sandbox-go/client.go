package sandbox

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"time"
)

// ClientConfig configures the Sandbox SDK client.
type ClientConfig struct {
	APIKey     string
	BaseURL    string
	Timeout    time.Duration
	Retry      *RetryOptions
	HTTPClient *http.Client
}

// Client is the top-level Sandbox SDK client.
type Client struct {
	baseURL    string
	apiKey     string
	timeout    time.Duration
	retry      RetryOptions
	httpClient *http.Client

	Sandboxes *SandboxesResource
	Snapshots *SnapshotsResource
	Volumes   *VolumesResource
}

// NewClient creates a new client instance.
func NewClient(config ClientConfig) (*Client, error) {
	apiKey := config.APIKey
	if apiKey == "" {
		apiKey = os.Getenv(SandboxAPIKeyEnvName)
	}
	if apiKey == "" {
		return nil, fmt.Errorf("sandbox API key is required: pass APIKey or set %s", SandboxAPIKeyEnvName)
	}

	baseURL := config.BaseURL
	if baseURL == "" {
		baseURL = DefaultBaseURL
	}

	timeout := config.Timeout
	if timeout <= 0 {
		timeout = DefaultTimeout
	}

	httpClient := config.HTTPClient
	if httpClient == nil {
		httpClient = &http.Client{Timeout: timeout}
	}

	client := &Client{
		baseURL:    baseURL,
		apiKey:     apiKey,
		timeout:    timeout,
		retry:      normalizeRetry(config.Retry),
		httpClient: httpClient,
	}

	client.Sandboxes = &SandboxesResource{client: client}
	client.Snapshots = &SnapshotsResource{client: client}
	client.Volumes = &VolumesResource{client: client}

	return client, nil
}

// Ping performs a lightweight request against the API.
func (c *Client) Ping(ctx context.Context) error {
	_, err := c.doJSON(ctx, http.MethodGet, "/sandboxes", map[string]string{"page": "1", "limit": "1"}, nil, nil)
	return err
}
