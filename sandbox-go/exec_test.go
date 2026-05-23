package sandbox

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestExecForwardsEnvPayload(t *testing.T) {
	t.Parallel()

	var seen map[string]any

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/sandboxes/sandbox-1/exec" {
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
		_, _ = w.Write([]byte(`{"message":"Exec completed","data":{"stdout":"ok\n","stderr":"","exit_code":0,"duration_ms":6}}`))
	}))
	defer ts.Close()

	client, err := NewClient(ClientConfig{
		APIKey:  "test-key",
		BaseURL: ts.URL,
	})
	if err != nil {
		t.Fatalf("new client: %v", err)
	}

	_, err = client.Sandboxes.Use("sandbox-1").Exec(context.Background(), ExecInput{
		Cmd: "printenv HELLO",
		Env: map[string]string{"HELLO": "WORLD"},
	})
	if err != nil {
		t.Fatalf("exec: %v", err)
	}

	if seen["cmd"] != "printenv HELLO" {
		t.Fatalf("unexpected cmd: %#v", seen["cmd"])
	}

	env, ok := seen["env"].(map[string]any)
	if !ok {
		t.Fatalf("missing env payload: %#v", seen["env"])
	}
	if env["HELLO"] != "WORLD" {
		t.Fatalf("unexpected env payload: %#v", env)
	}
}

func TestRunCodeForwardsEnvPayload(t *testing.T) {
	t.Parallel()

	var seen map[string]any

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/sandboxes/sandbox-1/code" {
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
		_, _ = w.Write([]byte(`{"message":"Exec completed","data":{"stdout":"WORLD\n","stderr":"","exit_code":0,"duration_ms":9}}`))
	}))
	defer ts.Close()

	client, err := NewClient(ClientConfig{
		APIKey:  "test-key",
		BaseURL: ts.URL,
	})
	if err != nil {
		t.Fatalf("new client: %v", err)
	}

	_, err = client.Sandboxes.Use("sandbox-1").RunCode(context.Background(), CodeInput{
		Language: CodeLanguagePython,
		Code:     `import os; print(os.getenv("HELLO"))`,
		Env:      map[string]string{"HELLO": "WORLD"},
	})
	if err != nil {
		t.Fatalf("run code: %v", err)
	}

	if seen["language"] != string(CodeLanguagePython) {
		t.Fatalf("unexpected language: %#v", seen["language"])
	}

	env, ok := seen["env"].(map[string]any)
	if !ok {
		t.Fatalf("missing env payload: %#v", seen["env"])
	}
	if env["HELLO"] != "WORLD" {
		t.Fatalf("unexpected env payload: %#v", env)
	}
}
