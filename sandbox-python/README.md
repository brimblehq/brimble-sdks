# brimble-sandbox

Python SDK for the Brimble Sandbox API.

## Install

```bash
pip install brimble-sandbox
```

## Quickstart

```python
from brimble_sandbox import Sandbox, SandboxSize

client = Sandbox()  # reads BRIMBLE_SANDBOX_KEY from env

sandbox = client.sandboxes.create(
    {
        "template": "node-22",
        "size": SandboxSize.MICRO,
    }
)

print(sandbox.size)

result = sandbox.exec({"cmd": "node -v", "env": {"NODE_ENV": "production"}})
print(result["stdout"])

sandbox.put_files(
    [
        {"path": "/tmp/hello.txt", "body": "hello from batch"},
        {"path": "/tmp/config.json", "body": '{"mode":"dev"}'},
    ]
)

existing = client.sandboxes.get(sandbox.id)
existing.destroy()
```

### Size

Pass a named size. Freeform `specs` are not accepted by the API.

| Size | Constant |
|------|----------|
| `sbx.micro` | `SandboxSize.MICRO` |
| `sbx.small` | `SandboxSize.SMALL` |
| `sbx.medium` | `SandboxSize.MEDIUM` |

If `size` is omitted, the API uses the plan default. Allowed sizes are plan-gated.

### Create latency

`create()` is a blocking POST that returns a **ready** sandbox. With a warm pool seed, this is typically **~0.5–1s**. When the pool is empty, create fails with capacity exhausted (no silent cold boot).

### Current create constraints

Warm capacity path only supports:

- open egress
- non-persistent (no volume / CSI attach at create)
- no snapshot restore (`fromSnapshot`)
- no one-shot

`with_volume`, restricted egress, and `blockOutbound` remain on the client; the live API rejects those create shapes today.

## Ergonomic helpers

```python
from brimble_sandbox import Sandbox, SandboxSize

client = Sandbox()

created = client.sandboxes.create(
    {"template": "node-22", "size": SandboxSize.SMALL}
)

also_ready = client.sandboxes.create_ready({"template": "node-22"})

loaded = client.sandboxes.get_ready(created.id)

created.exec({"cmd": "npm -v"}, wait_until_ready=True)

output = created.exec_stream({"cmd": "for i in 1 2 3; do echo $i; done"})
for log in output:
    if log["stream"] == "stdout":
        print(log["data"], end="")
result = output.result()

buffered = created.exec(
    {"cmd": "npm install"},
    on_stdout=lambda chunk: print(chunk, end=""),
)

file_stream = created.get_file("tmp/notes.txt")
for chunk in file_stream:
    print(chunk.decode("utf-8"), end="")
file_stream.close()

templates = client.sandboxes.list_templates()
node_template = client.sandboxes.get_template("node-22")
regions = client.sandboxes.list_regions()

for sb in client.sandboxes.iterate({"teamId": "<team>"}):
    print(sb.id, sb.status, sb.size)
```

## Network egress

Default create uses **open** egress (required for warm pool).

```python
from brimble_sandbox import Sandbox
from brimble_sandbox.enums import SandboxEgressMode

client = Sandbox()

sandbox = client.sandboxes.create({"template": "node-22"})

updated = sandbox.update_egress({"mode": SandboxEgressMode.DENY_ALL})
print(updated.get("network_updated"))
```

Modes: `open`, `restricted` (allowlist required), `deny_all`.  
Restricted / deny-all **at create** is rejected by the warm-pool API; update after create if the product path allows it.

## Auth

Requests are authenticated with the `x-brimble-key` header.

- Pass `api_key` to `Sandbox(...)`
- Or set `BRIMBLE_SANDBOX_KEY` in your environment

## Retry, timeout, idempotency

```python
from brimble_sandbox import RetryOptions, Sandbox

client = Sandbox(
    retry=RetryOptions(max_attempts=3, base_delay_ms=250, max_delay_ms=2000),
)

sandbox = client.sandboxes.create(
    {"template": "node-22", "size": "sbx.micro"},
    idempotency_key="create-sandbox-123",
)
```

If `region` is omitted or `auto`, it is omitted from the create request and the API assigns an enabled sandbox region. Pass a slug (e.g. `eu-west`) or region id to pin placement.
