package sandbox

import (
	"context"
	"net/http"
	"strconv"
)

// StatsResource fetches stats for one sandbox.
type StatsResource struct {
	client    *Client
	sandboxID string
}

// Get fetches CPU/memory/network stats.
func (r *StatsResource) Get(ctx context.Context, query StatsQuery) (*Stats, error) {
	params := map[string]string{}
	if query.HoursAgo > 0 {
		params["hoursAgo"] = strconv.Itoa(query.HoursAgo)
	}

	var out Stats
	_, err := r.client.doJSON(ctx, http.MethodGet, "/sandboxes/"+r.sandboxID+"/stats", params, nil, &out)
	if err != nil {
		return nil, err
	}
	return &out, nil
}
