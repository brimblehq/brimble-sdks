package sandbox

import (
	"context"
	"fmt"
	"io"
	"time"
)

// SandboxHandle is returned by sandbox create/get operations and provides direct runtime operations.
type SandboxHandle struct {
	sandboxes    *SandboxesResource
	createResult CreateSandboxResult
	latest       *Sandbox

	Snapshots *SandboxHandleSnapshots
}

// SandboxHandleSnapshots provides snapshot helpers from a handle.
type SandboxHandleSnapshots struct {
	handle *SandboxHandle
}

func newSandboxHandle(sandboxes *SandboxesResource, result CreateSandboxResult) *SandboxHandle {
	handle := &SandboxHandle{
		sandboxes:    sandboxes,
		createResult: result,
	}
	handle.Snapshots = &SandboxHandleSnapshots{handle: handle}
	return handle
}

// ID returns the sandbox id.
func (h *SandboxHandle) ID() string {
	return h.createResult.ID
}

// Status returns the current cached sandbox status.
func (h *SandboxHandle) Status() SandboxStatus {
	if h.latest != nil {
		return h.latest.Status
	}
	return h.createResult.Status
}

// CreateResult returns the raw create response payload.
func (h *SandboxHandle) CreateResult() CreateSandboxResult {
	return h.createResult
}

// Latest returns the most recently fetched sandbox payload from Refresh/WaitUntilReady.
func (h *SandboxHandle) Latest() *Sandbox {
	return h.latest
}

// Refresh fetches current sandbox details and updates the handle cache.
func (h *SandboxHandle) Refresh(ctx context.Context, options ...RequestOptions) (*Sandbox, error) {
	sandbox, err := h.sandboxes.GetData(ctx, h.ID(), options...)
	if err != nil {
		return nil, err
	}
	h.latest = sandbox
	return sandbox, nil
}

// Destroy destroys this sandbox.
func (h *SandboxHandle) Destroy(ctx context.Context, options ...RequestOptions) error {
	return h.sandboxes.Destroy(ctx, h.ID(), options...)
}

// Pause requests pause and refreshes local status.
func (h *SandboxHandle) Pause(ctx context.Context, options ...RequestOptions) (*AckMessage, error) {
	ack, err := h.sandboxes.Pause(ctx, h.ID(), options...)
	if err != nil {
		return nil, err
	}
	_, _ = h.Refresh(ctx, options...)
	return ack, nil
}

// Resume requests resume and refreshes local status.
func (h *SandboxHandle) Resume(ctx context.Context, options ...RequestOptions) (*AckMessage, error) {
	ack, err := h.sandboxes.Resume(ctx, h.ID(), options...)
	if err != nil {
		return nil, err
	}
	_, _ = h.Refresh(ctx, options...)
	return ack, nil
}

// UpdateEgress updates outbound network policy for this sandbox.
func (h *SandboxHandle) UpdateEgress(ctx context.Context, input UpdateSandboxEgressInput, options ...RequestOptions) (*Sandbox, error) {
	sandbox, err := h.sandboxes.UpdateEgress(ctx, h.ID(), input, options...)
	if err != nil {
		return nil, err
	}
	h.latest = sandbox
	return sandbox, nil
}

// WaitUntilReady polls until sandbox status is ready using SDK defaults.
func (h *SandboxHandle) WaitUntilReady(ctx context.Context) (*Sandbox, error) {
	return h.WaitUntilReadyWithOptions(ctx, DefaultSandboxReadyTimeout, DefaultSandboxReadyPollInterval)
}

// WaitUntilReadyWithOptions polls until sandbox status is ready with custom timing.
func (h *SandboxHandle) WaitUntilReadyWithOptions(ctx context.Context, timeout time.Duration, pollInterval time.Duration) (*Sandbox, error) {
	if timeout <= 0 {
		timeout = DefaultSandboxReadyTimeout
	}
	if pollInterval <= 0 {
		pollInterval = DefaultSandboxReadyPollInterval
	}

	deadline := time.Now().Add(timeout)

	for {
		if err := ctx.Err(); err != nil {
			return nil, err
		}

		sandbox, err := h.Refresh(ctx)
		if err != nil {
			return nil, err
		}
		if sandbox.Status == SandboxStatusReady {
			return sandbox, nil
		}

		if time.Now().After(deadline) {
			return nil, fmt.Errorf("sandbox %s did not become ready within %s", h.ID(), timeout)
		}

		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(pollInterval):
		}
	}
}

func (h *SandboxHandle) scope() *SandboxScope {
	return newSandboxScope(h.sandboxes.client, h.ID())
}

func (h *SandboxHandle) ensureReady(ctx context.Context, runtimeOptions *RuntimeOptions) error {
	if h.Status() == SandboxStatusReady {
		return nil
	}

	if runtimeOptions != nil && runtimeOptions.WaitUntilReady {
		if runtimeOptions.Wait != nil {
			_, err := h.WaitUntilReadyWithOptions(ctx, runtimeOptions.Wait.Timeout, runtimeOptions.Wait.PollInterval)
			return err
		}
		_, err := h.WaitUntilReady(ctx)
		return err
	}

	if h.Status() != SandboxStatusReady {
		return fmt.Errorf("sandbox %s is %s. call WaitUntilReady or Refresh before runtime operations", h.ID(), h.Status())
	}

	return nil
}

// Exec runs a shell command once sandbox is ready.
func (h *SandboxHandle) Exec(ctx context.Context, input ExecInput, runtimeOptions ...RuntimeOptions) (*ExecResult, error) {
	return h.ExecWithHooks(ctx, input, nil, runtimeOptions...)
}

