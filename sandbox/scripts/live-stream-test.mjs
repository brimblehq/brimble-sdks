import { CodeLanguage, Sandbox } from '../dist/src/index.js';

const apiKey = process.env.BRIMBLE_SANDBOX_KEY;
if (!apiKey) {
  console.error('Set BRIMBLE_SANDBOX_KEY to run this script.');
  process.exit(1);
}

async function readFileStream(stream) {
  const decoder = new TextDecoder();
  let text = '';

  for await (const chunk of stream) {
    text += decoder.decode(chunk, { stream: true });
  }

  return text + decoder.decode();
}

const client = new Sandbox({ apiKey, timeoutMs: 120_000 });

console.log('Creating sandbox...');
const sandbox = await client.sandboxes.createReady({ template: 'node-22' });
console.log(`Sandbox ready: ${sandbox.id}\n`);

let failed = false;

function pass(label) {
  console.log(`PASS  ${label}`);
}

function fail(label, error) {
  failed = true;
  console.error(`FAIL  ${label}`);
  console.error(error);
}

try {
  console.log('1) Buffered exec');
  const buffered = await sandbox.exec({ cmd: 'echo hello-buffered' });
  if (buffered.exit_code === 0 && buffered.stdout.includes('hello-buffered')) {
    pass('buffered exec');
  } else {
    fail('buffered exec', buffered);
  }

  console.log('\n2) Streaming exec with for await');
  const output = await sandbox.exec({
    cmd: 'for i in 1 2 3; do echo line-$i; sleep 0.15; done',
    stream: true,
  });

  const logs = [];
  for await (const log of output) {
    logs.push(log);
    process.stdout.write(`   [${log.stream}] ${JSON.stringify(log.data)}`);
  }
  process.stdout.write('\n');

  const streamed = await output.result();
  if (logs.length >= 1 && streamed.exit_code === 0 && streamed.stdout.includes('line-1')) {
    pass('streaming exec');
  } else {
    fail('streaming exec', { logs, streamed });
  }

  console.log('\n3) Callback streaming exec');
  const callbackChunks = [];
  const callbackResult = await sandbox.exec({
    cmd: 'printf callback-ok',
    onStdout: (chunk) => {
      callbackChunks.push(chunk);
      process.stdout.write(`   [callback] ${JSON.stringify(chunk)}`);
    },
  });
  process.stdout.write('\n');

  if (callbackChunks.length > 0 && callbackResult.stdout.includes('callback-ok')) {
    pass('callback exec');
  } else {
    fail('callback exec', { callbackChunks, callbackResult });
  }

  console.log('\n4) Streaming runCode');
  const codeOutput = await sandbox.runCode({
    language: CodeLanguage.Node,
    code: 'for (let i = 1; i <= 2; i++) console.log(`code-${i}`)',
    stream: true,
  });

  const codeLogs = [];
  for await (const log of codeOutput) {
    codeLogs.push(log);
  }

  const codeResult = await codeOutput.result();
  if (codeLogs.length >= 1 && codeResult.exit_code === 0 && codeResult.stdout.includes('code-1')) {
    pass('streaming runCode');
  } else {
    fail('streaming runCode', { codeLogs, codeResult });
  }

  console.log('\n5) File upload + streamed download');
  await sandbox.putFile('tmp/live-stream-test.txt', Buffer.from('local-package-stream-ok', 'utf-8'));
  const fileStream = await sandbox.getFile('tmp/live-stream-test.txt');
  const fileContents = await readFileStream(fileStream);

  if (fileContents.includes('local-package-stream-ok')) {
    pass('file stream download');
  } else {
    fail('file stream download', { fileContents });
  }
} catch (error) {
  failed = true;
  console.error('\nUnexpected error:', error);
} finally {
  console.log('\nDestroying sandbox...');
  try {
    await sandbox.destroy();
    console.log('Sandbox destroyed.');
  } catch (error) {
    console.error('Cleanup failed:', error);
  }
}

if (failed) {
  process.exit(1);
}

console.log('\nAll live streaming checks passed.');
