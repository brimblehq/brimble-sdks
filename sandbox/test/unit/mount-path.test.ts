import { describe, expect, test, vi } from 'vitest';

import { Sandbox } from '../../src/client';
import { SandboxStatus } from '../../src/enums';

describe('Sandbox mountPath support', () => {
  test('create forwards mountPath in request body', async () => {
    let requestBody: unknown = null;

    const fetchImpl = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      if (typeof init?.body === 'string') {
        requestBody = JSON.parse(init.body) as unknown;
      }

      return new Response(
        JSON.stringify({
          message: 'created',
          data: {
            id: 'sandbox-1',
            name: 'mount-test',
            template: 'node-22',
            status: SandboxStatus.Starting,
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 1_800_000).toISOString(),
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    }) as typeof fetch;

    const client = new Sandbox({
      apiKey: 'test-key',
      fetchImpl,
    });

    await client.sandboxes.create({
      template: 'node-22',
      region: 'region-1',
      persistent: true,
      persistentDiskGB: 20,
      mountPath: '/var/www/html',
    });

    expect(requestBody).toMatchObject({
      mountPath: '/var/www/html',
    });
  });

  test('mountPath requires persistent or volumeId', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('fetch should not be called');
    }) as typeof fetch;

    const client = new Sandbox({
      apiKey: 'test-key',
      fetchImpl,
    });

    await expect(
      client.sandboxes.create({
        template: 'node-22',
        region: 'region-1',
        mountPath: '/workspace',
      }),
    ).rejects.toThrow('mountPath requires either `persistent: true` or `volumeId`.');
  });

  test('create defaults mountPath to /workspace when persistent storage is used', async () => {
    let requestBody: unknown = null;

    const fetchImpl = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      if (typeof init?.body === 'string') {
        requestBody = JSON.parse(init.body) as unknown;
      }

      return new Response(
        JSON.stringify({
          message: 'created',
          data: {
            id: 'sandbox-1',
            name: 'mount-default',
            template: 'node-22',
            status: SandboxStatus.Starting,
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 1_800_000).toISOString(),
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    }) as typeof fetch;

    const client = new Sandbox({
      apiKey: 'test-key',
      fetchImpl,
    });

    await client.sandboxes.create({
      template: 'node-22',
      region: 'region-1',
      persistent: true,
      persistentDiskGB: 20,
    });

    expect(requestBody).toMatchObject({
      mountPath: '/workspace',
    });
  });

  test('mountPath rejects invalid path characters', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('fetch should not be called');
    }) as typeof fetch;

    const client = new Sandbox({
      apiKey: 'test-key',
      fetchImpl,
    });

    await expect(
      client.sandboxes.create({
        template: 'node-22',
        region: 'region-1',
        persistent: true,
        persistentDiskGB: 20,
        mountPath: '/workspace?bad',
      }),
    ).rejects.toThrow('mountPath must match ^/[A-Za-z0-9._/-]*$ and cannot be "/".');
  });

  test('create infers region from attached volume when region is omitted', async () => {
    let requestBody: unknown = null;

    const fetchImpl = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
      const href = String(url);
      if (href.includes('/volumes/volume-123') && init?.method === 'GET') {
        return new Response(
          JSON.stringify({
            message: 'Volume fetched',
            data: {
              id: 'volume-123',
              name: 'cache',
              type: 'sandbox',
              team: null,
              csi_volume_id: null,
              size: 20,
              region: {
                id: 'region-from-volume',
                name: 'Test',
                country: 'US',
                continent: 'NA',
                provider: 'test',
                is_paid: false,
              },
              attached_sandbox_id: null,
              attached_project_id: null,
              last_attached_at: null,
              created_at: null,
              updated_at: null,
            },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        );
      }

      if (href.includes('/sandboxes') && init?.method === 'POST') {
        if (typeof init.body === 'string') {
          requestBody = JSON.parse(init.body) as unknown;
        }

        return new Response(
          JSON.stringify({
            message: 'created',
            data: {
              id: 'sandbox-1',
              name: 'attach-test',
              template: 'node-22',
              status: SandboxStatus.Starting,
              created_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 1_800_000).toISOString(),
            },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        );
      }

      throw new Error(`Unexpected request: ${init?.method} ${href}`);
    }) as typeof fetch;

    const client = new Sandbox({
      apiKey: 'test-key',
      fetchImpl,
    });

    await client.sandboxes.create({
      template: 'node-22',
      volumeId: 'volume-123',
    });

    expect(requestBody).toMatchObject({
      volumeId: 'volume-123',
      mountPath: '/workspace',
    });
    expect(requestBody).not.toHaveProperty('region');
  });
});
