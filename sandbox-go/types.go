package sandbox

import "time"

type CodeLanguage string

const (
	CodeLanguagePython CodeLanguage = "python"
	CodeLanguageNode   CodeLanguage = "node"
)

type DestroyReason string

const (
	DestroyReasonUser           DestroyReason = "user"
	DestroyReasonIdleTTL        DestroyReason = "idle_ttl"
	DestroyReasonMaxLifetime    DestroyReason = "max_lifetime"
	DestroyReasonOneShotStopped DestroyReason = "one_shot_stopped"
	DestroyReasonFailed         DestroyReason = "failed"
	DestroyReasonPausedTooLong  DestroyReason = "paused_too_long"
)

type DestroyTimeout string

const (
	DestroyTimeout30m DestroyTimeout = "30m"
	DestroyTimeout1h  DestroyTimeout = "1h"
	DestroyTimeout3h  DestroyTimeout = "3h"
	DestroyTimeout6h  DestroyTimeout = "6h"
	DestroyTimeout12h DestroyTimeout = "12h"
	DestroyTimeout18h DestroyTimeout = "18h"
)

type SandboxStatus string

const (
	SandboxStatusStarting  SandboxStatus = "starting"
	SandboxStatusReady     SandboxStatus = "ready"
	SandboxStatusPausing   SandboxStatus = "pausing"
	SandboxStatusPaused    SandboxStatus = "paused"
	SandboxStatusResuming  SandboxStatus = "resuming"
	SandboxStatusFailed    SandboxStatus = "failed"
	SandboxStatusDestroyed SandboxStatus = "destroyed"
)

type SnapshotMode string

const (
	SnapshotModeManual    SnapshotMode = "manual"
	SnapshotModeAutomatic SnapshotMode = "automatic"
)

type SnapshotStatus string

const (
	SnapshotStatusCreating SnapshotStatus = "creating"
	SnapshotStatusReady    SnapshotStatus = "ready"
	SnapshotStatusFailed   SnapshotStatus = "failed"
)

type VolumeType string

const (
	VolumeTypeSandbox VolumeType = "sandbox"
)

type Pagination struct {
	Page  int
	Limit int
}

type TeamScopedPagination struct {
	Page   int
	Limit  int
	TeamID string
}

type Paginated[T any] struct {
	Data        []T `json:"data"`
	TotalCount  int `json:"totalCount"`
	CurrentPage int `json:"currentPage"`
	TotalPages  int `json:"totalPages"`
	Limit       int `json:"limit"`
}

type RegionSummary struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Country   string  `json:"country"`
	Continent *string `json:"continent"`
	Provider  string  `json:"provider"`
	IsPaid    bool    `json:"is_paid"`
}

type SandboxRegion struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Country   string  `json:"country"`
	Continent *string `json:"continent"`
}

type SandboxRegionsResult struct {
	Regions []SandboxRegion `json:"regions"`
}

type SandboxTemplate struct {
	Name        string `json:"name"`
	DisplayName string `json:"display_name"`
	Description string `json:"description"`
}

type SandboxSpecs struct {
	CPU    *int `json:"cpu,omitempty"`
	Memory *int `json:"memory,omitempty"`
	Disk   *int `json:"disk,omitempty"`
}

type CreateSandboxRequest struct {
	Name              string         `json:"name,omitempty"`
	Template          string         `json:"template,omitempty"`
	TeamID            string         `json:"teamId,omitempty"`
	EnvironmentID     string         `json:"environmentId,omitempty"`
	Region            string         `json:"region,omitempty"`
	Specs             *SandboxSpecs  `json:"specs,omitempty"`
	AutoDestroy       *bool          `json:"autoDestroy,omitempty"`
	DestroyTimeout    DestroyTimeout `json:"destroyTimeout,omitempty"`
	OneShot           *bool          `json:"oneShot,omitempty"`
	BlockOutbound     *bool          `json:"blockOutbound,omitempty"`
	Persistent        *bool          `json:"persistent,omitempty"`
	PersistentDiskGB  *int           `json:"persistentDiskGB,omitempty"`
	VolumeID          string         `json:"volumeId,omitempty"`
	FromSnapshot      string         `json:"fromSnapshot,omitempty"`
	SnapshotMode      SnapshotMode   `json:"snapshotMode,omitempty"`
	SnapshotFrequency string         `json:"snapshotFrequency,omitempty"`
}

type CreateSandboxInput = CreateSandboxRequest

type CreateSandboxWithVolumeInput struct {
	Sandbox CreateSandboxRequest
	Volume  CreateVolumeInput
}

type CreateSandboxResult struct {
	ID        string        `json:"id"`
	Name      string        `json:"name"`
	Template  string        `json:"template"`
	Status    SandboxStatus `json:"status"`
	CreatedAt time.Time     `json:"created_at"`
	ExpiresAt time.Time     `json:"expires_at"`
}

