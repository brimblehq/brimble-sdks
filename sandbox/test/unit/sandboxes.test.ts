import { describe, expect, test, vi } from 'vitest';

import { Sandbox } from '../../src/client';
import { SandboxEgressMode } from '../../src/enums';

describe('SandboxesResource templates helpers', () => {
  test('listTemplates handles wrapped data.templates payload', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          message: 'Templates fetched',
          data: {
            templates: [
              {
                name: 'node-22',
                display_name: 'Node.js 22',
                description: 'Node runtime',
              },
            ],
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    ) as typeof fetch;

    const client = new Sandbox({
      apiKey: 'test-key',
      fetchImpl,
    });

    const templates = await client.sandboxes.listTemplates();
    expect(templates.length).toBe(1);
    expect(templates[0]?.name).toBe('node-22');
  });

  test('getTemplate finds template by name', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          message: 'Templates fetched',
          data: {
            templates: [
              {
                name: 'python-3.12',
                display_name: 'Python 3.12',
                description: 'Python runtime',
              },
            ],
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    ) as typeof fetch;

    const client = new Sandbox({
      apiKey: 'test-key',
      fetchImpl,
    });

    const template = await client.sandboxes.getTemplate('python-3.12');
    expect(template?.name).toBe('python-3.12');
  });
});

describe('ScopedSandboxResource lifecycle helpers', () => {
  test('destroy deletes sandbox by id', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 })) as typeof fetch;

    const client = new Sandbox({
      apiKey: 'test-key',
      fetchImpl,
    });

    const scope = client.sandboxes.use('sandbox-123');
    await scope.destroy();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, requestInit] = fetchImpl.mock.calls[0] ?? [];
    expect(requestInit?.method).toBe('DELETE');

    const [url] = fetchImpl.mock.calls[0] ?? [];
    expect(String(url)).toContain('/sandboxes/sandbox-123');
  });
});

describe('SandboxesResource egress', () => {
  test('updateEgress sends PUT with mode and allow list', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          message: 'Sandbox egress updated',
          data: {
            id: 'sandbox-123',
            egress: { mode: 'restricted', allow: ['1.1.1.1'] },
            network_updated: true,
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    ) as typeof fetch;

    const client = new Sandbox({
      apiKey: 'test-key',
      fetchImpl,
    });

    const result = await client.sandboxes.updateEgress('sandbox-123', {
      mode: SandboxEgressMode.Restricted,
      allow: ['1.1.1.1'],
    });

    expect(result.egress.mode).toBe('restricted');
    expect(result.network_updated).toBe(true);

    const [, requestInit] = fetchImpl.mock.calls[0] ?? [];
    expect(requestInit?.method).toBe('PUT');
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      mode: 'restricted',
      allow: ['1.1.1.1'],
    });

    const [url] = fetchImpl.mock.calls[0] ?? [];
    expect(String(url)).toContain('/sandboxes/sandbox-123/egress');
  });
});
