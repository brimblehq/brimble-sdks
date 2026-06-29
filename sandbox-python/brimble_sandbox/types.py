"""Typed payload shapes for the Sandbox SDK."""

from __future__ import annotations

from typing import IO, Iterable, Literal, TypedDict, Union

from .enums import CodeLanguage, DestroyReason, DestroyTimeout, SandboxStatus, SnapshotMode, SnapshotStatus, VolumeType

FileUploadBody = Union[bytes, bytearray, IO[bytes], Iterable[bytes]]
BatchFileUploadBody = Union[bytes, bytearray, str]
SandboxRegionInput = Union[str, Literal["auto"]]


class Pagination(TypedDict, total=False):
    page: int
    limit: int


class TeamScopedPagination(Pagination, total=False):
    teamId: str


class Paginated(TypedDict):
    data: list[object]
    totalCount: int
    currentPage: int
    totalPages: int
    limit: int


class RegionSummary(TypedDict):
    id: str
    name: str
    country: str
    continent: str | None
    provider: str
    is_paid: bool


class SandboxRegion(TypedDict):
    id: str
    name: str
    country: str
    continent: str | None


class SandboxRegionsResult(TypedDict):
    regions: list[SandboxRegion]


class SandboxTemplate(TypedDict):
    name: str
    display_name: str
    description: str


class SandboxSpecs(TypedDict, total=False):
    cpu: int
    memory: int
    disk: int


class CreateSandboxInput(TypedDict, total=False):
    name: str
    template: str
    teamId: str
    environmentId: str
    region: str
    specs: SandboxSpecs
    autoDestroy: bool
    destroyTimeout: DestroyTimeout
    oneShot: bool
    blockOutbound: bool
    persistent: bool
    persistentDiskGB: int
    volumeId: str
    mountPath: str
    fromSnapshot: str
    snapshotMode: SnapshotMode
    snapshotFrequency: str


class CreateSandboxRequest(TypedDict, total=False):
    name: str
    template: str
    teamId: str
    environmentId: str
    region: SandboxRegionInput
    specs: SandboxSpecs
    autoDestroy: bool
    destroyTimeout: DestroyTimeout
    oneShot: bool
    blockOutbound: bool
    persistent: bool
    persistentDiskGB: int
    volumeId: str
    mountPath: str
    fromSnapshot: str
    snapshotMode: SnapshotMode
    snapshotFrequency: str


class CreateSandboxResult(TypedDict):
    id: str
    name: str
    template: str
    status: SandboxStatus
    created_at: str
    expires_at: str


class Sandbox(TypedDict):
    id: str
    name: str
    template: str
    status: SandboxStatus
    region: RegionSummary | str
    specs: SandboxSpecs
    team: str | None
    project_environment: str | None
    auto_destroy: bool
    destroy_timeout: DestroyTimeout | None
    one_shot: bool
    block_outbound: bool
    persistent: bool
    persistent_disk_gb: int | None
    paused_at: str | None
    from_snapshot: str | None
    snapshot_mode: SnapshotMode
    snapshot_frequency: str | None
    created_at: str
    last_activity_at: str
    expires_at: str
    destroyed_at: str | None
    destroy_reason: DestroyReason | None


class AckMessage(TypedDict):
    message: str


class WaitUntilReadyOptions(TypedDict, total=False):
    timeout_ms: int
    poll_interval_ms: int


WaitPreference = Union[bool, WaitUntilReadyOptions]


class ReadyRequestOptions(TypedDict, total=False):
    timeout_ms: int
    wait_timeout_ms: int
    wait_poll_interval_ms: int


class CreateSandboxWithVolumeSandboxInput(TypedDict, total=False):
    name: str
    template: str
    teamId: str
    environmentId: str
    region: SandboxRegionInput
    specs: SandboxSpecs
    autoDestroy: bool
    destroyTimeout: DestroyTimeout
    oneShot: bool
    blockOutbound: bool
    mountPath: str
    fromSnapshot: str
    snapshotMode: SnapshotMode
    snapshotFrequency: str


class CreateSandboxWithVolumeVolumeInput(TypedDict, total=False):
    name: str
    sizeGB: int
    region: str
    teamId: str


class CreateSandboxWithVolumeInput(TypedDict):
    sandbox: CreateSandboxWithVolumeSandboxInput
    volume: CreateSandboxWithVolumeVolumeInput


class ExecStdoutFrame(TypedDict):
    type: Literal["stdout"]
    data: str


class ExecStderrFrame(TypedDict):
    type: Literal["stderr"]
    data: str


class ExecDoneFrame(TypedDict):
    type: Literal["done"]
    exit_code: int
    duration_ms: int


class ExecErrorFrame(TypedDict):
    type: Literal["error"]
    message: str


ExecStreamFrame = Union[ExecStdoutFrame, ExecStderrFrame, ExecDoneFrame, ExecErrorFrame]


class ExecLog(TypedDict):
    stream: Literal["stdout", "stderr"]
    data: str


class ExecInput(TypedDict, total=False):
    cmd: str
    timeout_seconds: int
    cwd: str
    stream: bool
    env: dict[str, str]


class CodeInput(TypedDict, total=False):
    language: CodeLanguage
    code: str
    timeout_seconds: int
    cwd: str
    stream: bool
    env: dict[str, str]


class ExecResult(TypedDict):
    stdout: str
    stderr: str
    exit_code: int
    duration_ms: int


class CreateSnapshotInput(TypedDict):
    name: str


class Snapshot(TypedDict):
    id: str
    sandbox_id: str
    name: str
    image_tag: str
    source_template: str
    status: SnapshotStatus
    failure_reason: str | None
    size_bytes: int | None
    created_at: str


class StatsAverageNumeric(TypedDict):
    totalInPercentage: float
    size: float


class StatsAverageNetwork(TypedDict, total=False):
    value: float | None
    total: float | None
    totalInPercentage: float | None
    bytesPerSecond: float | None


class StatsTimelineNetwork(TypedDict):
    bytesPerSecond: float | None


class StatsTimelinePoint(TypedDict):
    date: str
    memory: float
    cpu: float
    network: StatsTimelineNetwork


class StatsAverage(TypedDict):
    memory: StatsAverageNumeric
    cpu: StatsAverageNumeric
    network: StatsAverageNetwork


class Stats(TypedDict):
    average: StatsAverage
    replicaCount: int
    results: list[StatsTimelinePoint]
    responseTime: object


class StatsQuery(TypedDict, total=False):
    hoursAgo: int


class BatchFileUploadFileInput(TypedDict):
    path: str
    body: BatchFileUploadBody


class SandboxBatchFileUploadResult(TypedDict, total=False):
    path: str
    bytes: int
    success: bool
    error: str


class SandboxBatchFileUpload(TypedDict):
    uploaded: int
    failed: int
    results: list[SandboxBatchFileUploadResult]


class CreateVolumeInput(TypedDict, total=False):
    name: str
    sizeGB: int
    region: str
    type: VolumeType
    teamId: str


class Volume(TypedDict):
    id: str
    name: str
    type: VolumeType
    team: str | None
    csi_volume_id: str | None
    size: int
    region: RegionSummary | None
    mount_path: str | None
    attached_sandbox_id: str | None
    attached_project_id: str | None
    last_attached_at: str | None
    created_at: str | None
    updated_at: str | None
