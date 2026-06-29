package sandbox

import (
	"context"
	"fmt"
	"net/http"
)

// ExecResource runs commands/code for one sandbox.
type ExecResource struct {
	client    *Client
	sandboxID string
}

// Exec runs a shell command.
func (r *ExecResource) Exec(ctx context.Context, input ExecInput, hooks ...*ExecHooks) (*ExecResult, error) {
	if input.Stream != nil && *input.Stream {
		return nil, fmt.Errorf("stream=true returns a parsed stream. use ExecStream")
	}

	h := firstExecHooks(hooks...)
	if wantsLiveOutput(h) {
		stream, err := r.ExecStream(ctx, input)
		if err != nil {
			return nil, err
		}
		return consumeExecStream(ctx, stream, h)
	}

	var out ExecResult
	_, err := r.client.doJSON(ctx, http.MethodPost, "/sandboxes/"+r.sandboxID+"/exec", nil, input, &out)
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// ExecStream runs a shell command and returns parsed live output.
func (r *ExecResource) ExecStream(ctx context.Context, input ExecInput) (*ExecStream, error) {
	stream := true
	input.Stream = &stream
	body, err := r.client.doSSEStream(ctx, http.MethodPost, "/sandboxes/"+r.sandboxID+"/exec", input)
	if err != nil {
		return nil, err
	}
	return newExecStream(body), nil
}

// RunCode runs a code snippet.
func (r *ExecResource) RunCode(ctx context.Context, input CodeInput, hooks ...*ExecHooks) (*ExecResult, error) {
	if input.Stream != nil && *input.Stream {
		return nil, fmt.Errorf("stream=true returns a parsed stream. use RunCodeStream")
	}

	h := firstExecHooks(hooks...)
	if wantsLiveOutput(h) {
		stream, err := r.RunCodeStream(ctx, input)
		if err != nil {
			return nil, err
		}
		return consumeExecStream(ctx, stream, h)
	}

	var out ExecResult
	_, err := r.client.doJSON(ctx, http.MethodPost, "/sandboxes/"+r.sandboxID+"/code", nil, input, &out)
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// RunCodeStream runs a code snippet and returns parsed live output.
func (r *ExecResource) RunCodeStream(ctx context.Context, input CodeInput) (*ExecStream, error) {
	stream := true
	input.Stream = &stream
	body, err := r.client.doSSEStream(ctx, http.MethodPost, "/sandboxes/"+r.sandboxID+"/code", input)
	if err != nil {
		return nil, err
	}
	return newExecStream(body), nil
}
