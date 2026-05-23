package sandbox

import (
	"context"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
)

var mountPathPattern = regexp.MustCompile(`^/[A-Za-z0-9._/-]*$`)

// SandboxesResource manages sandbox lifecycle operations.
type SandboxesResource struct {
	client *Client
}

// Create creates a sandbox and returns a handle for direct runtime operations.
// Region is optional; empty or "auto" resolves the first available region.
func (r *SandboxesResource) Create(ctx context.Context, input CreateSandboxRequest, options ...RequestOptions) (*SandboxHandle, error) {
	requestOptions := firstOptions(options...)
	applyMountPathDefault(&input)
	if err := validateMountPath(input); err != nil {
		return nil, err
	}

	resolvedRegion, err := r.resolveCreateRegionID(ctx, input, requestOptions)
	if err != nil {
		return nil, err
	}
	input.Region = resolvedRegion

	var out CreateSandboxResult
	_, err = r.client.doJSONWithOptions(ctx, http.MethodPost, "/sandboxes", nil, input, &out, requestOptions)
	if err != nil {
		return nil, err
	}
	return newSandboxHandle(r, out), nil
}

// CreateReady creates a sandbox and waits until it becomes ready.
func (r *SandboxesResource) CreateReady(ctx context.Context, input CreateSandboxRequest, wait *WaitOptions, options ...RequestOptions) (*SandboxHandle, error) {
	handle, err := r.Create(ctx, input, options...)
	if err != nil {
		return nil, err
	}

	if wait == nil {
		_, err = handle.WaitUntilReady(ctx)
	} else {
		_, err = handle.WaitUntilReadyWithOptions(ctx, wait.Timeout, wait.PollInterval)
	}
	if err != nil {
		return nil, err
	}

	return handle, nil
}

// WithVolume creates a sandbox-only volume, then creates a sandbox attached to it.
func (r *SandboxesResource) WithVolume(ctx context.Context, input CreateSandboxWithVolumeInput, options ...RequestOptions) (*SandboxHandle, error) {
	requestOptions := firstOptions(options...)

	regionHint := input.Sandbox.Region
	if regionHint == "" {
		regionHint = input.Volume.Region
	}
	resolvedRegion, err := r.resolveRegionID(ctx, regionHint, requestOptions)
	if err != nil {
		return nil, err
	}

	volumeInput := input.Volume
	volumeInput.Region = resolvedRegion
	volumeInput.Type = VolumeTypeSandbox
	volume, err := r.client.Volumes.Create(ctx, volumeInput, options...)
	if err != nil {
		return nil, err
	}

	sandboxInput := input.Sandbox
	sandboxInput.Region = resolvedRegion
	sandboxInput.VolumeID = volume.ID

	return r.Create(ctx, sandboxInput, options...)
}

// List lists sandboxes with pagination and returns sandbox handles.
func (r *SandboxesResource) List(ctx context.Context, query TeamScopedPagination, options ...RequestOptions) (*Paginated[*SandboxHandle], error) {
	dataPage, err := r.ListData(ctx, query, options...)
	if err != nil {
		return nil, err
	}

	handles := make([]*SandboxHandle, 0, len(dataPage.Data))
	for _, sandbox := range dataPage.Data {
		handles = append(handles, newSandboxHandle(r, CreateSandboxResult{
			ID:        sandbox.ID,
			Name:      sandbox.Name,
			Template:  sandbox.Template,
			Status:    sandbox.Status,
			CreatedAt: sandbox.CreatedAt,
			ExpiresAt: sandbox.ExpiresAt,
		}))
		snapshot := sandbox
		handles[len(handles)-1].latest = &snapshot
	}

	return &Paginated[*SandboxHandle]{
		Data:        handles,
		TotalCount:  dataPage.TotalCount,
		CurrentPage: dataPage.CurrentPage,
		TotalPages:  dataPage.TotalPages,
		Limit:       dataPage.Limit,
	}, nil
}

