package sandbox

import (
	"context"
	"io"
	"strings"
	"testing"
)

func TestParseSSEFramesIgnoresComments(t *testing.T) {
	t.Parallel()

	payload := strings.NewReader(
		": open\n\n" +
			`data: {"type":"stdout","data":"line-1\n"}` + "\n\n" +
			": ping\n\n" +
			`data: {"type":"done","exit_code":0,"duration_ms":12}` + "\n\n",
	)

	frames, err := parseSSEFrames(payload)
	if err != nil {
		t.Fatalf("parse frames: %v", err)
	}

	if len(frames) != 2 {
		t.Fatalf("expected 2 frames, got %d", len(frames))
	}
	if frames[0].Type != "stdout" || frames[0].Data != "line-1\n" {
		t.Fatalf("unexpected stdout frame: %+v", frames[0])
	}
	if frames[1].Type != "done" || frames[1].ExitCode != 0 {
		t.Fatalf("unexpected done frame: %+v", frames[1])
	}
}

func TestExecStreamIterateLogsAndResult(t *testing.T) {
	t.Parallel()

	body := io.NopCloser(strings.NewReader(
		`data: {"type":"stdout","data":"one\n"}` + "\n\n" +
			`data: {"type":"stderr","data":"warn\n"}` + "\n\n" +
			`data: {"type":"done","exit_code":0,"duration_ms":4}` + "\n\n",
	))

	stream := newExecStream(body)
	ctx := context.Background()

	logs := make([]ExecLog, 0)
	if err := stream.IterateLogs(ctx, func(log ExecLog) error {
		logs = append(logs, log)
		return nil
	}); err != nil {
		t.Fatalf("iterate logs: %v", err)
	}

	result, err := stream.Result(ctx)
	if err != nil {
		t.Fatalf("result: %v", err)
	}

	if len(logs) != 2 {
		t.Fatalf("expected 2 logs, got %d", len(logs))
	}
	if result.ExitCode != 0 || result.Stdout != "one\n" || result.Stderr != "warn\n" {
		t.Fatalf("unexpected result: %+v", result)
	}
}
