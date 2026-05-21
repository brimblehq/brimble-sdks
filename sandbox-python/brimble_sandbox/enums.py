"""Enum values used by the Sandbox SDK."""

from enum import StrEnum


class CodeLanguage(StrEnum):
    PYTHON = "python"
    NODE = "node"


class DestroyReason(StrEnum):
    USER = "user"
    IDLE_TTL = "idle_ttl"
    MAX_LIFETIME = "max_lifetime"
    ONE_SHOT_STOPPED = "one_shot_stopped"
    FAILED = "failed"
    PAUSED_TOO_LONG = "paused_too_long"


class DestroyTimeout(StrEnum):
    THIRTY_MINUTES = "30m"
    ONE_HOUR = "1h"
    THREE_HOURS = "3h"
    SIX_HOURS = "6h"
    TWELVE_HOURS = "12h"
    EIGHTEEN_HOURS = "18h"


class SandboxStatus(StrEnum):
    STARTING = "starting"
    READY = "ready"
    PAUSING = "pausing"
    PAUSED = "paused"
    RESUMING = "resuming"
    FAILED = "failed"
    DESTROYED = "destroyed"


class SnapshotMode(StrEnum):
    MANUAL = "manual"
    AUTOMATIC = "automatic"


class SnapshotStatus(StrEnum):
    CREATING = "creating"
    READY = "ready"
    FAILED = "failed"


class VolumeType(StrEnum):
    SANDBOX = "sandbox"
