import { VolumeType } from '../enums';
import type { RegionSummary } from './region';

export type CreateVolumeInput = {
  name: string;
  sizeGB: number;
  region: string;
  type?: VolumeType;
  teamId?: string;
};

export type Volume = {
  id: string;
  name: string;
  type: VolumeType;
  team: string | null;
  csi_volume_id: string | null;
  size: number;
  region: RegionSummary | null;
  mount_path: string | null;
  attached_sandbox_id: string | null;
  attached_project_id: string | null;
  last_attached_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};
