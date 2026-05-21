"""Volume operations."""

from __future__ import annotations

from typing import Iterator, cast

from ..constants import DEFAULT_PAGE, DEFAULT_PAGE_LIMIT, MIN_VOLUME_SIZE_GB
from ..enums import VolumeType
from ..transport import HttpTransport, RequestOptions, RetryOptions
from ..types import CreateVolumeInput, Paginated, TeamScopedPagination, Volume


class VolumesResource:
    """Manage volume lifecycle and metadata."""

    def __init__(self, transport: HttpTransport) -> None:
        self._transport = transport

    def list(
        self,
        query: TeamScopedPagination | None = None,
        *,
        timeout_ms: int | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> Paginated:
        """List your volumes with pagination."""
        payload: dict[str, object] = {
            "page": DEFAULT_PAGE,
            "limit": DEFAULT_PAGE_LIMIT,
        }
        if query:
            payload.update(query)

        options = RequestOptions(timeout_ms=timeout_ms, retry=retry)
        return cast(
            Paginated,
            self._transport.request_json(
                endpoint="/volumes",
                method="GET",
                query=payload,
                options=options,
            ),
        )

    def iterate(
        self,
        query: TeamScopedPagination | None = None,
        *,
        timeout_ms: int | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> Iterator[Volume]:
        """Iterate volumes across pages."""
        page = query["page"] if query and "page" in query else DEFAULT_PAGE
        limit = query["limit"] if query and "limit" in query else DEFAULT_PAGE_LIMIT

        while True:
            payload = cast(TeamScopedPagination, dict(query or {}))
            payload["page"] = page
            payload["limit"] = limit
            result = self.list(payload, timeout_ms=timeout_ms, retry=retry)
            data = cast(list[Volume], result.get("data", []))

            for volume in data:
                yield volume

            total_pages = result["totalPages"]
            if page >= total_pages or len(data) == 0:
                return

            page += 1

    def create(
        self,
        input: CreateVolumeInput,
        *,
        timeout_ms: int | None = None,
        retry: RetryOptions | bool | None = None,
        idempotency_key: str | None = None,
    ) -> Volume:
        """Create a new volume. This package only accepts `type: sandbox`."""
        volume_type = input.get("type")
        if volume_type is not None and volume_type != VolumeType.SANDBOX:
            raise ValueError("Only volume type 'sandbox' is supported by this package.")

        size_gb_raw = input.get("sizeGB")
        if size_gb_raw is None:
            raise ValueError("Volume sizeGB is required.")

        size_gb = int(size_gb_raw)
        if size_gb < MIN_VOLUME_SIZE_GB:
            raise ValueError(f"Volume size must be at least {MIN_VOLUME_SIZE_GB}GB.")

        body: dict[str, object] = dict(input)
        body["type"] = VolumeType.SANDBOX

        options = RequestOptions(timeout_ms=timeout_ms, idempotency_key=idempotency_key, retry=retry)
        return cast(
            Volume,
            self._transport.request_json(
                endpoint="/volumes",
                method="POST",
                body=body,
                options=options,
            ),
        )

    def get(
        self,
        volume_id: str,
        *,
        timeout_ms: int | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> Volume:
        """Fetch one volume by id."""
        options = RequestOptions(timeout_ms=timeout_ms, retry=retry)
        return cast(
            Volume,
            self._transport.request_json(
                endpoint=f"/volumes/{volume_id}",
                method="GET",
                options=options,
            ),
        )

    def delete(
        self,
        volume_id: str,
        *,
        timeout_ms: int | None = None,
        idempotency_key: str | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> None:
        """Delete a volume by id."""
        options = RequestOptions(timeout_ms=timeout_ms, idempotency_key=idempotency_key, retry=retry)
        self._transport.request_json(
            endpoint=f"/volumes/{volume_id}",
            method="DELETE",
            options=options,
        )
