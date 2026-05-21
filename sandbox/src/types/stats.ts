export type StatsAverageNumeric = {
  totalInPercentage: number;
  size: number;
};

export type StatsAverageNetwork = {
  value?: number | null;
  total?: number | null;
  totalInPercentage?: number | null;
  bytesPerSecond?: number | null;
};

export type StatsTimelinePoint = {
  date: string;
  memory: number;
  cpu: number;
  network: {
    bytesPerSecond: number | null;
  };
};

export type Stats = {
  average: {
    memory: StatsAverageNumeric;
    cpu: StatsAverageNumeric;
    network: StatsAverageNetwork;
  };
  replicaCount: number;
  results: StatsTimelinePoint[];
  responseTime: unknown;
};

export type StatsQuery = {
  hoursAgo?: number;
};
