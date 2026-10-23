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

	handle, err := client.Sandboxes.Create(
		ctx,
		sandbox.CreateSandboxRequest{
			Template: "node-22",
			Size:     sandbox.SandboxSizeMicro,
		},
	)
	if err != nil {
		panic(err)
	}

	if handle.Size != nil {
		fmt.Println(*handle.Size)
	}

	result, err := handle.Exec(ctx, sandbox.ExecInput{
		Cmd: "node -v",
		Env: map[string]string{"NODE_ENV": "production"},
	})
	if err != nil {
		panic(err)
	}

	fmt.Println(result.Stdout)

	output, err := handle.ExecStream(ctx, sandbox.ExecInput{Cmd: "for i in 1 2 3; do echo $i; done"})
	if err != nil {
		panic(err)
	}
	defer output.Close()

	if err := output.IterateLogs(ctx, func(log sandbox.ExecLog) error {
		if log.Stream == sandbox.LogStreamStdout {
			fmt.Print(log.Data)
		}
		return nil
	}); err != nil {
		panic(err)
	}

	if _, err := output.Result(ctx); err != nil {
		panic(err)
	}

	if _, err = handle.PutFiles(ctx, []sandbox.BatchFileUploadItem{
		{Path: "/tmp/hello.txt", Content: []byte("hello from batch")},
		{Path: "/tmp/config.json", Content: []byte(`{"mode":"dev"}`)},
	}); err != nil {
		panic(err)
	}
}
```

### Size

Pass a named size. Freeform specs are not accepted by the API.

| Size | Constant |
|------|----------|
| `sbx.micro` | `SandboxSizeMicro` |
| `sbx.small` | `SandboxSizeSmall` |
| `sbx.medium` | `SandboxSizeMedium` |

If `Size` is empty, the API uses the plan default. Allowed sizes are plan-gated.

### Create latency

`Create` is a blocking call that returns a **ready** sandbox. With a warm pool seed, this is typically **~0.5–1s**. When the pool is empty, create fails with capacity exhausted (no silent cold boot).

### Current create constraints

Warm capacity path only supports:

- open egress
- non-persistent (no volume / CSI attach at create)
- no snapshot restore (`FromSnapshot`)
- no one-shot

`WithVolume`, restricted egress, and `BlockOutbound` remain on the client; the live API rejects those create shapes today.

## Ergonomic helpers

- `Sandboxes.CreateReady(...)`
- `Sandboxes.GetReady(...)`
- `Sandboxes.WithVolume(...)`
- `Sandboxes.ListTemplates()` / `Sandboxes.GetTemplate(name)`
- `Sandboxes.Iterate(...)`
- `Volumes.Iterate(...)`
- `Snapshots.IterateAll(...)`
- `Sandboxes.QuickstartNode(...)` / `Sandboxes.QuickstartPython(...)`

## Network egress

Default create uses **open** egress (required for warm pool).

```go
handle, err := client.Sandboxes.Create(ctx, sandbox.CreateSandboxRequest{
	Template: "node-22",
	Size:     sandbox.SandboxSizeMicro,
})

updated, err := handle.UpdateEgress(ctx, sandbox.UpdateSandboxEgressInput{
	Mode: sandbox.SandboxEgressModeDenyAll,
})
_ = updated.NetworkUpdated
```

Modes: `open`, `restricted` (allowlist required), `deny_all`.  
Restricted / deny-all **at create** is rejected by the warm-pool API; update after create if the product path allows it.

If `Region` is empty or `auto`, it is omitted from the create request and the API assigns an enabled sandbox region. Pass a slug (e.g. `eu-west`) or region id to pin placement. `ListRegions` remains available for discovery.

## Errors

HTTP failures return typed errors:

- `*sandbox.AuthError`
- `*sandbox.ValidationError`
- `*sandbox.NotFoundError`
- `*sandbox.RateLimitError`
- `*sandbox.APIError`