// ListData lists sandboxes with pagination and returns raw payloads.
func (r *SandboxesResource) ListData(ctx context.Context, query TeamScopedPagination, options ...RequestOptions) (*Paginated[Sandbox], error) {
	page := query.Page
	if page <= 0 {
		page = DefaultPage
	}
	limit := query.Limit
	if limit <= 0 {
		limit = DefaultPageLimit
	}

	params := map[string]string{
		"page":  strconv.Itoa(page),
		"limit": strconv.Itoa(limit),
	}
	if query.TeamID != "" {
		params["teamId"] = query.TeamID
	}

	var out Paginated[Sandbox]
	_, err := r.client.doJSONWithOptions(ctx, http.MethodGet, "/sandboxes", params, nil, &out, firstOptions(options...))
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// Iterate walks all paginated sandboxes and calls fn for each handle.
func (r *SandboxesResource) Iterate(ctx context.Context, query TeamScopedPagination, fn func(*SandboxHandle) error, options ...RequestOptions) error {
	page := query.Page
	if page <= 0 {
		page = DefaultPage
	}
	limit := query.Limit
	if limit <= 0 {
		limit = DefaultPageLimit
	}

	for {
		payload := query
		payload.Page = page
		payload.Limit = limit

		result, err := r.List(ctx, payload, options...)
		if err != nil {
			return err
		}

		for _, sandbox := range result.Data {
			if err := fn(sandbox); err != nil {
				return err
			}
		}

		if page >= result.TotalPages || len(result.Data) == 0 {
			return nil
		}
		page++
	}
}

// Get fetches one sandbox handle by id.
func (r *SandboxesResource) Get(ctx context.Context, sandboxID string, options ...RequestOptions) (*SandboxHandle, error) {
	sandbox, err := r.GetData(ctx, sandboxID, options...)
	if err != nil {
		return nil, err
	}

	handle := newSandboxHandle(r, CreateSandboxResult{
		ID:        sandbox.ID,
		Name:      sandbox.Name,
		Template:  sandbox.Template,
		Status:    sandbox.Status,
		CreatedAt: sandbox.CreatedAt,
		ExpiresAt: sandbox.ExpiresAt,
	})
	handle.latest = sandbox
	return handle, nil
}

// GetReady fetches one sandbox and waits until ready.
func (r *SandboxesResource) GetReady(ctx context.Context, sandboxID string, wait *WaitOptions, options ...RequestOptions) (*SandboxHandle, error) {
	handle, err := r.Get(ctx, sandboxID, options...)
	if err != nil {
		return nil, err
	}

	if wait == nil {
		_, err = handle.WaitUntilReady(ctx)
	} else {
		_, err = handle.WaitUntilReadyWithOptions(ctx, wait.Timeout, wait.PollInterval)
	}
	if err != nil {
		return nil, err
	}

	return handle, nil
}

// GetData fetches one sandbox raw payload by id.
func (r *SandboxesResource) GetData(ctx context.Context, sandboxID string, options ...RequestOptions) (*Sandbox, error) {
	var out Sandbox
	_, err := r.client.doJSONWithOptions(ctx, http.MethodGet, "/sandboxes/"+sandboxID, nil, nil, &out, firstOptions(options...))
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// ListRegions lists regions where sandboxes can be provisioned.
func (r *SandboxesResource) ListRegions(ctx context.Context, options ...RequestOptions) (*SandboxRegionsResult, error) {
	var out SandboxRegionsResult
	_, err := r.client.doJSONWithOptions(ctx, http.MethodGet, "/sandboxes/regions", nil, nil, &out, firstOptions(options...))
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// ListTemplates lists available sandbox templates.
func (r *SandboxesResource) ListTemplates(ctx context.Context, options ...RequestOptions) ([]SandboxTemplate, error) {
	var out struct {
		Templates []SandboxTemplate `json:"templates"`
	}
	_, err := r.client.doJSONWithOptions(ctx, http.MethodGet, "/sandbox/templates", nil, nil, &out, firstOptions(options...))
	if err != nil {
		return nil, err
	}
	return out.Templates, nil
}

// GetTemplate gets one template by name.
func (r *SandboxesResource) GetTemplate(ctx context.Context, templateName string, options ...RequestOptions) (*SandboxTemplate, error) {
	templates, err := r.ListTemplates(ctx, options...)
	if err != nil {
		return nil, err
	}

	for _, template := range templates {
		if template.Name == templateName {
			copy := template
			return &copy, nil
		}
	}

	return nil, nil
}

// Destroy destroys a sandbox.
func (r *SandboxesResource) Destroy(ctx context.Context, sandboxID string, options ...RequestOptions) error {
	_, err := r.client.doJSONWithOptions(ctx, http.MethodDelete, "/sandboxes/"+sandboxID, nil, nil, nil, firstOptions(options...))
	return err
}

// Pause requests sandbox pause.
func (r *SandboxesResource) Pause(ctx context.Context, sandboxID string, options ...RequestOptions) (*AckMessage, error) {
	var out AckMessage
	_, err := r.client.doJSONWithOptions(ctx, http.MethodPost, "/sandboxes/"+sandboxID+"/pause", nil, nil, &out, firstOptions(options...))
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// Resume requests sandbox resume.
func (r *SandboxesResource) Resume(ctx context.Context, sandboxID string, options ...RequestOptions) (*AckMessage, error) {
	var out AckMessage
	_, err := r.client.doJSONWithOptions(ctx, http.MethodPost, "/sandboxes/"+sandboxID+"/resume", nil, nil, &out, firstOptions(options...))
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// Use returns scoped runtime operations for one sandbox.
func (r *SandboxesResource) Use(sandboxID string) *SandboxScope {
	return newSandboxScope(r.client, sandboxID)
}

// QuickstartNode creates a Node sandbox with practical defaults.
func (r *SandboxesResource) QuickstartNode(ctx context.Context, region string, wait bool, options ...RequestOptions) (*SandboxHandle, error) {
	disk := 20
	persistent := true

	handle, err := r.Create(ctx, CreateSandboxRequest{
		Region:           region,
		Template:         "node-22",
		Persistent:       &persistent,
		PersistentDiskGB: &disk,
		MountPath:        "/workspace",
	}, options...)
	if err != nil {
		return nil, err
	}

	if wait {
		if _, err := handle.WaitUntilReady(ctx); err != nil {
			return nil, err
		}
	}

	return handle, nil
}

// QuickstartPython creates a Python sandbox with practical defaults.
func (r *SandboxesResource) QuickstartPython(ctx context.Context, region string, wait bool, options ...RequestOptions) (*SandboxHandle, error) {
	disk := 20
	persistent := true

	handle, err := r.Create(ctx, CreateSandboxRequest{
		Region:           region,
		Template:         "python-3.12",
		Persistent:       &persistent,
		PersistentDiskGB: &disk,
		MountPath:        "/workspace",
	}, options...)
	if err != nil {
		return nil, err
	}

	if wait {
		if _, err := handle.WaitUntilReady(ctx); err != nil {
			return nil, err
		}
	}

	return handle, nil
}

func (r *SandboxesResource) resolveRegionID(ctx context.Context, region string, requestOptions *RequestOptions) (string, error) {
	if region != "" && region != "auto" {
		return region, nil
	}

	regions, err := r.ListRegions(ctx, derefOptions(requestOptions)...)
	if err != nil {
		return "", err
	}
	if len(regions.Regions) == 0 {
		return "", fmt.Errorf("no sandbox regions available for this account")
	}
	return regions.Regions[0].ID, nil
}

func (r *SandboxesResource) resolveCreateRegionID(ctx context.Context, input CreateSandboxRequest, requestOptions *RequestOptions) (string, error) {
	if input.Region != "" && input.Region != "auto" {
		return input.Region, nil
	}

	if input.VolumeID != "" {
		volume, err := r.client.Volumes.Get(ctx, input.VolumeID, derefOptions(requestOptions)...)
		if err != nil {
			return "", err
		}
		if volume.Region != nil && volume.Region.ID != "" {
			return volume.Region.ID, nil
		}

		return "", fmt.Errorf("unable to infer region from attached volume; pass `region` explicitly")
	}

	return r.resolveRegionID(ctx, "", requestOptions)
}

func validateMountPath(input CreateSandboxRequest) error {
	hasPersistent := input.Persistent != nil && *input.Persistent
	hasVolume := input.VolumeID != ""
	hasStorage := hasPersistent || hasVolume
	hasMountPath := input.MountPath != ""

	if hasStorage && !hasMountPath {
		return fmt.Errorf("mountPath is required when using persistent storage (`persistent`/`persistentDiskGB` or `volumeId`)")
	}

	if !hasMountPath {
		return nil
	}

	if !mountPathPattern.MatchString(input.MountPath) || input.MountPath == "/" {
		return fmt.Errorf("mountPath must match ^/[A-Za-z0-9._/-]*$ and cannot be \"/\"")
	}

	if !hasPersistent && !hasVolume {
		return fmt.Errorf("mountPath requires either `persistent: true` or `volumeId`")
	}

	return nil
}

func applyMountPathDefault(input *CreateSandboxRequest) {
	hasPersistent := input.Persistent != nil && *input.Persistent
	hasVolume := input.VolumeID != ""
	hasStorage := hasPersistent || hasVolume
	if hasStorage && input.MountPath == "" {
		input.MountPath = "/workspace"
	}
}

func firstOptions(options ...RequestOptions) *RequestOptions {
	if len(options) == 0 {
		return nil
	}
	copy := options[0]
	return &copy
}

func derefOptions(option *RequestOptions) []RequestOptions {
	if option == nil {
		return nil
	}
	return []RequestOptions{*option}
}