// ExecWithHooks runs a shell command and optionally streams live stdout/stderr.
func (h *SandboxHandle) ExecWithHooks(ctx context.Context, input ExecInput, hooks *ExecHooks, runtimeOptions ...RuntimeOptions) (*ExecResult, error) {
	options := firstRuntimeOptions(runtimeOptions...)
	if err := h.ensureReady(ctx, options); err != nil {
		return nil, err
	}
	if hooks == nil {
		return h.scope().Exec(ctx, input)
	}
	return h.scope().Exec(ctx, input, hooks)
}

// ExecStream runs a shell command and streams parsed stdout/stderr once sandbox is ready.
func (h *SandboxHandle) ExecStream(ctx context.Context, input ExecInput, runtimeOptions ...RuntimeOptions) (*ExecStream, error) {
	options := firstRuntimeOptions(runtimeOptions...)
	if err := h.ensureReady(ctx, options); err != nil {
		return nil, err
	}
	return h.scope().ExecStream(ctx, input)
}

// RunCode runs a code snippet once sandbox is ready.
func (h *SandboxHandle) RunCode(ctx context.Context, input CodeInput, runtimeOptions ...RuntimeOptions) (*ExecResult, error) {
	return h.RunCodeWithHooks(ctx, input, nil, runtimeOptions...)
}

// RunCodeWithHooks runs a code snippet and optionally streams live stdout/stderr.
func (h *SandboxHandle) RunCodeWithHooks(ctx context.Context, input CodeInput, hooks *ExecHooks, runtimeOptions ...RuntimeOptions) (*ExecResult, error) {
	options := firstRuntimeOptions(runtimeOptions...)
	if err := h.ensureReady(ctx, options); err != nil {
		return nil, err
	}
	if hooks == nil {
		return h.scope().RunCode(ctx, input)
	}
	return h.scope().RunCode(ctx, input, hooks)
}

// RunCodeStream runs a code snippet and streams parsed stdout/stderr once sandbox is ready.
func (h *SandboxHandle) RunCodeStream(ctx context.Context, input CodeInput, runtimeOptions ...RuntimeOptions) (*ExecStream, error) {
	options := firstRuntimeOptions(runtimeOptions...)
	if err := h.ensureReady(ctx, options); err != nil {
		return nil, err
	}
	return h.scope().RunCodeStream(ctx, input)
}

// PutFile uploads file bytes once sandbox is ready.
func (h *SandboxHandle) PutFile(ctx context.Context, path string, body io.Reader, contentLength int64, runtimeOptions ...RuntimeOptions) error {
	options := firstRuntimeOptions(runtimeOptions...)
	if err := h.ensureReady(ctx, options); err != nil {
		return err
	}
	return h.scope().PutFile(ctx, path, body, contentLength)
}

// GetFile downloads file bytes once sandbox is ready.
func (h *SandboxHandle) GetFile(ctx context.Context, path string, runtimeOptions ...RuntimeOptions) (io.ReadCloser, error) {
	options := firstRuntimeOptions(runtimeOptions...)
	if err := h.ensureReady(ctx, options); err != nil {
		return nil, err
	}
	return h.scope().GetFile(ctx, path)
}

// PutFiles uploads multiple files in one call once sandbox is ready.
func (h *SandboxHandle) PutFiles(ctx context.Context, files []BatchFileUploadItem, runtimeOptions ...RuntimeOptions) (*BatchFileUploadSummary, error) {
	options := firstRuntimeOptions(runtimeOptions...)
	if err := h.ensureReady(ctx, options); err != nil {
		return nil, err
	}
	return h.scope().PutFiles(ctx, files)
}

// Stats fetches sandbox stats once ready.
func (h *SandboxHandle) Stats(ctx context.Context, query StatsQuery, runtimeOptions ...RuntimeOptions) (*Stats, error) {
	options := firstRuntimeOptions(runtimeOptions...)
	if err := h.ensureReady(ctx, options); err != nil {
		return nil, err
	}
	return h.scope().Stats(ctx, query)
}

// CreateSnapshot creates a snapshot once sandbox is ready.
func (h *SandboxHandle) CreateSnapshot(ctx context.Context, input CreateSnapshotInput, runtimeOptions ...RuntimeOptions) (*Snapshot, error) {
	options := firstRuntimeOptions(runtimeOptions...)
	if err := h.ensureReady(ctx, options); err != nil {
		return nil, err
	}
	return h.scope().CreateSnapshot(ctx, input)
}

// ListSnapshots lists snapshots once sandbox is ready.
func (h *SandboxHandle) ListSnapshots(ctx context.Context, query Pagination, runtimeOptions ...RuntimeOptions) (*Paginated[Snapshot], error) {
	options := firstRuntimeOptions(runtimeOptions...)
	if err := h.ensureReady(ctx, options); err != nil {
		return nil, err
	}
	return h.scope().ListSnapshots(ctx, query)
}

// Create creates a snapshot for this sandbox.
func (s *SandboxHandleSnapshots) Create(ctx context.Context, input CreateSnapshotInput, runtimeOptions ...RuntimeOptions) (*Snapshot, error) {
	return s.handle.CreateSnapshot(ctx, input, runtimeOptions...)
}

// List lists snapshots for this sandbox.
func (s *SandboxHandleSnapshots) List(ctx context.Context, query Pagination, runtimeOptions ...RuntimeOptions) (*Paginated[Snapshot], error) {
	return s.handle.ListSnapshots(ctx, query, runtimeOptions...)
}

func firstRuntimeOptions(options ...RuntimeOptions) *RuntimeOptions {
	if len(options) == 0 {
		return nil
	}
	copy := options[0]
	return &copy
}
