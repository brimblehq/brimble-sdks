"""Sandbox lifecycle operations."""

from __future__ import annotations

import re
from typing import Iterator, cast

from ..constants import DEFAULT_PAGE, DEFAULT_PAGE_LIMIT
from ..enums import VolumeType
from ..transport import HttpTransport, RequestOptions, RetryOptions
from ..types import (
    CreateSandboxRequest,
    CreateSandboxResult,
    CreateSandboxWithVolumeInput,
    CreateVolumeInput,
    Paginated,
    Sandbox,
    SandboxRegionInput,
    SandboxRegionsResult,
    SandboxTemplate,
    TeamScopedPagination,
    UpdateSandboxEgressInput,
)
from .sandbox_handle import SandboxHandle
from .scoped_sandbox import ScopedSandboxResource
from .volumes import VolumesResource

MOUNT_PATH_PATTERN = re.compile(r"^/[A-Za-z0-9._/-]*$")


class SandboxesResource:
    """Manage sandbox lifecycle and metadata."""

    def __init__(self, transport: HttpTransport) -> None:
        self._transport = transport
        self._volumes = VolumesResource(transport)

    def create(
        self,
        input: CreateSandboxRequest,
        *,
        timeout_ms: int | None = None,
        idempotency_key: str | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> SandboxHandle:
        """Create a sandbox. Region is optional; omitted means the API assigns a region."""
        body = self._build_create_body(input)
        self._apply_mount_path_default(body)
        self._validate_mount_path(body)

        result = cast(
            CreateSandboxResult,
            self._transport.request_json(
                endpoint="/sandboxes",
                method="POST",
                body=body,
                options=_options(timeout_ms=timeout_ms, idempotency_key=idempotency_key, retry=retry),
            ),
        )
        return SandboxHandle(self, result)

    def create_ready(
        self,
        input: CreateSandboxRequest,
        *,
        timeout_ms: int | None = None,
        idempotency_key: str | None = None,
        retry: RetryOptions | bool | None = None,
        wait_timeout_ms: int | None = None,
        wait_poll_interval_ms: int | None = None,
    ) -> SandboxHandle:
        """Create a sandbox and wait until it is ready before returning."""
        sandbox = self.create(
            input,
            timeout_ms=timeout_ms,
            idempotency_key=idempotency_key,
            retry=retry,
        )
        sandbox.wait_until_ready(timeout_ms=wait_timeout_ms, poll_interval_ms=wait_poll_interval_ms)
        return sandbox

    def with_volume(
        self,
        input: CreateSandboxWithVolumeInput,
        *,
        timeout_ms: int | None = None,
        idempotency_key: str | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> SandboxHandle:
        """Create a sandbox volume first, then create a sandbox attached to it."""
        sandbox_input = input["sandbox"]
        volume_input = input["volume"]

        resolved_region = self._resolve_region_id(
            cast(SandboxRegionInput | None, sandbox_input.get("region") or volume_input.get("region")),
            timeout_ms=timeout_ms,
        )

        volume = self._volumes.create(
            {
                "name": volume_input["name"],
                "sizeGB": volume_input["sizeGB"],
                "region": resolved_region,
                "teamId": volume_input.get("teamId"),
                "type": VolumeType.SANDBOX,
            },
            timeout_ms=timeout_ms,
            retry=retry,
        )

        body: CreateSandboxRequest = dict(sandbox_input)
        body["volumeId"] = str(volume["id"])
        if resolved_region and resolved_region != "auto":
            body["region"] = resolved_region

        return self.create(
            body,
            timeout_ms=timeout_ms,
            idempotency_key=idempotency_key,
            retry=retry,
        )

    def list(
        self,
        query: TeamScopedPagination | None = None,
        *,
        timeout_ms: int | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> Paginated:
        """List your sandboxes with pagination and return handle objects in `data`."""
        page = self.list_data(query, timeout_ms=timeout_ms, retry=retry)
        raw_data = cast(list[Sandbox], page.get("data", []))
        handles: list[object] = [SandboxHandle(self, item) for item in raw_data]
        page["data"] = handles
        return page

    def list_data(
        self,
        query: TeamScopedPagination | None = None,
        *,
        timeout_ms: int | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> Paginated:
        """List your sandboxes with pagination and return raw API payloads."""
        payload: dict[str, object] = {
            "page": DEFAULT_PAGE,
            "limit": DEFAULT_PAGE_LIMIT,
        }
        if query:
            payload.update(query)

        return cast(
            Paginated,
            self._transport.request_json(
                endpoint="/sandboxes",
                method="GET",
                query=payload,
                options=_options(timeout_ms=timeout_ms, retry=retry),
            ),
        )

    def iterate(
        self,
        query: TeamScopedPagination | None = None,
        *,
        timeout_ms: int | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> Iterator[SandboxHandle]:
        """Iterate through all sandbox handles across pages."""
        page = query["page"] if query and "page" in query else DEFAULT_PAGE
        limit = query["limit"] if query and "limit" in query else DEFAULT_PAGE_LIMIT

        while True:
            payload: TeamScopedPagination = cast(TeamScopedPagination, dict(query or {}))
            payload["page"] = page
            payload["limit"] = limit
            result = self.list(payload, timeout_ms=timeout_ms, retry=retry)
            data = cast(list[SandboxHandle], result.get("data", []))

            for sandbox in data:
                yield sandbox

            total_pages = result["totalPages"]
            if page >= total_pages or len(data) == 0:
                return

            page += 1

    def get(
        self,
        sandbox_id: str,
        *,
        timeout_ms: int | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> SandboxHandle:
        """Fetch one sandbox handle by id."""
        return SandboxHandle(self, self.get_data(sandbox_id, timeout_ms=timeout_ms, retry=retry))

    def get_ready(
        self,
        sandbox_id: str,
        *,
        timeout_ms: int | None = None,
        retry: RetryOptions | bool | None = None,
        wait_timeout_ms: int | None = None,
        wait_poll_interval_ms: int | None = None,
    ) -> SandboxHandle:
        """Fetch one sandbox and wait until it is ready."""
        sandbox = self.get(sandbox_id, timeout_ms=timeout_ms, retry=retry)
        sandbox.wait_until_ready(timeout_ms=wait_timeout_ms, poll_interval_ms=wait_poll_interval_ms)
        return sandbox

    def get_data(
        self,
        sandbox_id: str,
        *,
        timeout_ms: int | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> Sandbox:
        """Fetch one sandbox raw payload by id."""
        return cast(
            Sandbox,
            self._transport.request_json(
                endpoint=f"/sandboxes/{sandbox_id}",
                method="GET",
                options=_options(timeout_ms=timeout_ms, retry=retry),
            ),
        )

    def wait_data(
        self,
        sandbox_id: str,
        *,
        timeout_seconds: int | None = None,
        status: str | None = None,
        timeout_ms: int | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> Sandbox:
        """Long-poll until the sandbox reaches a terminal provisioning status."""
        from ..constants import DEFAULT_SANDBOX_LONG_POLL_TIMEOUT_SECONDS

        wait_seconds = timeout_seconds if timeout_seconds is not None else DEFAULT_SANDBOX_LONG_POLL_TIMEOUT_SECONDS
        query: dict[str, object] = {"timeout": wait_seconds}
        if status:
            query["status"] = status

        effective_timeout_ms = timeout_ms
        if effective_timeout_ms is None:
            effective_timeout_ms = (wait_seconds + 5) * 1000

        return cast(
            Sandbox,
            self._transport.request_json(
                endpoint=f"/sandboxes/{sandbox_id}/wait",
                method="GET",
                query=query,
                options=_options(timeout_ms=effective_timeout_ms, retry=retry),
            ),
        )

    def list_regions(
        self,
        *,
        timeout_ms: int | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> SandboxRegionsResult:
        """List regions where sandboxes can be provisioned."""
        return cast(
            SandboxRegionsResult,
            self._transport.request_json(
                endpoint="/sandboxes/regions",
                method="GET",
                options=_options(timeout_ms=timeout_ms, retry=retry),
            ),
        )

    def list_templates(
        self,
        *,
        timeout_ms: int | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> list[SandboxTemplate]:
        """List available sandbox templates."""
        payload = self._transport.request_json(
            endpoint="/sandbox/templates",
            method="GET",
            options=_options(timeout_ms=timeout_ms, retry=retry),
        )

        if isinstance(payload, list):
            return cast(list[SandboxTemplate], payload)

        if isinstance(payload, dict):
            templates = payload.get("templates")
            if isinstance(templates, list):
                return cast(list[SandboxTemplate], templates)

        return []

    def get_template(
        self,
        template_name: str,
        *,
        timeout_ms: int | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> SandboxTemplate | None:
        """Fetch a template by name from the template catalog."""
        templates = self.list_templates(timeout_ms=timeout_ms, retry=retry)
        for template in templates:
            if template.get("name") == template_name:
                return template
        return None

    def destroy(
        self,
        sandbox_id: str,
        *,
        timeout_ms: int | None = None,
        idempotency_key: str | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> None:
        """Destroy a sandbox (idempotent)."""
        self._transport.request_json(
            endpoint=f"/sandboxes/{sandbox_id}",
            method="DELETE",
            options=_options(timeout_ms=timeout_ms, idempotency_key=idempotency_key, retry=retry),
        )

    def pause(
        self,
        sandbox_id: str,
        *,
        timeout_ms: int | None = None,
        idempotency_key: str | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> dict[str, object] | None:
        """Request sandbox pause."""
        return cast(
            dict[str, object] | None,
            self._transport.request_json(
                endpoint=f"/sandboxes/{sandbox_id}/pause",
                method="POST",
                options=_options(timeout_ms=timeout_ms, idempotency_key=idempotency_key, retry=retry),
            ),
        )

    def resume(
        self,
        sandbox_id: str,
        *,
        timeout_ms: int | None = None,
        idempotency_key: str | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> dict[str, object] | None:
        """Request sandbox resume."""
        return cast(
            dict[str, object] | None,
            self._transport.request_json(
                endpoint=f"/sandboxes/{sandbox_id}/resume",
                method="POST",
                options=_options(timeout_ms=timeout_ms, idempotency_key=idempotency_key, retry=retry),
            ),
        )

    def update_egress(
        self,
        sandbox_id: str,
        input: UpdateSandboxEgressInput,
        *,
        timeout_ms: int | None = None,
        idempotency_key: str | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> dict[str, object]:
        """Update sandbox outbound network policy."""
        return cast(
            dict[str, object],
            self._transport.request_json(
                endpoint=f"/sandboxes/{sandbox_id}/egress",
                method="PUT",
                body=input,
                options=_options(timeout_ms=timeout_ms, idempotency_key=idempotency_key, retry=retry),
            ),
        )

    def use(self, sandbox_id: str) -> ScopedSandboxResource:
        """Use runtime operations for a specific sandbox id."""
        return ScopedSandboxResource(self._transport, sandbox_id)

    def create_volume(
        self,
        input: CreateVolumeInput,
        *,
        timeout_ms: int | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> dict[str, object]:
        """Create a sandbox-only volume with package-level defaults/validation."""
        return self._volumes.create(input, timeout_ms=timeout_ms, retry=retry)

    def quickstart_node(
        self,
        *,
        region: SandboxRegionInput | None = "auto",
        wait_until_ready: bool = True,
        timeout_ms: int | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> SandboxHandle:
        """Create a Node sandbox with practical defaults."""
        create_input: CreateSandboxRequest = {
            "template": "node-22",
            "persistent": True,
            "persistentDiskGB": 20,
            "mountPath": "/workspace",
        }
        if region and region != "auto":
            create_input["region"] = region

        sandbox = self.create(
            create_input,
            timeout_ms=timeout_ms,
            retry=retry,
        )

        if wait_until_ready:
            sandbox.wait_until_ready()

        return sandbox

    def quickstart_python(
        self,
        *,
        region: SandboxRegionInput | None = "auto",
        wait_until_ready: bool = True,
        timeout_ms: int | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> SandboxHandle:
        """Create a Python sandbox with practical defaults."""
        create_input: CreateSandboxRequest = {
            "template": "python-3.12",
            "persistent": True,
            "persistentDiskGB": 20,
            "mountPath": "/workspace",
        }
        if region and region != "auto":
            create_input["region"] = region

        sandbox = self.create(
            create_input,
            timeout_ms=timeout_ms,
            retry=retry,
        )

        if wait_until_ready:
            sandbox.wait_until_ready()

        return sandbox

    def _resolve_region_id(self, region: SandboxRegionInput | None, *, timeout_ms: int | None = None) -> str:
        if region and region != "auto":
            return str(region)

        regions = self.list_regions(timeout_ms=timeout_ms)
        region_list = regions.get("regions", [])
        if len(region_list) == 0:
            raise RuntimeError("No sandbox regions available for this account.")

        region_id = region_list[0].get("id")
        if not region_id:
            raise RuntimeError("No sandbox regions available for this account.")

        return str(region_id)

    def _build_create_body(self, input: CreateSandboxRequest) -> CreateSandboxRequest:
        body: CreateSandboxRequest = dict(input)
        region = body.get("region")
        if not region or region == "auto":
            body.pop("region", None)
        return body

    def _validate_mount_path(self, input: CreateSandboxRequest) -> None:
        mount_path = input.get("mountPath")
        has_persistent = input.get("persistent") is True
        has_volume = isinstance(input.get("volumeId"), str) and len(str(input.get("volumeId"))) > 0
        has_storage = has_persistent or has_volume
        has_mount_path = isinstance(mount_path, str) and mount_path != ""

        if has_storage and not has_mount_path:
            raise ValueError("mountPath is required when using persistent storage (`persistent`/`persistentDiskGB` or `volumeId`).")

        if not has_mount_path:
            return

        mount_path_value = str(mount_path)
        if not MOUNT_PATH_PATTERN.fullmatch(mount_path_value) or mount_path_value == "/":
            raise ValueError('mountPath must match ^/[A-Za-z0-9._/-]*$ and cannot be "/".')

        if not has_persistent and not has_volume:
            raise ValueError("mountPath requires either `persistent: true` or `volumeId`.")

    def _apply_mount_path_default(self, input: CreateSandboxRequest) -> None:
        has_persistent = input.get("persistent") is True
        has_volume = isinstance(input.get("volumeId"), str) and len(str(input.get("volumeId"))) > 0
        has_storage = has_persistent or has_volume
        mount_path = input.get("mountPath")
        has_mount_path = isinstance(mount_path, str) and mount_path != ""

        if has_storage and not has_mount_path:
            input["mountPath"] = "/workspace"


def _options(
    *,
    timeout_ms: int | None = None,
    idempotency_key: str | None = None,
    retry: RetryOptions | bool | None = None,
) -> RequestOptions:
    return RequestOptions(timeout_ms=timeout_ms, idempotency_key=idempotency_key, retry=retry)
