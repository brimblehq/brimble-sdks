import { describe, expect, test } from 'vitest';

import { Sandbox } from '../../src/client';
import { MIN_VOLUME_SIZE_GB } from '../../src/constants';
import { NotFoundError } from '../../src/errors';
import { CodeLanguage, VolumeType } from '../../src/enums';
import type { CreateSandboxRequest, SandboxHandle, SandboxTemplate } from '../../src/types';

const apiKey = process.env.BRIMBLE_SANDBOX_KEY;
const describeLive = apiKey ? describe : describe.skip;

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function readByteStreamToText(stream: AsyncIterable<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder('utf-8');
  let text = '';

  for await (const chunk of stream) {
    text += decoder.decode(chunk, { stream: true });
  }

  return text + decoder.decode();
}

function chooseTemplate(templates: SandboxTemplate[]): string | undefined {
  const preferred = templates.find((template) => template.name === 'node-22');
  if (preferred) {
    return preferred.name;
  }

  return templates[0]?.name;
}

function isNotFoundError(error: unknown): boolean {
  if (error instanceof NotFoundError) {
    return true;
  }

  return error instanceof Error && error.name === 'NotFoundError';
}

async function createReadySandboxWithRetries(
  client: Sandbox,
  input: CreateSandboxRequest,
  attempts = 3,
): Promise<SandboxHandle> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const sandbox = await client.sandboxes.create(input);

    try {
      await sandbox.waitUntilReady({ timeoutMs: 180_000, pollIntervalMs: 2_000 });
      return sandbox;
    } catch (error) {
      lastError = error;

      try {
        await sandbox.destroy();
      } catch {
        // Ignore cleanup failure for transient provisioner attempts.
      }

      if (!isNotFoundError(error) || attempt === attempts) {
        throw error;
      }

      await sleep(2_000);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to create a ready sandbox after retries.');
}