type Sandbox struct {
	ID               string          `json:"id"`
	Name             string          `json:"name"`
	Template         string          `json:"template"`
	Status           SandboxStatus   `json:"status"`
	Region           any             `json:"region"`
	Specs            SandboxSpecs    `json:"specs"`
	Team             *string         `json:"team"`
	ProjectEnv       *string         `json:"project_environment"`
	AutoDestroy      bool            `json:"auto_destroy"`
	DestroyTimeout   *DestroyTimeout `json:"destroy_timeout"`
	OneShot          bool            `json:"one_shot"`
	BlockOutbound    bool            `json:"block_outbound"`
	Persistent       bool            `json:"persistent"`
	PersistentDiskGB *int            `json:"persistent_disk_gb"`
	PausedAt         *time.Time      `json:"paused_at"`
	FromSnapshot     *string         `json:"from_snapshot"`
	SnapshotMode     SnapshotMode    `json:"snapshot_mode"`
	SnapshotFreq     *string         `json:"snapshot_frequency"`
	CreatedAt        time.Time       `json:"created_at"`
	LastActivityAt   time.Time       `json:"last_activity_at"`
	ExpiresAt        time.Time       `json:"expires_at"`
	DestroyedAt      *time.Time      `json:"destroyed_at"`
	DestroyReason    *DestroyReason  `json:"destroy_reason"`
}

type AckMessage struct {
	Message string `json:"message"`
}

type ExecInput struct {
	Cmd            string `json:"cmd"`
	TimeoutSeconds *int   `json:"timeout_seconds,omitempty"`
	Cwd            string `json:"cwd,omitempty"`
	Stream         *bool  `json:"stream,omitempty"`
}

type CodeInput struct {
	Language       CodeLanguage `json:"language"`
	Code           string       `json:"code"`
	TimeoutSeconds *int         `json:"timeout_seconds,omitempty"`
	Cwd            string       `json:"cwd,omitempty"`
	Stream         *bool        `json:"stream,omitempty"`
}

type ExecResult struct {
	Stdout     string `json:"stdout"`
	Stderr     string `json:"stderr"`
	ExitCode   int    `json:"exit_code"`
	DurationMS int    `json:"duration_ms"`
}

type BatchFileUploadItem struct {
	Path    string `json:"path"`
	Content []byte
}

type sandboxFileUploadInput struct {
	Path          string `json:"path"`
	ContentBase64 string `json:"content_base64"`
}

type sandboxBatchFileUploadInput struct {
	Files []sandboxFileUploadInput `json:"files"`
}

type BatchFileUploadResult struct {
	Path    string `json:"path"`
	Bytes   int    `json:"bytes"`
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

type BatchFileUploadSummary struct {
	Uploaded int                     `json:"uploaded"`
	Failed   int                     `json:"failed"`
	Results  []BatchFileUploadResult `json:"results"`
}

type CreateSnapshotInput struct {
	Name string `json:"name"`
}

type Snapshot struct {
	ID             string         `json:"id"`
	SandboxID      string         `json:"sandbox_id"`
	Name           string         `json:"name"`
	ImageTag       string         `json:"image_tag"`
	SourceTemplate string         `json:"source_template"`
	Status         SnapshotStatus `json:"status"`
	FailureReason  *string        `json:"failure_reason"`
	SizeBytes      *int64         `json:"size_bytes"`
	CreatedAt      time.Time      `json:"created_at"`
}

type StatsAverageNumeric struct {
	TotalInPercentage float64 `json:"totalInPercentage"`
	Size              float64 `json:"size"`
}

type StatsAverageNetwork struct {
	Value             *float64 `json:"value"`
	Total             *float64 `json:"total"`
	TotalInPercentage *float64 `json:"totalInPercentage"`
	BytesPerSecond    *float64 `json:"bytesPerSecond"`
}

type StatsTimelineNetwork struct {
	BytesPerSecond *float64 `json:"bytesPerSecond"`
}

type StatsTimelinePoint struct {
	Date    time.Time            `json:"date"`
	Memory  float64              `json:"memory"`
	CPU     float64              `json:"cpu"`
	Network StatsTimelineNetwork `json:"network"`
}

type Stats struct {
	Average struct {
		Memory  StatsAverageNumeric `json:"memory"`
		CPU     StatsAverageNumeric `json:"cpu"`
		Network StatsAverageNetwork `json:"network"`
	} `json:"average"`
	ReplicaCount int                  `json:"replicaCount"`
	Results      []StatsTimelinePoint `json:"results"`
	ResponseTime any                  `json:"responseTime"`
}

type StatsQuery struct {
	HoursAgo int
}

type CreateVolumeInput struct {
	Name   string     `json:"name"`
	SizeGB int        `json:"sizeGB"`
	Region string     `json:"region"`
	Type   VolumeType `json:"type,omitempty"`
	TeamID string     `json:"teamId,omitempty"`
}

type Volume struct {
	ID                string         `json:"id"`
	Name              string         `json:"name"`
	Type              VolumeType     `json:"type"`
	Team              *string        `json:"team"`
	CSIVolumeID       *string        `json:"csi_volume_id"`
	Size              int            `json:"size"`
	Region            *RegionSummary `json:"region"`
	MountPath         *string        `json:"mount_path"`
	AttachedSandboxID *string        `json:"attached_sandbox_id"`
	AttachedProjectID *string        `json:"attached_project_id"`
	LastAttachedAt    *time.Time     `json:"last_attached_at"`
	CreatedAt         *time.Time     `json:"created_at"`
	UpdatedAt         *time.Time     `json:"updated_at"`
}

type RetryOptions struct {
	MaxAttempts  int
	BaseDelay    time.Duration
	MaxDelay     time.Duration
	RetryStatus  []int
	RetryMethods []string
}

type RequestOptions struct {
	Timeout        time.Duration
	IdempotencyKey string
	Retry          *RetryOptions
	DisableRetry   bool
}

type WaitOptions struct {
	Timeout      time.Duration
	PollInterval time.Duration
}

type RuntimeOptions struct {
	WaitUntilReady bool
	Wait           *WaitOptions
}
