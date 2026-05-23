package sandbox

import (
	"context"
	"encoding/json"
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

func TestScopedDestroyDeletesSandboxByID(t *testing.T) {
	t.Parallel()

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			t.Fatalf("unexpected method: %s", r.Method)
		}
		if r.URL.Path != "/sandboxes/sandbox-123" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer ts.Close()

	client, err := NewClient(ClientConfig{
		APIKey:  "test-key",
		BaseURL: ts.URL,
	})
	if err != nil {
		t.Fatalf("new client: %v", err)
	}

	if err := client.Sandboxes.Use("sandbox-123").Destroy(context.Background()); err != nil {
		t.Fatalf("destroy: %v", err)
	}
}

func TestCreateForwardsMountPath(t *testing.T) {
	t.Parallel()

	var seen map[string]any

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("unexpected method: %s", r.Method)
		}
		if r.URL.Path != "/sandboxes" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}

		defer r.Body.Close()
		if err := json.NewDecoder(r.Body).Decode(&seen); err != nil {
			t.Fatalf("decode body: %v", err)
		}

		w.Header().Set("content-type", "application/json")
		_, _ = w.Write([]byte(`{"message":"created","data":{"id":"sandbox-1","name":"mount-test","template":"node-22","status":"starting","created_at":"2026-01-01T00:00:00.000Z","expires_at":"2026-01-01T00:30:00.000Z"}}`))
	}))
	defer ts.Close()

	client, err := NewClient(ClientConfig{
		APIKey:  "test-key",
		BaseURL: ts.URL,
	})
	if err != nil {
		t.Fatalf("new client: %v", err)
	}

	persistent := true
	disk := 20
	_, err = client.Sandboxes.Create(context.Background(), CreateSandboxRequest{
		Template:         "node-22",
		Region:           "region-1",
		Persistent:       &persistent,
		PersistentDiskGB: &disk,
		MountPath:        "/var/www/html",
	})
	if err != nil {
		t.Fatalf("create sandbox: %v", err)
	}

	if seen["mountPath"] != "/var/www/html" {
		t.Fatalf("unexpected mountPath: %#v", seen["mountPath"])
	}
}

func TestCreateMountPathRequiresPersistentOrVolumeID(t *testing.T) {
	t.Parallel()

	client, err := NewClient(ClientConfig{APIKey: "test-key"})
	if err != nil {
		t.Fatalf("new client: %v", err)
	}

	_, err = client.Sandboxes.Create(context.Background(), CreateSandboxRequest{
		Template:  "node-22",
		Region:    "region-1",
		MountPath: "/workspace",
	})
	if err == nil {
		t.Fatalf("expected validation error")
	}
}

func TestCreateDefaultsMountPathWhenStorageIsUsed(t *testing.T) {
	t.Parallel()

	var seen map[string]any

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("unexpected method: %s", r.Method)
		}
		if r.URL.Path != "/sandboxes" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}

		defer r.Body.Close()
		if err := json.NewDecoder(r.Body).Decode(&seen); err != nil {
			t.Fatalf("decode body: %v", err)
		}

		w.Header().Set("content-type", "application/json")
		_, _ = w.Write([]byte(`{"message":"created","data":{"id":"sandbox-1","name":"mount-default","template":"node-22","status":"starting","created_at":"2026-01-01T00:00:00.000Z","expires_at":"2026-01-01T00:30:00.000Z"}}`))
	}))
	defer ts.Close()

	client, err := NewClient(ClientConfig{
		APIKey:  "test-key",
		BaseURL: ts.URL,
	})
	if err != nil {
		t.Fatalf("new client: %v", err)
	}

	persistent := true
	disk := 20
	_, err = client.Sandboxes.Create(context.Background(), CreateSandboxRequest{
		Template:         "node-22",
		Region:           "region-1",
		Persistent:       &persistent,
		PersistentDiskGB: &disk,
	})
	if err != nil {
		t.Fatalf("create sandbox: %v", err)
	}

	if seen["mountPath"] != "/workspace" {
		t.Fatalf("expected default mountPath /workspace, got %#v", seen["mountPath"])
	}
}

func TestCreateRejectsInvalidMountPathPattern(t *testing.T) {
	t.Parallel()

	client, err := NewClient(ClientConfig{APIKey: "test-key"})
	if err != nil {
		t.Fatalf("new client: %v", err)
	}

	persistent := true
	disk := 20
	_, err = client.Sandboxes.Create(context.Background(), CreateSandboxRequest{
		Template:         "node-22",
		Region:           "region-1",
		Persistent:       &persistent,
		PersistentDiskGB: &disk,
		MountPath:        "/workspace?bad",
	})
	if err == nil {
		t.Fatalf("expected mountPath validation error")
	}
}

func TestCreateInfersRegionFromAttachedVolumeWhenOmitted(t *testing.T) {
	t.Parallel()

	var seen map[string]any

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet && r.URL.Path == "/volumes/volume-123" {
			w.Header().Set("content-type", "application/json")
			_, _ = w.Write([]byte(`{"message":"Volume fetched","data":{"id":"volume-123","name":"cache","type":"sandbox","team":null,"csi_volume_id":null,"size":20,"region":{"id":"region-from-volume","name":"Test","country":"US","continent":"NA","provider":"test","is_paid":false},"attached_sandbox_id":null,"attached_project_id":null,"last_attached_at":null,"created_at":null,"updated_at":null}}`))
			return
		}

		if r.Method == http.MethodPost && r.URL.Path == "/sandboxes" {
			defer r.Body.Close()
			if err := json.NewDecoder(r.Body).Decode(&seen); err != nil {
				t.Fatalf("decode body: %v", err)
			}

			w.Header().Set("content-type", "application/json")
			_, _ = w.Write([]byte(`{"message":"created","data":{"id":"sandbox-1","name":"attach-test","template":"node-22","status":"starting","created_at":"2026-01-01T00:00:00.000Z","expires_at":"2026-01-01T00:30:00.000Z"}}`))
			return
		}

		t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
	}))
	defer ts.Close()

	client, err := NewClient(ClientConfig{
		APIKey:  "test-key",
		BaseURL: ts.URL,
	})
	if err != nil {
		t.Fatalf("new client: %v", err)
	}

	_, err = client.Sandboxes.Create(context.Background(), CreateSandboxRequest{
		Template: "node-22",
		VolumeID: "volume-123",
	})
	if err != nil {
		t.Fatalf("create sandbox: %v", err)
	}

	if seen["region"] != "region-from-volume" {
		t.Fatalf("expected region-from-volume, got %#v", seen["region"])
	}
	if seen["mountPath"] != "/workspace" {
		t.Fatalf("expected default mountPath /workspace, got %#v", seen["mountPath"])
	}
}
