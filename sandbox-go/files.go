package sandbox

import (
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// FilesResource uploads/downloads files for one sandbox.
type FilesResource struct {
	client    *Client
	sandboxID string
}

// Put uploads bytes to a sandbox file path.
func (r *FilesResource) Put(ctx context.Context, path string, body io.Reader, contentLength int64) error {
	endpoint := "/sandboxes/" + r.sandboxID + "/files/" + encodeFilePath(path)
	return r.client.doBinary(ctx, http.MethodPut, endpoint, nil, body, contentLength)
}

// Get downloads a sandbox file as a stream.
func (r *FilesResource) Get(ctx context.Context, path string) (io.ReadCloser, error) {
	endpoint := "/sandboxes/" + r.sandboxID + "/files/" + encodeFilePath(path)
	return r.client.doStream(ctx, http.MethodGet, endpoint, nil)
}

// PutBatch uploads multiple files in one request using base64 JSON payloads.
func (r *FilesResource) PutBatch(ctx context.Context, files []BatchFileUploadItem) (*BatchFileUploadSummary, error) {
	if len(files) == 0 {
		return nil, fmt.Errorf("PutBatch requires at least one file")
	}
	if len(files) > 100 {
		return nil, fmt.Errorf("PutBatch supports at most 100 files per request")
	}

	payload := sandboxBatchFileUploadInput{Files: make([]sandboxFileUploadInput, 0, len(files))}
	for _, file := range files {
		payload.Files = append(payload.Files, sandboxFileUploadInput{
			Path:          normalizeBatchPath(file.Path),
			ContentBase64: base64.StdEncoding.EncodeToString(file.Content),
		})
	}

	var out BatchFileUploadSummary
	_, err := r.client.doJSON(ctx, http.MethodPost, "/sandboxes/"+r.sandboxID+"/files/batch", nil, payload, &out)
	if err != nil {
		return nil, err
	}

	return &out, nil
}

func normalizeBatchPath(path string) string {
	if strings.HasPrefix(path, "/") {
		return path
	}
	return "/" + path
}
