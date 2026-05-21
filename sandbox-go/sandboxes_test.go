package sandbox

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

func TestListTemplatesParsesWrappedTemplates(t *testing.T) {
	t.Parallel()

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/sandbox/templates" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}

		if got := r.Header.Get("x-brimble-key"); got != "test-key" {
			t.Fatalf("unexpected key header: %s", got)
		}
		if got := r.Header.Get("source"); got != "sdk-package" {
			t.Fatalf("unexpected source header: %s", got)
		}
		if got := r.Header.Get("source-version"); got != SDKPackageVersion {
			t.Fatalf("unexpected source-version header: %s", got)
		}

		w.Header().Set("content-type", "application/json")
		_, _ = w.Write([]byte(`{"message":"Templates fetched","data":{"templates":[{"name":"node-22","display_name":"Node.js 22","description":"Node runtime"}]}}`))
	}))
	defer ts.Close()

	client, err := NewClient(ClientConfig{
		APIKey:  "test-key",
		BaseURL: ts.URL,
	})
	if err != nil {
		t.Fatalf("new client: %v", err)
	}

	templates, err := client.Sandboxes.ListTemplates(context.Background())
	if err != nil {
		t.Fatalf("list templates: %v", err)
	}
	if len(templates) != 1 {
		t.Fatalf("expected 1 template, got %d", len(templates))
	}
	if templates[0].Name != "node-22" {
		t.Fatalf("unexpected template name: %s", templates[0].Name)
	}
}

func TestClientRequiresAPIKey(t *testing.T) {
	prev, had := os.LookupEnv(SandboxAPIKeyEnvName)
	if had {
		defer os.Setenv(SandboxAPIKeyEnvName, prev)
	} else {
		defer os.Unsetenv(SandboxAPIKeyEnvName)
	}
	_ = os.Unsetenv(SandboxAPIKeyEnvName)

	_, err := NewClient(ClientConfig{})
	if err == nil {
		t.Fatalf("expected API key error")
	}
}
