package sandbox

import "time"

const (
	DefaultBaseURL       = "https://sandbox.brimble.io"
	SandboxAPIKeyEnvName = "BRIMBLE_SANDBOX_KEY"
	SDKPackageVersion    = "0.1.0"
	DefaultPage          = 1
	DefaultPageLimit     = 15
	MaxPageLimit         = 100
	MinVolumeSizeGB      = 10
)

const (
	DefaultTimeout                  = 30 * time.Second
	DefaultSandboxReadyTimeout      = 60 * time.Second
	DefaultSandboxReadyPollInterval = 500 * time.Millisecond
)

const (
	DefaultRetryMaxAttempts = 1
	DefaultRetryBaseDelay   = 300 * time.Millisecond
	DefaultRetryMaxDelay    = 3 * time.Second
)

var DefaultRetryStatuses = []int{408, 429, 500, 502, 503, 504}
var DefaultRetryMethods = []string{"GET", "DELETE", "PUT"}
