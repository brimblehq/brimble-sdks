package sandbox

import (
	"context"
	"fmt"
	"io"
	"os"
	"testing"
	"time"
)

func chooseTemplateName(templates []SandboxTemplate) string {
	for _, template := range templates {
		if template.Name == "node-22" {
			return "node-22"
		}
	}

	if len(templates) == 0 || templates[0].Name == "" {
		return ""
	}
	return templates[0].Name
}

func newLiveClient(t *testing.T) *Client {
	t.Helper()

	apiKey := os.Getenv(SandboxAPIKeyEnvName)
	if apiKey == "" {
		t.Skipf("%s is not set", SandboxAPIKeyEnvName)
	}

	client, err := NewClient(ClientConfig{APIKey: apiKey})
	if err != nil {
		t.Fatalf("new client: %v", err)
	}

	return client
}

func TestIntegrationDiscovery(t *testing.T) {
	client := newLiveClient(t)
	ctx := context.Background()

	templates, err := client.Sandboxes.ListTemplates(ctx)
	if err != nil {
		t.Fatalf("list templates: %v", err)
	}
	if len(templates) == 0 {
		t.Fatalf("expected non-empty templates")
	}

	regions, err := client.Sandboxes.ListRegions(ctx)
	if err != nil {
		t.Fatalf("list regions: %v", err)
	}
	if len(regions.Regions) == 0 {
		t.Fatalf("expected non-empty regions")
	}

	page, err := client.Sandboxes.List(ctx, TeamScopedPagination{Page: 1, Limit: 15})
	if err != nil {
		t.Fatalf("list sandboxes: %v", err)
	}
	if page.CurrentPage != 1 {
		t.Fatalf("unexpected current page: %d", page.CurrentPage)
	}
}

func TestIntegrationVolumeLifecycle(t *testing.T) {
	client := newLiveClient(t)
	ctx := context.Background()

	regions, err := client.Sandboxes.ListRegions(ctx)
	if err != nil {
		t.Fatalf("list regions: %v", err)
	}
	if len(regions.Regions) == 0 {
		t.Fatalf("expected non-empty regions")
	}
	regionID := regions.Regions[0].ID

	volume, err := client.Volumes.Create(ctx, CreateVolumeInput{
		Name:   fmt.Sprintf("go-sdk-int-%d", time.Now().Unix()),
		SizeGB: MinVolumeSizeGB,
		Region: regionID,
		Type:   VolumeTypeSandbox,
	})
	if err != nil {
		t.Fatalf("create volume: %v", err)
	}
	defer func() {
		_ = client.Volumes.Delete(ctx, volume.ID)
	}()

	fetched, err := client.Volumes.Get(ctx, volume.ID)
	if err != nil {
		t.Fatalf("get volume: %v", err)
	}
	if fetched.ID != volume.ID {
		t.Fatalf("expected volume %s, got %s", volume.ID, fetched.ID)
	}

	seen := false
	err = client.Volumes.Iterate(ctx, TeamScopedPagination{Limit: 15}, func(v Volume) error {
		if v.ID == volume.ID {
			seen = true
		}
		return nil
	})
	if err != nil {
		t.Fatalf("iterate volumes: %v", err)
	}
	if !seen {
		t.Fatalf("expected created volume to be listed")
	}
}

func TestIntegrationRuntimeSnapshotFlow(t *testing.T) {
	if os.Getenv("BRIMBLE_SANDBOX_RUN_PROVISIONER_TESTS") != "1" {
		t.Skip("set BRIMBLE_SANDBOX_RUN_PROVISIONER_TESTS=1 to run provisioner-dependent test")
	}

	client := newLiveClient(t)
	ctx := context.Background()

	templates, err := client.Sandboxes.ListTemplates(ctx)
	if err != nil {
		t.Fatalf("list templates: %v", err)
	}
	if len(templates) == 0 {
		t.Fatalf("expected templates")
	}
	templateName := chooseTemplateName(templates)
	if templateName == "" {
		t.Fatalf("failed to select template name")
	}

	handle, err := client.Sandboxes.CreateReady(ctx, CreateSandboxRequest{
		Template:         templateName,
		Persistent:       ptrBool(true),
		PersistentDiskGB: ptrInt(MinVolumeSizeGB),
	}, &WaitOptions{Timeout: 180 * time.Second, PollInterval: 2 * time.Second})
	if err != nil {
		t.Fatalf("create ready sandbox: %v", err)
	}
	defer func() {
		_ = handle.Destroy(ctx)
	}()

	execResult, err := handle.Exec(ctx, ExecInput{
		Cmd: "echo \"$SDK_ENV_TEST\"",
		Env: map[string]string{"SDK_ENV_TEST": "go-sdk-test"},
	})
	if err != nil {
		t.Fatalf("exec: %v", err)
	}
	if execResult.ExitCode != 0 {
		t.Fatalf("unexpected exec code: %d", execResult.ExitCode)
	}

	codeResult, err := handle.RunCode(ctx, CodeInput{
		Language: CodeLanguageNode,
		Code:     `console.log(process.env.SDK_CODE_ENV)`,
		Env:      map[string]string{"SDK_CODE_ENV": "ok"},
	})
	if err != nil {
		t.Fatalf("run code: %v", err)
	}
	if codeResult.ExitCode != 0 {
		t.Fatalf("unexpected run code exit: %d", codeResult.ExitCode)
	}

	batch, err := handle.PutFiles(ctx, []BatchFileUploadItem{
		{Path: "/tmp/go-batch-a.txt", Content: []byte("batch-a")},
		{Path: "/tmp/go-batch-b.txt", Content: []byte("batch-b")},
	})
	if err != nil {
		t.Fatalf("put batch files: %v", err)
	}
	if batch.Failed != 0 || len(batch.Results) != 2 {
		t.Fatalf("unexpected batch summary: %+v", batch)
	}

	fileReader, err := handle.GetFile(ctx, "tmp/go-batch-a.txt")
	if err != nil {
		t.Fatalf("get batch file: %v", err)
	}
	fileBytes, _ := io.ReadAll(fileReader)
	_ = fileReader.Close()
	if string(fileBytes) != "batch-a" {
		t.Fatalf("unexpected batch file contents: %q", string(fileBytes))
	}

	snapshot, err := handle.CreateSnapshot(ctx, CreateSnapshotInput{Name: fmt.Sprintf("go-snap-%d", time.Now().Unix())})
	if err != nil {
		t.Fatalf("create snapshot: %v", err)
	}

	page, err := handle.ListSnapshots(ctx, Pagination{Page: 1, Limit: 15})
	if err != nil {
		t.Fatalf("list snapshots: %v", err)
	}
	found := false
	for _, item := range page.Data {
		if item.ID == snapshot.ID {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected created snapshot in list")
	}
}

func ptrBool(v bool) *bool { return &v }
func ptrInt(v int) *int    { return &v }
