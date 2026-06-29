package sandbox

import (
	"bufio"
	"encoding/json"
	"io"
	"strings"
)

type execStreamFrame struct {
	Type       string `json:"type"`
	Data       string `json:"data,omitempty"`
	ExitCode   int    `json:"exit_code,omitempty"`
	DurationMS int    `json:"duration_ms,omitempty"`
	Message    string `json:"message,omitempty"`
}

func parseSSEBlock(block string) (*execStreamFrame, error) {
	lines := strings.Split(block, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "data:") {
			continue
		}

		payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if payload == "" {
			return nil, nil
		}

		var frame execStreamFrame
		if err := json.Unmarshal([]byte(payload), &frame); err != nil {
			return nil, err
		}

		return &frame, nil
	}

	return nil, nil
}

func parseSSEFrames(body io.Reader) ([]execStreamFrame, error) {
	reader := bufio.NewReader(body)
	buffer := strings.Builder{}
	frames := make([]execStreamFrame, 0)

	for {
		chunk := make([]byte, 4096)
		n, err := reader.Read(chunk)
		if n > 0 {
			buffer.Write(chunk[:n])
		}

		for {
			current := buffer.String()
			idx := strings.Index(current, "\n\n")
			if idx == -1 {
				break
			}

			block := current[:idx]
			remaining := current[idx+2:]
			buffer.Reset()
			buffer.WriteString(remaining)

			frame, parseErr := parseSSEBlock(block)
			if parseErr != nil {
				return nil, parseErr
			}
			if frame != nil {
				frames = append(frames, *frame)
			}
		}

		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
	}

	if tail := strings.TrimSpace(buffer.String()); tail != "" {
		frame, parseErr := parseSSEBlock(tail)
		if parseErr != nil {
			return nil, parseErr
		}
		if frame != nil {
			frames = append(frames, *frame)
		}
	}

	return frames, nil
}

func parseSSEFramesLive(body io.Reader, onFrame func(execStreamFrame) error) error {
	reader := bufio.NewReader(body)
	buffer := strings.Builder{}

	for {
		chunk := make([]byte, 4096)
		n, err := reader.Read(chunk)
		if n > 0 {
			buffer.Write(chunk[:n])
		}

		for {
			current := buffer.String()
			idx := strings.Index(current, "\n\n")
			if idx == -1 {
				break
			}

			block := current[:idx]
			remaining := current[idx+2:]
			buffer.Reset()
			buffer.WriteString(remaining)

			frame, parseErr := parseSSEBlock(block)
			if parseErr != nil {
				return parseErr
			}
			if frame == nil {
				continue
			}
			if frameErr := onFrame(*frame); frameErr != nil {
				return frameErr
			}
		}

		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
	}

	if tail := strings.TrimSpace(buffer.String()); tail != "" {
		frame, parseErr := parseSSEBlock(tail)
		if parseErr != nil {
			return parseErr
		}
		if frame != nil {
			return onFrame(*frame)
		}
	}

	return nil
}
