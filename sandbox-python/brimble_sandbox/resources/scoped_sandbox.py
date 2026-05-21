"""Sandbox-scoped resource wrapper."""

from __future__ import annotations

import requests

from ..transport import HttpTransport, RetryOptions
from ..types import (
    BatchFileUploadFileInput,
    CodeInput,
    CreateSnapshotInput,
    ExecInput,
    ExecResult,
    FileUploadBody,
    Paginated,
    Pagination,
    SandboxBatchFileUpload,
    Snapshot,
    StatsQuery,
)
from .exec import ExecResource
from .files import FilesResource
from .snapshots import SnapshotScopeResource
from .stats import StatsResource


class ScopedSandboxResource:
    """Convenience wrapper for operations against one sandbox."""

    def __init__(self, transport: HttpTransport, sandbox_id: str) -> None:
        self.exec_resource = ExecResource(transport, sandbox_id)
        self.files = FilesResource(transport, sandbox_id)
        self.snapshots = SnapshotScopeResource(transport, sandbox_id)
        self.stats_resource = StatsResource(transport, sandbox_id)

    def exec(
        self,
        input: ExecInput,
        *,
        timeout_ms: int | None = None,
        idempotency_key: str | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> ExecResult | requests.Response:
        """Run a shell command in this sandbox."""
        return self.exec_resource.exec(input, timeout_ms=timeout_ms, idempotency_key=idempotency_key, retry=retry)

    def run_code(
        self,
        input: CodeInput,
        *,
        timeout_ms: int | None = None,
        idempotency_key: str | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> ExecResult | requests.Response:
        """Run a code snippet in this sandbox."""
        return self.exec_resource.run_code(input, timeout_ms=timeout_ms, idempotency_key=idempotency_key, retry=retry)

    def exec_stream(
        self,
        input: ExecInput,
        *,
        timeout_ms: int | None = None,
        idempotency_key: str | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> requests.Response:
        """Run a shell command and stream SSE output frames."""
        return self.exec_resource.exec_stream(input, timeout_ms=timeout_ms, idempotency_key=idempotency_key, retry=retry)

    def run_code_stream(
        self,
        input: CodeInput,
        *,
        timeout_ms: int | None = None,
        idempotency_key: str | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> requests.Response:
        """Run a code snippet and stream SSE output frames."""
        return self.exec_resource.run_code_stream(input, timeout_ms=timeout_ms, idempotency_key=idempotency_key, retry=retry)

    def put_file(
        self,
        path: str,
        body: FileUploadBody,
        *,
        timeout_ms: int | None = None,
        idempotency_key: str | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> None:
        """Upload bytes to a file path inside this sandbox."""
        self.files.put(path, body, timeout_ms=timeout_ms, idempotency_key=idempotency_key, retry=retry)

    def get_file(
        self,
        path: str,
        *,
        timeout_ms: int | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> requests.Response:
        """Download file bytes from this sandbox as a stream response."""
        return self.files.get(path, timeout_ms=timeout_ms, retry=retry)

    def put_files(
        self,
        files: list[BatchFileUploadFileInput],
        *,
        timeout_ms: int | None = None,
        idempotency_key: str | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> SandboxBatchFileUpload:
        """Upload multiple files in one request."""
        return self.files.put_batch(
            files,
            timeout_ms=timeout_ms,
            idempotency_key=idempotency_key,
            retry=retry,
        )

    def stats(
        self,
        query: StatsQuery | None = None,
        *,
        timeout_ms: int | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> dict[str, object]:
        """Fetch CPU, memory, and network stats for this sandbox."""
        return self.stats_resource.stats(query, timeout_ms=timeout_ms, retry=retry)

    def create_snapshot(
        self,
        input: CreateSnapshotInput,
        *,
        timeout_ms: int | None = None,
        idempotency_key: str | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> Snapshot:
        """Create a snapshot for this sandbox."""
        return self.snapshots.create(input, timeout_ms=timeout_ms, idempotency_key=idempotency_key, retry=retry)

    def list_snapshots(
        self,
        query: Pagination | None = None,
        *,
        timeout_ms: int | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> Paginated:
        """List snapshots for this sandbox."""
        return self.snapshots.list(query, timeout_ms=timeout_ms, retry=retry)