describeLive('Sandbox SDK live integration', () => {
  test('covers stable discovery endpoints', { timeout: 120_000 }, async () => {
    const client = new Sandbox({ apiKey, timeoutMs: 60_000 });

    const templates = await client.sandboxes.listTemplates();
    expect(Array.isArray(templates)).toBe(true);
    expect(templates.length).toBeGreaterThan(0);

    const selectedTemplate = chooseTemplate(templates);
    expect(selectedTemplate).toBeTruthy();

    const template = await client.sandboxes.getTemplate(selectedTemplate as string);
    expect(template?.name).toBe(selectedTemplate);

    const regionsResult = await client.sandboxes.listRegions();
    expect(regionsResult.regions.length).toBeGreaterThan(0);
    expect(regionsResult.regions[0]?.id).toBeTruthy();

    const sandboxPage = await client.sandboxes.list({ page: 1, limit: 15 });
    expect(Array.isArray(sandboxPage.data)).toBe(true);
    expect(sandboxPage.currentPage).toBe(1);
  });

  test('covers volume lifecycle without attaching to sandbox', { timeout: 120_000 }, async () => {
    const client = new Sandbox({ apiKey, timeoutMs: 60_000 });

    const regionsResult = await client.sandboxes.listRegions();
    const regionId = regionsResult.regions[0]?.id;
    expect(regionId).toBeTruthy();

    const volume = await client.volumes.create({
      name: `sdk-int-${Date.now()}`,
      sizeGB: MIN_VOLUME_SIZE_GB,
      region: regionId as string,
      type: VolumeType.Sandbox,
    });

    try {
      expect(volume.type).toBe(VolumeType.Sandbox);

      const fetchedVolume = await client.volumes.get(volume.id);
      expect(fetchedVolume.id).toBe(volume.id);

      let volumeSeen = false;
      for await (const iteratedVolume of client.volumes.iterate({ limit: 15 })) {
        if (iteratedVolume.id === volume.id) {
          volumeSeen = true;
          break;
        }
      }
      expect(volumeSeen).toBe(true);
    } finally {
      await client.volumes.delete(volume.id);
    }
  });

  test('covers sandbox runtime/snapshots lifecycle end-to-end', { timeout: 420_000 }, async () => {
    const client = new Sandbox({ apiKey, timeoutMs: 60_000 });

    const templates = await client.sandboxes.listTemplates();
    const selectedTemplate = chooseTemplate(templates);

    let sandbox: SandboxHandle | null = null;

    try {
      sandbox = await createReadySandboxWithRetries(
        client,
        {
          ...(selectedTemplate ? { template: selectedTemplate } : {}),
          persistent: true,
          persistentDiskGB: MIN_VOLUME_SIZE_GB,
        },
        6,
      );

      const fetchedSandbox = await client.sandboxes.get(sandbox.id);
      expect(fetchedSandbox.id).toBe(sandbox.id);

      const readySandbox = await client.sandboxes.getReady(sandbox.id, {
        wait: { timeoutMs: 180_000, pollIntervalMs: 2_000 },
      });
      expect(readySandbox.id).toBe(sandbox.id);

      let sandboxSeen = false;
      for await (const iteratedSandbox of client.sandboxes.iterate({ limit: 15 })) {
        if (iteratedSandbox.id === sandbox.id) {
          sandboxSeen = true;
          break;
        }
      }
      expect(sandboxSeen).toBe(true);

      const execResult = await sandbox.exec({
        cmd: 'echo "$SDK_ENV_TEST"',
        env: { SDK_ENV_TEST: 'brimble-sdk-test' },
      });
      expect(execResult.exit_code).toBe(0);
      expect(execResult.stdout).toContain('brimble-sdk-test');

      const scopedExec = await client.sandboxes.use(sandbox.id).exec({ cmd: 'printf scoped-runtime' });
      expect(scopedExec.exit_code).toBe(0);
      expect(scopedExec.stdout).toContain('scoped-runtime');

      const codeResult = await sandbox.runCode({
        language: CodeLanguage.Node,
        code: 'console.log(process.env.SDK_CODE_ENV)',
        env: { SDK_CODE_ENV: 'run-code-ok' },
      });
      expect(codeResult.exit_code).toBe(0);
      expect(codeResult.stdout).toContain('run-code-ok');

      const output = await sandbox.exec({
        cmd: 'for i in 1 2 3; do echo $i; done',
        stream: true,
      });

      const stdoutChunks: string[] = [];
      for await (const frame of output.frames()) {
        if (frame.type === 'stdout') {
          stdoutChunks.push(frame.data);
        }

        if (frame.type === 'done') {
          expect(frame.exit_code).toBe(0);
        }
      }

      expect(stdoutChunks.join('')).toContain('1');

      await sandbox.putFile('tmp/sdk-integration.txt', Buffer.from('file-roundtrip-ok', 'utf-8'));
      const fileStream = await sandbox.getFile('tmp/sdk-integration.txt');
      const fileContents = await readByteStreamToText(fileStream);
      expect(fileContents).toContain('file-roundtrip-ok');

      const batchUpload = await sandbox.putFiles([
        { path: '/tmp/batch-a.txt', body: 'batch-a' },
        { path: '/tmp/batch-b.txt', body: Buffer.from('batch-b', 'utf-8') },
      ]);
      expect(batchUpload.results.length).toBe(2);
      expect(batchUpload.failed).toBe(0);

      const batchFileStream = await sandbox.getFile('tmp/batch-a.txt');
      const batchFileContents = await readByteStreamToText(batchFileStream);
      expect(batchFileContents).toContain('batch-a');

      const stats = await sandbox.stats({ hoursAgo: 1 });
      expect(stats.replicaCount).toBeGreaterThanOrEqual(0);

      const snapshot = await sandbox.createSnapshot({ name: `sdk-snap-${Date.now()}` });
      expect(snapshot.id).toBeTruthy();

      const sandboxSnapshots = await sandbox.listSnapshots({ limit: 15, page: 1 });
      expect(sandboxSnapshots.data.some((item) => item.id === snapshot.id)).toBe(true);

      const nestedSnapshots = await sandbox.snapshots.list({ limit: 15, page: 1 });
      expect(nestedSnapshots.data.some((item) => item.id === snapshot.id)).toBe(true);

      const allSnapshots = await client.snapshots.listAll({ limit: 15, page: 1 });
      expect(allSnapshots.data.some((item) => item.id === snapshot.id)).toBe(true);

      try {
        await client.snapshots.delete(snapshot.id);
      } catch {
        // Snapshot deletion can fail when backend image cleanup is still in-flight.
      }

      await sandbox.pause();
      await sandbox.resume();
      await sandbox.waitUntilReady({ timeoutMs: 180_000, pollIntervalMs: 2_000 });
    } finally {
      if (sandbox) {
        try {
          await client.sandboxes.destroy(sandbox.id);
        } catch {
          // Ignore cleanup race failures in integration context.
        }
      }
    }
  });
});
