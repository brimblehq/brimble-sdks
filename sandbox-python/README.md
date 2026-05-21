# brimble-sandbox

Python SDK for the Brimble Sandbox API.

## Install

```bash
pip install brimble-sandbox
```

## Quickstart

```python
from brimble_sandbox import Sandbox

client = Sandbox()  # reads BRIMBLE_SANDBOX_KEY from env

sandbox = client.sandboxes.create_ready(
    {
        "template": "node-22",
        "persistent": True,
        "persistentDiskGB": 20,
    }
)

result = sandbox.exec({"cmd": "node -v"})
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

## Ergonomic helpers

```python
# Create + wait in one call
created = client.sandboxes.create_ready({"template": "node-22"})

# Get + wait in one call
loaded = client.sandboxes.get_ready(created.id)

# Create volume + attach at sandbox creation time
with_volume = client.sandboxes.with_volume(
    {
        "sandbox": {"template": "node-22"},
        "volume": {"name": "workspace-disk", "sizeGB": 20},
    }
)

# Auto-wait on runtime calls
with_volume.exec({"cmd": "npm -v"}, wait_until_ready=True)

# Streaming SSE output
stream = with_volume.exec_stream({"cmd": "for i in 1 2 3; do echo $i; done"})

# Templates + regions
templates = client.sandboxes.list_templates()
node_template = client.sandboxes.get_template("node-22")
regions = client.sandboxes.list_regions()

# Iterate through all sandboxes
for sb in client.sandboxes.iterate({"teamId": "<team>"}):
    print(sb.id, sb.status)
```

Volume attachment is create-time only.
Use `create(..., volumeId=...)` or `with_volume(...)`.

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
    {"template": "node-22"},
    idempotency_key="create-sandbox-123",
)
```

If `region` is omitted, the SDK resolves the first available sandbox region automatically.
