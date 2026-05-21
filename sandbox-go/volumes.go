package sandbox

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
)

// VolumesResource manages volume lifecycle operations.
type VolumesResource struct {
	client *Client
}

// List lists volumes with pagination.
func (r *VolumesResource) List(ctx context.Context, query TeamScopedPagination, options ...RequestOptions) (*Paginated[Volume], error) {
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

	var out Paginated[Volume]
	_, err := r.client.doJSONWithOptions(ctx, http.MethodGet, "/volumes", params, nil, &out, firstOptions(options...))
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// Iterate walks volume pages and calls fn for each volume.
func (r *VolumesResource) Iterate(ctx context.Context, query TeamScopedPagination, fn func(Volume) error, options ...RequestOptions) error {
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

		for _, volume := range result.Data {
			if err := fn(volume); err != nil {
				return err
			}
		}

		if page >= result.TotalPages || len(result.Data) == 0 {
			return nil
		}
		page++
	}
}

// Create creates a volume.
// This package enforces type=sandbox and min size >= 10GB.
func (r *VolumesResource) Create(ctx context.Context, input CreateVolumeInput, options ...RequestOptions) (*Volume, error) {
	if input.Type != "" && input.Type != VolumeTypeSandbox {
		return nil, fmt.Errorf("only volume type %q is supported by this package", VolumeTypeSandbox)
	}
	if input.SizeGB < MinVolumeSizeGB {
		return nil, fmt.Errorf("volume size must be at least %dGB", MinVolumeSizeGB)
	}

	input.Type = VolumeTypeSandbox

	var out Volume
	_, err := r.client.doJSONWithOptions(ctx, http.MethodPost, "/volumes", nil, input, &out, firstOptions(options...))
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// Get fetches one volume by id.
func (r *VolumesResource) Get(ctx context.Context, volumeID string, options ...RequestOptions) (*Volume, error) {
	var out Volume
	_, err := r.client.doJSONWithOptions(ctx, http.MethodGet, "/volumes/"+volumeID, nil, nil, &out, firstOptions(options...))
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// Delete deletes one volume by id.
func (r *VolumesResource) Delete(ctx context.Context, volumeID string, options ...RequestOptions) error {
	_, err := r.client.doJSONWithOptions(ctx, http.MethodDelete, "/volumes/"+volumeID, nil, nil, nil, firstOptions(options...))
	return err
}
