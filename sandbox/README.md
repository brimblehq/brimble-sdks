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
import { CodeLanguage, Sandbox } from '@brimble/sandbox';

const client = new Sandbox();

const sandbox = await client.sandboxes.createReady({
  template: 'node-22',
  persistent: true,
  persistentDiskGB: 20,
  mountPath: '/workspace',
});

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

// Handle-first lifecycle on existing sandboxes.
const existingSandbox = await client.sandboxes.get(sandbox.id);
await existingSandbox.destroy();
```

Set `BRIMBLE_SANDBOX_KEY` in your environment.  
If needed, pass `apiKey` explicitly in the constructor; explicit value wins over env.

## Ergonomic helpers

```ts
// 1) Create + wait in one call
const created = await client.sandboxes.createReady({ template: 'node-22' });

// 2) Get + wait in one call
const loaded = await client.sandboxes.getReady(created.id);

// 3) Create a volume + attach in one call
const withVolume = await client.sandboxes.withVolume({
  sandbox: { template: 'node-22', mountPath: '/var/www/html' },
  volume: { name: 'workspace-disk', sizeGB: 20 },
});

// 4) Auto-wait at runtime call sites
await withVolume.exec({ cmd: 'npm -v' }, { waitUntilReady: true });

// Streaming command output (Vercel/Railway-style async iteration)
const output = await withVolume.exec({ cmd: 'for i in 1 2 3; do echo $i; done', stream: true });
for await (const log of output) {
  if (log.stream === 'stdout') process.stdout.write(log.data);
}
const streamedResult = await output.result();

// Or stream with callbacks and still get the final ExecResult
const buffered = await withVolume.exec({
  cmd: 'npm install',
  onStdout: (chunk) => process.stdout.write(chunk),
});

// File downloads
const file = await withVolume.getFile('tmp/notes.txt');
for await (const chunk of file) {
  process.stdout.write(chunk);
}

// 5) List templates/regions
const templates = await client.sandboxes.listTemplates();
const nodeTemplate = await client.sandboxes.getTemplate('node-22');
const { regions } = await client.sandboxes.listRegions();

// 6) Async iterators for pagination
for await (const sandbox of client.sandboxes.iterate({ teamId: '<team>' })) {
  console.log(sandbox.id, sandbox.status);
}
```

## Handle composition

```ts
const sandbox = await client.sandboxes.get('<sandbox-id>');

await sandbox.snapshots.create({ name: 'before-migration' });
```

Volume attachment is create-time only.  
Use `client.sandboxes.create({ ..., volumeId })` or `client.sandboxes.withVolume(...)`.

## Network egress

Control outbound network access when creating or updating a sandbox.

```ts
import { Sandbox, SandboxEgressMode } from '@brimble/sandbox';

const client = new Sandbox();

// Create with restricted egress (allowlist)
const sandbox = await client.sandboxes.createReady({
  template: 'node-22',
  egress: {
    mode: SandboxEgressMode.Restricted,
    allow: ['1.1.1.1', 'api.example.com'],
  },
});

// Update egress at runtime
const updated = await sandbox.updateEgress({
  mode: SandboxEgressMode.DenyAll,
});
console.log(updated.network_updated); // true when Nomad network mode changed

// Legacy shorthand (maps to deny_all)
await client.sandboxes.create({ template: 'node-22', blockOutbound: true });
```

Modes: `open` (full internet), `restricted` (allowlist required), `deny_all` (no outbound).

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
  { template: 'node-22' },
  { idempotencyKey: 'create-sandbox-123' },
);
```

If `region` is omitted, the SDK resolves the first available sandbox region automatically.

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
