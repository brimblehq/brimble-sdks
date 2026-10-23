# @brimble/sandbox

TypeScript SDK for the Brimble Sandbox API.

## Install

```bash
npm install @brimble/sandbox
```

## Testing

```bash
# Unit tests (mocked transport, no API key required)
npm run test

# Live integration test (creates a sandbox, runs a command, then destroys it)
BRIMBLE_SANDBOX_KEY=your_key_here npm run test:integration

# Run both
BRIMBLE_SANDBOX_KEY=your_key_here npm run test:all
```

## Quickstart

```ts
import { CodeLanguage, Sandbox, SandboxSize } from '@brimble/sandbox';

const client = new Sandbox();

const sandbox = await client.sandboxes.create({
  template: 'node-22',
  size: SandboxSize.Micro,
});

console.log(sandbox.size);

await sandbox.exec({ cmd: 'node -v', env: { NODE_ENV: 'production' } });

await sandbox.putFile('tmp/notes.txt', Buffer.from('hello sandbox'));
await sandbox.putFiles([
  { path: '/tmp/hello.txt', body: 'hello from batch' },
  { path: '/tmp/config.json', body: JSON.stringify({ mode: 'dev' }) },
]);
const stream = await sandbox.getFile('tmp/notes.txt');

await sandbox.runCode({
  language: CodeLanguage.Node,
  code: 'console.log(1 + 1)',
  env: { FEATURE_FLAG: 'on' },
});

const existingSandbox = await client.sandboxes.get(sandbox.id);
await existingSandbox.destroy();
```

Set `BRIMBLE_SANDBOX_KEY` in your environment.  
If needed, pass `apiKey` explicitly in the constructor; explicit value wins over env.

### Size

Pass a named size. Freeform `specs` are not accepted by the API.

| Size | Constant |
|------|----------|
| `sbx.micro` | `SandboxSize.Micro` |
| `sbx.small` | `SandboxSize.Small` |
| `sbx.medium` | `SandboxSize.Medium` |

If `size` is omitted, the API uses the plan default. Allowed sizes are plan-gated.

### Create latency

`create()` is a blocking POST that returns a **ready** sandbox. With a warm pool seed, this is typically **~0.5–1s**. When the pool is empty, create fails with capacity exhausted (no silent cold boot).

### Current create constraints

Warm capacity path only supports:

- open egress
- non-persistent (no volume / CSI attach at create)
- no snapshot restore (`fromSnapshot`)
- no one-shot

Methods like `withVolume`, restricted egress, and `blockOutbound` remain on the client for later product paths; the live API rejects those create shapes today.

## Ergonomic helpers

```ts
import { Sandbox, SandboxSize } from '@brimble/sandbox';

const client = new Sandbox();

const created = await client.sandboxes.create({
  template: 'node-22',
  size: SandboxSize.Small,
});

const alsoReady = await client.sandboxes.createReady({ template: 'node-22' });

const loaded = await client.sandboxes.getReady(created.id);

await created.exec({ cmd: 'npm -v' }, { waitUntilReady: true });

const output = await created.exec({ cmd: 'for i in 1 2 3; do echo $i; done', stream: true });
for await (const log of output) {
  if (log.stream === 'stdout') process.stdout.write(log.data);
}
const streamedResult = await output.result();

const buffered = await created.exec({
  cmd: 'npm install',
  onStdout: (chunk) => process.stdout.write(chunk),
});

const file = await created.getFile('tmp/notes.txt');
for await (const chunk of file) {
  process.stdout.write(chunk);
}

const templates = await client.sandboxes.listTemplates();
const nodeTemplate = await client.sandboxes.getTemplate('node-22');
const { regions } = await client.sandboxes.listRegions();

for await (const sandbox of client.sandboxes.iterate({ teamId: '<team>' })) {
  console.log(sandbox.id, sandbox.status, sandbox.size);
}
```

## Handle composition

```ts
const sandbox = await client.sandboxes.get('<sandbox-id>');

await sandbox.snapshots.create({ name: 'before-migration' });
```

## Network egress

Default create uses **open** egress (required for warm pool).

```ts
import { Sandbox, SandboxEgressMode } from '@brimble/sandbox';

const client = new Sandbox();
const sandbox = await client.sandboxes.create({ template: 'node-22' });

const updated = await sandbox.updateEgress({
  mode: SandboxEgressMode.DenyAll,
});
console.log(updated.network_updated);
```

Modes: `open`, `restricted` (allowlist required), `deny_all`.  
Restricted / deny-all **at create** is rejected by the warm-pool API; update after create if the product path allows it.

## Retry, timeouts, and idempotency

```ts
const client = new Sandbox({
  timeoutMs: 30_000,
  retry: {
    maxAttempts: 3,
    baseDelayMs: 250,
    maxDelayMs: 2_000,
  },
});

await client.sandboxes.create(
  { template: 'node-22', size: 'sbx.micro' },
  { idempotencyKey: 'create-sandbox-123' },
);
```

If `region` is omitted or `auto`, the API assigns an enabled sandbox region. Pass a slug (e.g. `eu-west`) or region id to pin placement.

## Resources

- `client.sandboxes`
  - `create`, `createReady`, `withVolume`, `list`, `iterate`, `get`, `getReady`, `listRegions`, `listTemplates`, `getTemplate`, `destroy`, `pause`, `resume`, `updateEgress`, `quickstartNode`, `quickstartPython`, `use`
- `sandbox` handle (returned from `create/get/list`)
  - `waitUntilReady`, `refresh`, `destroy`, `pause`, `resume`, `updateEgress`, `exec`, `runCode`, `putFile`, `putFiles`, `getFile`, `stats`, `createSnapshot`, `listSnapshots`, `snapshots.create`, `snapshots.list`
- `client.sandboxes.use(id)`
  - `destroy`, `exec`, `runCode`, `putFile`, `putFiles`, `getFile`, `stats`, `createSnapshot`, `listSnapshots`
- `client.snapshots`
  - `listAll`, `iterateAll`, `delete`
- `client.volumes`
  - `list`, `iterate`, `create`, `get`, `delete`

## Errors

HTTP errors throw typed errors:

- `AuthError`
- `ValidationError`
- `NotFoundError`
- `RateLimitError`
- `SandboxApiError`

All include:

- `status`
- `message`
- `endpoint`
- `responseBody`
- `requestId`
