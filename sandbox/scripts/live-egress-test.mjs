import { Sandbox, SandboxEgressMode } from '../dist/src/index.js';

const apiKey = process.env.BRIMBLE_SANDBOX_KEY;
if (!apiKey) {
  console.error('Set BRIMBLE_SANDBOX_KEY to run this script.');
  process.exit(1);
}

const networkSwitchWaitMs = 25_000;
const probeCmd =
  "curl -s -o /dev/null -w '%{http_code}' --connect-timeout 5 http://1.1.1.1 || echo 000";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probeHttp(sandbox) {
  const result = await sandbox.exec({ cmd: probeCmd });
  return result.stdout.trim().replace(/\D/g, '').slice(0, 3) || '000';
}

function assertStep(label, actual, expected) {
  const ok = actual === expected;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: got ${actual}, expected ${expected}`);
  if (!ok) {
    throw new Error(`${label} failed`);
  }
}

const client = new Sandbox({ apiKey, timeoutMs: 120_000 });

console.log('Creating sandbox with deny_all egress...');
const sandbox = await client.sandboxes.create({
  template: 'node-22',
  egress: { mode: SandboxEgressMode.DenyAll },
});

console.log(`Sandbox id: ${sandbox.id}`);

try {
  await sandbox.waitUntilReady({ timeoutMs: 180_000, pollIntervalMs: 2_000 });
  console.log('Sandbox ready.\n');

  const deniedAtBirth = await probeHttp(sandbox);
  assertStep('deny_all blocks outbound', deniedAtBirth, '000');

  console.log('\nUpdating egress to restricted (allow 1.1.1.1)...');
  const restricted = await sandbox.updateEgress({
    mode: SandboxEgressMode.Restricted,
    allow: ['1.1.1.1'],
  });
  console.log(`  egress.mode=${restricted.egress.mode}, network_updated=${restricted.network_updated ?? false}`);

  await sleep(networkSwitchWaitMs);

  const allowedProbe = await probeHttp(sandbox);
  assertStep('restricted allows 1.1.1.1', allowedProbe, '301');

  console.log('\nUpdating egress to open...');
  const open = await sandbox.updateEgress({ mode: SandboxEgressMode.Open });
  console.log(`  egress.mode=${open.egress.mode}, network_updated=${open.network_updated ?? false}`);

  if (open.network_updated) {
    await sleep(networkSwitchWaitMs);
  }

  const openProbe = await probeHttp(sandbox);
  assertStep('open allows outbound', openProbe, '301');

  console.log('\nAll egress SDK checks passed.');
} finally {
  console.log('\nDestroying sandbox...');
  try {
    await sandbox.destroy();
    console.log('Sandbox destroyed.');
  } catch (error) {
    console.warn('Cleanup failed:', error instanceof Error ? error.message : error);
  }
}
