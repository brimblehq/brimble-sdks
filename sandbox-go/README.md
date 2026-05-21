# sandbox-go

Go SDK for the Brimble Sandbox API.

## Install

```bash
go get github.com/brimblehq/brimble-sdks/sandbox-go
```

## Quickstart

```go
package main

import (
	"context"
	"fmt"

	sandbox "github.com/brimblehq/brimble-sdks/sandbox-go"
)

func main() {
	ctx := context.Background()

	client, err := sandbox.NewClient(sandbox.ClientConfig{}) // reads BRIMBLE_SANDBOX_KEY
	if err != nil {
		panic(err)
	}

	handle, err := client.Sandboxes.CreateReady(
		ctx,
		sandbox.CreateSandboxRequest{
			Template:        "node-22",
			Persistent:      ptrBool(true),
			PersistentDiskGB: ptrInt(20),
		},
		nil,
	)
	if err != nil {
		panic(err)
	}

result, err := handle.Exec(ctx, sandbox.ExecInput{Cmd: "node -v"})
if err != nil {
	panic(err)
}

fmt.Println(result.Stdout)

stream, err := handle.ExecStream(ctx, sandbox.ExecInput{Cmd: "for i in 1 2 3; do echo $i; done"})
if err != nil {
	panic(err)
}
defer stream.Close()

_, err = handle.PutFiles(ctx, []sandbox.BatchFileUploadItem{
	{Path: "/tmp/hello.txt", Content: []byte("hello from batch")},
	{Path: "/tmp/config.json", Content: []byte(`{"mode":"dev"}`)},
})
if err != nil {
	panic(err)
}
}

func ptrBool(v bool) *bool { return &v }
func ptrInt(v int) *int { return &v }
```

## Ergonomic helpers

- `Sandboxes.CreateReady(...)`
- `Sandboxes.GetReady(...)`
- `Sandboxes.WithVolume(...)`
- `Sandboxes.ListTemplates()` / `Sandboxes.GetTemplate(name)`
- `Sandboxes.Iterate(...)`
- `Volumes.Iterate(...)`
- `Snapshots.IterateAll(...)`
- `Sandboxes.QuickstartNode(...)` / `Sandboxes.QuickstartPython(...)`

Volume attachment is create-time only.
Use `CreateSandboxRequest{VolumeID: ...}` or `Sandboxes.WithVolume(...)`.

If `Region` is empty, the SDK resolves the first available sandbox region automatically.

## Errors

HTTP failures return typed errors:

- `*sandbox.AuthError`
- `*sandbox.ValidationError`
- `*sandbox.NotFoundError`
- `*sandbox.RateLimitError`
- `*sandbox.APIError`
