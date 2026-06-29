import { DestroyReason, DestroyTimeout, SandboxEgressMode, SandboxStatus, SnapshotMode } from '../enums';
import type { RequestOptions } from '../transport/http';
import type { RegionSummary } from './region';
import type { CreateVolumeInput, Volume } from './volume';

export type SandboxEgressConfig = {
  mode: SandboxEgressMode;
  allow?: string[];
};

export type UpdateSandboxEgressInput = {
  mode: SandboxEgressMode;
  allow?: string[];
};

export type SandboxSpecs = {
  cpu?: number;
  memory?: number;
  disk?: number;
};

export type SandboxRegionInput = string | 'auto';

export type CreateSandboxInput = {
  name?: string;
  template?: string;
  teamId?: string;
  environmentId?: string;
  region?: string;
  specs?: SandboxSpecs;
  autoDestroy?: boolean;
  destroyTimeout?: DestroyTimeout;
  oneShot?: boolean;
  blockOutbound?: boolean;
  egress?: SandboxEgressConfig;
  persistent?: boolean;
  persistentDiskGB?: number;
  volumeId?: string;
  mountPath?: string;
  fromSnapshot?: string;
  snapshotMode?: SnapshotMode;
  snapshotFrequency?: string;
};

export type CreateSandboxRequest = Omit<CreateSandboxInput, 'region'> & {
  region?: SandboxRegionInput;
};

export type CreateSandboxResult = {
  id: string;
  name: string;
  template: string;
  status: SandboxStatus;
  created_at: string;
  expires_at: string;
};

export type Sandbox = {
  id: string;
  name: string;
  template: string;
  status: SandboxStatus;
  region: RegionSummary | string;
  specs: SandboxSpecs;
  team: string | null;
  project_environment: string | null;
  auto_destroy: boolean;
  destroy_timeout: DestroyTimeout | null;
  one_shot: boolean;
  block_outbound: boolean;
  egress: SandboxEgressConfig;
  persistent: boolean;
  persistent_disk_gb: number | null;
  paused_at: string | null;
  from_snapshot: string | null;
  snapshot_mode: SnapshotMode;
  snapshot_frequency: string | null;
  created_at: string;
  last_activity_at: string;
  expires_at: string;
  destroyed_at: string | null;
  destroy_reason: DestroyReason | null;
  network_updated?: boolean;
};

export type AckMessage = {
  message: string;
};

export type WaitUntilReadyOptions = {
  timeoutMs?: number;
  pollIntervalMs?: number;
  signal?: AbortSignal;
};

export type WaitPreference = boolean | WaitUntilReadyOptions;

export type SandboxRuntimeOptions = RequestOptions & {
  waitUntilReady?: WaitPreference;
};

export type SandboxReadyRequestOptions = {
  request?: RequestOptions;
  wait?: WaitUntilReadyOptions;
};

export type CreateSandboxWithVolumeInput = {
  sandbox: Omit<CreateSandboxRequest, 'volumeId' | 'persistent' | 'persistentDiskGB'>;
  volume: Omit<CreateVolumeInput, 'region'> & {
    region?: string;
  };
};

export type CreateSandboxWithVolumeResult = {
  sandbox: CreateSandboxResult;
  volume: Volume;
};
