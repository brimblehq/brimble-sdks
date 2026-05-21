package sandbox

import (
	"context"
	"fmt"
	"io"
	"net/http"
)

// ExecResource runs commands/code for one sandbox.
type ExecResource struct {
	client    *Client
	sandboxID string
}

// Exec runs a shell command.
func (r *ExecResource) Exec(ctx context.Context, input ExecInput) (*ExecResult, error) {
	if input.Stream != nil && *input.Stream {
		return nil, fmt.Errorf("stream=true returns an SSE stream. use ExecStream")
	}

	var out ExecResult
	_, err := r.client.doJSON(ctx, http.MethodPost, "/sandboxes/"+r.sandboxID+"/exec", nil, input, &out)
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// ExecStream runs a shell command and returns an SSE stream (`text/event-stream`).
func (r *ExecResource) ExecStream(ctx context.Context, input ExecInput) (io.ReadCloser, error) {
	stream := true
	input.Stream = &stream
	return r.client.doSSEStream(ctx, http.MethodPost, "/sandboxes/"+r.sandboxID+"/exec", input)
}

// RunCode runs a code snippet.
func (r *ExecResource) RunCode(ctx context.Context, input CodeInput) (*ExecResult, error) {
	if input.Stream != nil && *input.Stream {
		return nil, fmt.Errorf("stream=true returns an SSE stream. use RunCodeStream")
	}

	var out ExecResult
	_, err := r.client.doJSON(ctx, http.MethodPost, "/sandboxes/"+r.sandboxID+"/code", nil, input, &out)
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// RunCodeStream runs a code snippet and returns an SSE stream (`text/event-stream`).
func (r *ExecResource) RunCodeStream(ctx context.Context, input CodeInput) (io.ReadCloser, error) {
	stream := true
	input.Stream = &stream
	return r.client.doSSEStream(ctx, http.MethodPost, "/sandboxes/"+r.sandboxID+"/code", input)
}
