package sandbox

import (
	"context"
	"net/http"
	"strconv"
)

// SnapshotScopeResource manages snapshots for one sandbox.
type SnapshotScopeResource struct {
	client    *Client
	sandboxID string
}

// Create creates a snapshot for this sandbox.
func (r *SnapshotScopeResource) Create(ctx context.Context, input CreateSnapshotInput, options ...RequestOptions) (*Snapshot, error) {
	var out Snapshot
	_, err := r.client.doJSONWithOptions(ctx, http.MethodPost, "/sandboxes/"+r.sandboxID+"/snapshots", nil, input, &out, firstOptions(options...))
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// List lists snapshots for this sandbox.
func (r *SnapshotScopeResource) List(ctx context.Context, query Pagination, options ...RequestOptions) (*Paginated[Snapshot], error) {
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

	var out Paginated[Snapshot]
	_, err := r.client.doJSONWithOptions(ctx, http.MethodGet, "/sandboxes/"+r.sandboxID+"/snapshots", params, nil, &out, firstOptions(options...))
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// Iterate walks snapshot pages for this sandbox and calls fn for each snapshot.
func (r *SnapshotScopeResource) Iterate(ctx context.Context, query Pagination, fn func(Snapshot) error, options ...RequestOptions) error {
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

		for _, snapshot := range result.Data {
			if err := fn(snapshot); err != nil {
				return err
			}
		}

		if page >= result.TotalPages || len(result.Data) == 0 {
			return nil
		}
		page++
	}
}

// SnapshotsResource manages account-level snapshots.
type SnapshotsResource struct {
	client *Client
}

// ListAll lists all snapshots across sandboxes.
func (r *SnapshotsResource) ListAll(ctx context.Context, query Pagination, options ...RequestOptions) (*Paginated[Snapshot], error) {
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

	var out Paginated[Snapshot]
	_, err := r.client.doJSONWithOptions(ctx, http.MethodGet, "/sandboxes/snapshots", params, nil, &out, firstOptions(options...))
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// IterateAll walks account snapshots and calls fn for each item.
func (r *SnapshotsResource) IterateAll(ctx context.Context, query Pagination, fn func(Snapshot) error, options ...RequestOptions) error {
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

		result, err := r.ListAll(ctx, payload, options...)
		if err != nil {
			return err
		}

		for _, snapshot := range result.Data {
			if err := fn(snapshot); err != nil {
				return err
			}
		}

		if page >= result.TotalPages || len(result.Data) == 0 {
			return nil
		}
		page++
	}
}

// Delete deletes a snapshot by id.
func (r *SnapshotsResource) Delete(ctx context.Context, snapshotID string, options ...RequestOptions) error {
	_, err := r.client.doJSONWithOptions(ctx, http.MethodDelete, "/sandboxes/snapshots/"+snapshotID, nil, nil, nil, firstOptions(options...))
	return err
}
