package sandbox

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPutBatchUploadsBase64Payload(t *testing.T) {
	t.Parallel()

	var seen map[string]any

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/sandboxes/sandbox-1/files/batch" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if r.Method != http.MethodPost {
			t.Fatalf("unexpected method: %s", r.Method)
		}

		defer r.Body.Close()
		if err := json.NewDecoder(r.Body).Decode(&seen); err != nil {
			t.Fatalf("decode body: %v", err)
		}

		w.Header().Set("content-type", "application/json")
		_, _ = w.Write([]byte(`{"message":"Batch file upload completed","data":{"uploaded":2,"failed":0,"results":[{"path":"/tmp/a.txt","bytes":5,"success":true},{"path":"/tmp/b.txt","bytes":4,"success":true}]}}`))
	}))
	defer ts.Close()

	client, err := NewClient(ClientConfig{
		APIKey:  "test-key",
		BaseURL: ts.URL,
	})
	if err != nil {
		t.Fatalf("new client: %v", err)
	}

	result, err := client.Sandboxes.Use("sandbox-1").PutFiles(context.Background(), []BatchFileUploadItem{
		{Path: "tmp/a.txt", Content: []byte("hello")},
		{Path: "/tmp/b.txt", Content: []byte{1, 2, 3, 4}},
	})
	if err != nil {
		t.Fatalf("put files: %v", err)
	}

	if result.Uploaded != 2 || result.Failed != 0 {
		t.Fatalf("unexpected summary: %+v", result)
	}

	files, ok := seen["files"].([]any)
	if !ok || len(files) != 2 {
		t.Fatalf("unexpected files payload: %#v", seen["files"])
	}

	first, _ := files[0].(map[string]any)
	second, _ := files[1].(map[string]any)
	if first["path"] != "/tmp/a.txt" || first["content_base64"] != "aGVsbG8=" {
		t.Fatalf("unexpected first payload: %#v", first)
	}
	if second["path"] != "/tmp/b.txt" || second["content_base64"] != "AQIDBA==" {
		t.Fatalf("unexpected second payload: %#v", second)
	}
}

func TestPutBatchValidatesBounds(t *testing.T) {
	t.Parallel()

	client, err := NewClient(ClientConfig{APIKey: "test-key"})
	if err != nil {
		t.Fatalf("new client: %v", err)
	}

	scope := client.Sandboxes.Use("sandbox-1")

	if _, err := scope.PutFiles(context.Background(), []BatchFileUploadItem{}); err == nil {
		t.Fatalf("expected error for empty file list")
	}

	tooMany := make([]BatchFileUploadItem, 101)
	for idx := range tooMany {
		tooMany[idx] = BatchFileUploadItem{Path: "/tmp/x.txt", Content: []byte("x")}
	}
	if _, err := scope.PutFiles(context.Background(), tooMany); err == nil {
		t.Fatalf("expected error for >100 files")
	}
}
