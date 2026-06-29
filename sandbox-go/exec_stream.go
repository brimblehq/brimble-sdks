package sandbox

import (
	"context"
	"fmt"
	"io"
)

// LogStream identifies stdout or stderr output from a streaming exec call.
type LogStream string

const (
	LogStreamStdout LogStream = "stdout"
	LogStreamStderr LogStream = "stderr"
)

// ExecLog is one live stdout/stderr chunk from a streaming exec or runCode call.
type ExecLog struct {
	Stream LogStream
	Data   string
}

// ExecHooks receives live stdout/stderr chunks while a command runs.
type ExecHooks struct {
	OnStdout func(string)
	OnStderr func(string)
}

// ExecStream is parsed live output from ExecStream/RunCodeStream.
type ExecStream struct {
	body         io.ReadCloser
	cachedFrames []execStreamFrame
	loaded       bool
}

func newExecStream(body io.ReadCloser) *ExecStream {
	return &ExecStream{body: body}
}

// Close closes the underlying HTTP stream.
func (s *ExecStream) Close() error {
	if s.body == nil {
		return nil
	}
	return s.body.Close()
}

// IterateLogs calls fn for each stdout/stderr chunk as it arrives.
func (s *ExecStream) IterateLogs(ctx context.Context, fn func(ExecLog) error) error {
	return s.iterateFrames(ctx, func(frame execStreamFrame) error {
		if err := ctx.Err(); err != nil {
			return err
		}

		switch frame.Type {
		case "stdout":
			return fn(ExecLog{Stream: LogStreamStdout, Data: frame.Data})
		case "stderr":
			return fn(ExecLog{Stream: LogStreamStderr, Data: frame.Data})
		case "error":
			return fmt.Errorf("%s", frame.Message)
		default:
			return nil
		}
	})
}

// Result waits for completion and returns the aggregated command result.
func (s *ExecStream) Result(ctx context.Context) (*ExecResult, error) {
	if err := s.loadFrames(ctx); err != nil {
		return nil, err
	}

	return aggregateExecFrames(s.cachedFrames)
}

func (s *ExecStream) iterateFrames(ctx context.Context, fn func(execStreamFrame) error) error {
	if s.loaded {
		for _, frame := range s.cachedFrames {
			if err := ctx.Err(); err != nil {
				return err
			}
			if err := fn(frame); err != nil {
				return err
			}
		}
		return nil
	}

	frames := make([]execStreamFrame, 0)
	err := parseSSEFramesLive(s.body, func(frame execStreamFrame) error {
		if err := ctx.Err(); err != nil {
			return err
		}

		frames = append(frames, frame)
		return fn(frame)
	})
	if err != nil {
		return err
	}

	s.cachedFrames = frames
	s.loaded = true
	return s.body.Close()
}

func (s *ExecStream) loadFrames(ctx context.Context) error {
	return s.iterateFrames(ctx, func(execStreamFrame) error { return nil })
}

func aggregateExecFrames(frames []execStreamFrame) (*ExecResult, error) {
	result := &ExecResult{ExitCode: 1}
	sawDone := false

	for _, frame := range frames {
		switch frame.Type {
		case "stdout":
			result.Stdout += frame.Data
		case "stderr":
			result.Stderr += frame.Data
		case "done":
			result.ExitCode = frame.ExitCode
			result.DurationMS = frame.DurationMS
			sawDone = true
		case "error":
			return nil, fmt.Errorf("%s", frame.Message)
		}
	}

	if !sawDone {
		return nil, fmt.Errorf("command stream ended before completion")
	}

	return result, nil
}

func consumeExecStream(ctx context.Context, stream *ExecStream, hooks *ExecHooks) (*ExecResult, error) {
	err := stream.iterateFrames(ctx, func(frame execStreamFrame) error {
		if hooks == nil {
			return nil
		}

		switch frame.Type {
		case "stdout":
			if hooks.OnStdout != nil {
				hooks.OnStdout(frame.Data)
			}
		case "stderr":
			if hooks.OnStderr != nil {
				hooks.OnStderr(frame.Data)
			}
		case "error":
			return fmt.Errorf("%s", frame.Message)
		}

		return nil
	})
	if err != nil {
		return nil, err
	}

	return stream.Result(ctx)
}

func firstExecHooks(hooks ...*ExecHooks) *ExecHooks {
	if len(hooks) == 0 {
		return nil
	}
	return hooks[0]
}

func wantsLiveOutput(hooks *ExecHooks) bool {
	return hooks != nil && (hooks.OnStdout != nil || hooks.OnStderr != nil)
}
