import { describe, expect, test, vi } from 'vitest';

import { Sandbox } from '../../src/client';

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

