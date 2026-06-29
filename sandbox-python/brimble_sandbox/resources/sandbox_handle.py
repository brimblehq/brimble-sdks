"""Sandbox handle returned from create()/get() with direct runtime operations."""

from __future__ import annotations

import time
from collections.abc import Callable, Mapping
from typing import TYPE_CHECKING, cast

from ..streaming import ByteStream, ExecStream

from ..constants import DEFAULT_SANDBOX_READY_POLL_INTERVAL_MS, DEFAULT_SANDBOX_READY_TIMEOUT_MS
from ..enums import SandboxStatus
from ..transport import RetryOptions
from ..types import (
    BatchFileUploadFileInput,
    CodeInput,
    CreateSnapshotInput,
    ExecInput,
    FileUploadBody,
    Pagination,
    StatsQuery,
    WaitPreference,
)
from ..types import ExecResult
from ..types import Paginated, Snapshot
from ..types import SandboxBatchFileUpload

if TYPE_CHECKING:
    from .sandboxes import SandboxesResource


class SandboxHandle:
    """Convenience handle for one sandbox returned by `sandboxes.create(...)` or `sandboxes.get(...)`."""

    def __init__(self, sandboxes: "SandboxesResource", state: Mapping[str, object]) -> None:
        self._sandboxes = sandboxes
        self._state = dict(state)
        self._scope = sandboxes.use(self.id)
        self.snapshots = _SandboxHandleSnapshots(self)

    @property
    def id(self) -> str:
        """Current sandbox id."""
        return str(self._state["id"])

    @property
    def status(self) -> str:
        """Current cached sandbox status."""
        return str(self._state["status"])

    @property
    def data(self) -> dict[str, object]:
        """Current cached sandbox payload."""
        return self._state

    def refresh(
        self,
        *,
        timeout_ms: int | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> dict[str, object]:
        """Refresh sandbox details from the API and update local state."""
        sandbox = self._sandboxes.get_data(self.id, timeout_ms=timeout_ms, retry=retry)
        self._state = dict(sandbox)
        return self._state

    def destroy(
        self,
        *,
        timeout_ms: int | None = None,
        idempotency_key: str | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> None:
        """Destroy this sandbox (idempotent)."""
        self._sandboxes.destroy(self.id, timeout_ms=timeout_ms, idempotency_key=idempotency_key, retry=retry)

    def pause(
        self,
        *,
        timeout_ms: int | None = None,
        idempotency_key: str | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> dict[str, object] | None:
        """Request pause for this sandbox and refresh local state."""
        response = self._sandboxes.pause(self.id, timeout_ms=timeout_ms, idempotency_key=idempotency_key, retry=retry)
        self.refresh(timeout_ms=timeout_ms, retry=retry)
        return response

    def resume(
        self,
        *,
        timeout_ms: int | None = None,
        idempotency_key: str | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> dict[str, object] | None:
        """Request resume for this sandbox and refresh local state."""
        response = self._sandboxes.resume(self.id, timeout_ms=timeout_ms, idempotency_key=idempotency_key, retry=retry)
        self.refresh(timeout_ms=timeout_ms, retry=retry)
        return response

    def wait_until_ready(
        self,
        *,
        timeout_ms: int | None = DEFAULT_SANDBOX_READY_TIMEOUT_MS,
        poll_interval_ms: int | None = DEFAULT_SANDBOX_READY_POLL_INTERVAL_MS,
    ) -> dict[str, object]:
        """Poll until sandbox status becomes `ready`, or raise on timeout."""
        effective_timeout_ms = timeout_ms if timeout_ms is not None else DEFAULT_SANDBOX_READY_TIMEOUT_MS
        effective_poll_interval_ms = (
            poll_interval_ms if poll_interval_ms is not None else DEFAULT_SANDBOX_READY_POLL_INTERVAL_MS
        )

        deadline = time.monotonic() + (effective_timeout_ms / 1000)

        while True:
            sandbox = self.refresh(timeout_ms=effective_timeout_ms)
            if sandbox.get("status") == SandboxStatus.READY:
                return sandbox

            if time.monotonic() >= deadline:
                raise TimeoutError(f"Sandbox {self.id} did not become ready within {effective_timeout_ms}ms")

            time.sleep(max(effective_poll_interval_ms, 1) / 1000)

    def exec(
        self,
        input: ExecInput,
        *,
        timeout_ms: int | None = None,
        retry: RetryOptions | bool | None = None,
        wait_until_ready: WaitPreference | None = None,
        on_stdout: Callable[[str], None] | None = None,
        on_stderr: Callable[[str], None] | None = None,
    ) -> ExecResult | ExecStream:
        """Run a shell command in this sandbox; optionally auto-wait for readiness."""
        self._ensure_ready(wait_until_ready)
        return self._scope.exec(
            input,
            timeout_ms=timeout_ms,
            retry=retry,
            on_stdout=on_stdout,
            on_stderr=on_stderr,
        )

    def run_code(
        self,
        input: CodeInput,
        *,
        timeout_ms: int | None = None,
        retry: RetryOptions | bool | None = None,
        wait_until_ready: WaitPreference | None = None,
        on_stdout: Callable[[str], None] | None = None,
        on_stderr: Callable[[str], None] | None = None,
    ) -> ExecResult | ExecStream:
        """Run a code snippet in this sandbox; optionally auto-wait for readiness."""
        self._ensure_ready(wait_until_ready)
        return self._scope.run_code(
            input,
            timeout_ms=timeout_ms,
            retry=retry,
            on_stdout=on_stdout,
            on_stderr=on_stderr,
        )

    def exec_stream(
        self,
        input: ExecInput,
        *,
        timeout_ms: int | None = None,
        retry: RetryOptions | bool | None = None,
        wait_until_ready: WaitPreference | None = None,
    ) -> ExecStream:
        """Run a shell command and stream parsed stdout/stderr output."""
        self._ensure_ready(wait_until_ready)
        return self._scope.exec_stream(input, timeout_ms=timeout_ms, retry=retry)

    def run_code_stream(
        self,
        input: CodeInput,
        *,
        timeout_ms: int | None = None,
        retry: RetryOptions | bool | None = None,
        wait_until_ready: WaitPreference | None = None,
    ) -> ExecStream:
        """Run a code snippet and stream parsed stdout/stderr output."""
        self._ensure_ready(wait_until_ready)
        return self._scope.run_code_stream(input, timeout_ms=timeout_ms, retry=retry)

    def put_file(
        self,
        path: str,
        body: FileUploadBody,
        *,
        timeout_ms: int | None = None,
        retry: RetryOptions | bool | None = None,
        wait_until_ready: WaitPreference | None = None,
    ) -> None:
        """Upload bytes to this sandbox; optionally auto-wait for readiness."""
        self._ensure_ready(wait_until_ready)
        self._scope.put_file(path, body, timeout_ms=timeout_ms, retry=retry)

    def get_file(
        self,
        path: str,
        *,
        timeout_ms: int | None = None,
        retry: RetryOptions | bool | None = None,
        wait_until_ready: WaitPreference | None = None,
    ) -> ByteStream:
        """Download file bytes from this sandbox; optionally auto-wait for readiness."""
        self._ensure_ready(wait_until_ready)
        return self._scope.get_file(path, timeout_ms=timeout_ms, retry=retry)

    def put_files(
        self,
        files: list[BatchFileUploadFileInput],
        *,
        timeout_ms: int | None = None,
        retry: RetryOptions | bool | None = None,
        wait_until_ready: WaitPreference | None = None,
    ) -> SandboxBatchFileUpload:
        """Upload multiple files to this sandbox; optionally auto-wait for readiness."""
        self._ensure_ready(wait_until_ready)
        return self._scope.put_files(files, timeout_ms=timeout_ms, retry=retry)

    def stats(
        self,
        query: StatsQuery | None = None,
        *,
        timeout_ms: int | None = None,
        retry: RetryOptions | bool | None = None,
        wait_until_ready: WaitPreference | None = None,
    ) -> dict[str, object]:
        """Fetch stats for this sandbox; optionally auto-wait for readiness."""
        self._ensure_ready(wait_until_ready)
        return self._scope.stats(query, timeout_ms=timeout_ms, retry=retry)

    def create_snapshot(
        self,
        input: CreateSnapshotInput,
        *,
        timeout_ms: int | None = None,
        retry: RetryOptions | bool | None = None,
        wait_until_ready: WaitPreference | None = None,
    ) -> Snapshot:
        """Create a snapshot for this sandbox; optionally auto-wait for readiness."""
        self._ensure_ready(wait_until_ready)
        return self._scope.create_snapshot(input, timeout_ms=timeout_ms, retry=retry)

    def list_snapshots(
        self,
        query: Pagination | None = None,
        *,
        timeout_ms: int | None = None,
        retry: RetryOptions | bool | None = None,
        wait_until_ready: WaitPreference | None = None,
    ) -> Paginated:
        """List snapshots for this sandbox; optionally auto-wait for readiness."""
        self._ensure_ready(wait_until_ready)
        return self._scope.list_snapshots(query, timeout_ms=timeout_ms, retry=retry)

    def _ensure_ready(self, wait_until_ready: WaitPreference | None) -> None:
        if self.status == SandboxStatus.READY:
            return

        if wait_until_ready:
            if isinstance(wait_until_ready, dict):
                self.wait_until_ready(
                    timeout_ms=cast(int | None, wait_until_ready.get("timeout_ms")),
                    poll_interval_ms=cast(int | None, wait_until_ready.get("poll_interval_ms")),
                )
                return

            self.wait_until_ready()
            return

        self._assert_ready()

    def _assert_ready(self) -> None:
        if self.status != SandboxStatus.READY:
            raise RuntimeError(
                f"Sandbox {self.id} is {self.status}. Call wait_until_ready() or refresh() before runtime operations."
            )


class _SandboxHandleSnapshots:
    """Friendly snapshot helper namespace on top of SandboxHandle."""

    def __init__(self, handle: SandboxHandle) -> None:
        self._handle = handle

    def create(
        self,
        input: CreateSnapshotInput,
        *,
        timeout_ms: int | None = None,
        retry: RetryOptions | bool | None = None,
        wait_until_ready: WaitPreference | None = None,
    ) -> Snapshot:
        """Create a snapshot for this sandbox."""
        return self._handle.create_snapshot(
            input,
            timeout_ms=timeout_ms,
            retry=retry,
            wait_until_ready=wait_until_ready,
        )

    def list(
        self,
        query: Pagination | None = None,
        *,
        timeout_ms: int | None = None,
        retry: RetryOptions | bool | None = None,
        wait_until_ready: WaitPreference | None = None,
    ) -> Paginated:
        """List snapshots for this sandbox."""
        return self._handle.list_snapshots(
            query,
            timeout_ms=timeout_ms,
            retry=retry,
            wait_until_ready=wait_until_ready,
        )

    def iterate(
        self,
        query: Pagination | None = None,
        *,
        timeout_ms: int | None = None,
        retry: RetryOptions | bool | None = None,
        wait_until_ready: WaitPreference | None = None,
    ) -> list[Snapshot]:
        """Iterate snapshots for this sandbox and return flattened results."""
        page = query["page"] if query and "page" in query else 1
        limit = query["limit"] if query and "limit" in query else 15
        results: list[Snapshot] = []

        while True:
            payload = cast(Pagination, dict(query or {}))
            payload["page"] = page
            payload["limit"] = limit

            data = self.list(
                payload,
                timeout_ms=timeout_ms,
                retry=retry,
                wait_until_ready=wait_until_ready,
            )

            snapshots = cast(list[Snapshot], data.get("data", []))
            results.extend(snapshots)

            total_pages = data["totalPages"]
            if page >= total_pages or len(snapshots) == 0:
                break

            page += 1

        return results
