export type RegionSummary = {
  id: string;
  name: string;
  country: string;
  continent: string | null;
  provider: string;
  is_paid: boolean;
};

export type SandboxRegion = {
  id: string;
  name: string;
  country: string;
  continent: string | null;
};

export type SandboxRegionsResult = {
  regions: SandboxRegion[];
};
