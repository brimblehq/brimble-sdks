export enum DestroyReason {
  User = 'user',
  IdleTtl = 'idle_ttl',
  MaxLifetime = 'max_lifetime',
  OneShotStopped = 'one_shot_stopped',
  Failed = 'failed',
  PausedTooLong = 'paused_too_long',
}
