import { SnapshotStatus } from '../enums';

export type CreateSnapshotInput = {
  name: string;
};

export type Snapshot = {
  id: string;
  sandbox_id: string;
  name: string;
  image_tag: string;
  source_template: string;
  status: SnapshotStatus;
  failure_reason: string | null;
  size_bytes: number | null;
  created_at: string;
};
