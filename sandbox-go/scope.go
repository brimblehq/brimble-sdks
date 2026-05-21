package sandbox

import (
	"context"
	"io"
)

// SandboxScope wraps runtime operations for a specific sandbox id.
type SandboxScope struct {
	ExecRunner *ExecResource
	Files      *FilesResource
	StatsAPI   *StatsResource
	Snapshots  *SnapshotScopeResource
}

func newSandboxScope(client *Client, sandboxID string) *SandboxScope {
	return &SandboxScope{
		ExecRunner: &ExecResource{client: client, sandboxID: sandboxID},
		Files:      &FilesResource{client: client, sandboxID: sandboxID},
		StatsAPI:   &StatsResource{client: client, sandboxID: sandboxID},
		Snapshots:  &SnapshotScopeResource{client: client, sandboxID: sandboxID},
	}
}

// Exec runs a shell command in this sandbox.
func (s *SandboxScope) Exec(ctx context.Context, input ExecInput) (*ExecResult, error) {
	return s.ExecRunner.Exec(ctx, input)
}

// ExecStream runs a shell command and returns an SSE stream (`text/event-stream`).
func (s *SandboxScope) ExecStream(ctx context.Context, input ExecInput) (io.ReadCloser, error) {
	return s.ExecRunner.ExecStream(ctx, input)
}

// RunCode runs a code snippet in this sandbox.
func (s *SandboxScope) RunCode(ctx context.Context, input CodeInput) (*ExecResult, error) {
	return s.ExecRunner.RunCode(ctx, input)
}

// RunCodeStream runs a code snippet and returns an SSE stream (`text/event-stream`).
func (s *SandboxScope) RunCodeStream(ctx context.Context, input CodeInput) (io.ReadCloser, error) {
	return s.ExecRunner.RunCodeStream(ctx, input)
}

// PutFile uploads file bytes to this sandbox.
func (s *SandboxScope) PutFile(ctx context.Context, path string, body io.Reader, contentLength int64) error {
	return s.Files.Put(ctx, path, body, contentLength)
}

// GetFile downloads file bytes from this sandbox.
func (s *SandboxScope) GetFile(ctx context.Context, path string) (io.ReadCloser, error) {
	return s.Files.Get(ctx, path)
}

// PutFiles uploads multiple files to this sandbox in one request.
func (s *SandboxScope) PutFiles(ctx context.Context, files []BatchFileUploadItem) (*BatchFileUploadSummary, error) {
	return s.Files.PutBatch(ctx, files)
}

// Stats fetches usage stats for this sandbox.
func (s *SandboxScope) Stats(ctx context.Context, query StatsQuery) (*Stats, error) {
	return s.StatsAPI.Get(ctx, query)
}

// CreateSnapshot creates a snapshot for this sandbox.
func (s *SandboxScope) CreateSnapshot(ctx context.Context, input CreateSnapshotInput) (*Snapshot, error) {
	return s.Snapshots.Create(ctx, input)
}

// ListSnapshots lists snapshots for this sandbox.
func (s *SandboxScope) ListSnapshots(ctx context.Context, query Pagination) (*Paginated[Snapshot], error) {
	return s.Snapshots.List(ctx, query)
}
