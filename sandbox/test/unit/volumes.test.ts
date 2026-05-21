import { describe, expect, test, vi } from 'vitest';

import { MIN_VOLUME_SIZE_GB } from '../../src/constants';
import { VolumeType } from '../../src/enums';
import { VolumesResource } from '../../src/resources/volumes';
import { HttpTransport } from '../../src/transport/http';
import type { Volume } from '../../src/types';

const volumeFixture: Volume = {
  id: 'vol-1',
  name: 'workspace',
  type: VolumeType.Sandbox,
  team: null,
  csi_volume_id: null,
  size: 20,
  region: {
    id: 'region-1',
    name: 'US East',
    country: 'United States',
    continent: 'North America',
    provider: 'aws',
    is_paid: false,
  },
  mount_path: null,
  attached_sandbox_id: null,
  attached_project_id: null,
  last_attached_at: null,
  created_at: null,
  updated_at: null,
};

describe('VolumesResource', () => {
  test('rejects non-sandbox volume types', () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('fetch should not be called for validation failures');
    }) as typeof fetch;

    const transport = new HttpTransport({
      baseUrl: 'https://sandbox.brimble.io',
      apiKey: 'test-key',
      fetchImpl,
    });

    const volumes = new VolumesResource(transport);

    expect(() =>
      volumes.create({
        name: 'invalid-volume',
        sizeGB: 20,
        region: 'region-1',
        type: 'database' as unknown as VolumeType,
      }),
    ).toThrow('Only volume type "sandbox" is supported by this package.');
  });

  test('rejects volume sizes below minimum', () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('fetch should not be called for validation failures');
    }) as typeof fetch;

    const transport = new HttpTransport({
      baseUrl: 'https://sandbox.brimble.io',
      apiKey: 'test-key',
      fetchImpl,
    });

    const volumes = new VolumesResource(transport);

    expect(() =>
      volumes.create({
        name: 'too-small',
        sizeGB: MIN_VOLUME_SIZE_GB - 1,
        region: 'region-1',
      }),
    ).toThrow(`Volume size must be at least ${MIN_VOLUME_SIZE_GB}GB.`);
  });

  test('defaults volume type to sandbox when omitted', async () => {
    let requestBody: unknown = null;

    const fetchImpl = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      if (typeof init?.body === 'string') {
        requestBody = JSON.parse(init.body) as unknown;
      }

      return new Response(
        JSON.stringify({
          message: 'created',
          data: volumeFixture,
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      );
    }) as typeof fetch;

    const transport = new HttpTransport({
      baseUrl: 'https://sandbox.brimble.io',
      apiKey: 'test-key',
      fetchImpl,
    });

    const volumes = new VolumesResource(transport);

    const created = await volumes.create({
      name: 'workspace',
      sizeGB: 20,
      region: 'region-1',
    });

    expect(created.type).toBe(VolumeType.Sandbox);
    expect(requestBody).toMatchObject({
      name: 'workspace',
      sizeGB: 20,
      region: 'region-1',
      type: VolumeType.Sandbox,
    });
  });
});
