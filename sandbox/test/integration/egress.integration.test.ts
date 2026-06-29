import { describe, expect, test } from 'vitest';

import { Sandbox } from '../../src/client';
import { SandboxEgressMode } from '../../src/enums';

const apiKey = process.env.BRIMBLE_SANDBOX_KEY;
const describeLive = apiKey ? describe : describe.skip;

const networkSwitchWaitMs = 25_000;
const probeCmd =
  "curl -s -o /dev/null -w '%{http_code}' --connect-timeout 5 http://1.1.1.1 || echo 000";

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function probeHttp(sandbox: { exec: (input: { cmd: string }) => Promise<{ stdout: string }> }): Promise<string> {
  const result = await sandbox.exec({ cmd: probeCmd });
  return result.stdout.trim().replace(/\D/g, '').slice(0, 3) || '000';
}

describeLive('Sandbox SDK egress integration', () => {
  test(
    'create, updateEgress, and verify network policy end-to-end',
    { timeout: 600_000 },
    async () => {
      const client = new Sandbox({ apiKey, timeoutMs: 60_000 });

      const sandbox = await client.sandboxes.create({
        template: 'node-22',
        egress: { mode: SandboxEgressMode.DenyAll },
      });

      try {
        await sandbox.waitUntilReady({ timeoutMs: 180_000, pollIntervalMs: 2_000 });

        const deniedAtBirth = await probeHttp(sandbox);
        expect(deniedAtBirth).toBe('000');

        const restricted = await sandbox.updateEgress({
          mode: SandboxEgressMode.Restricted,
          allow: ['1.1.1.1'],
        });
        expect(restricted.egress.mode).toBe(SandboxEgressMode.Restricted);
        expect(restricted.egress.allow).toContain('1.1.1.1');

        await sleep(networkSwitchWaitMs);

        const allowedProbe = await probeHttp(sandbox);
        expect(allowedProbe).toBe('301');

        const open = await sandbox.updateEgress({ mode: SandboxEgressMode.Open });
        expect(open.egress.mode).toBe(SandboxEgressMode.Open);

        if (open.network_updated) {
          await sleep(networkSwitchWaitMs);
        }

        const openProbe = await probeHttp(sandbox);
        expect(openProbe).toBe('301');
      } finally {
        try {
          await sandbox.destroy();
        } catch {
          // Ignore cleanup race failures.
        }
      }
    },
  );
});
