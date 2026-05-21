"""Snapshot operations."""

from __future__ import annotations

from typing import Iterator, cast

from ..constants import DEFAULT_PAGE, DEFAULT_PAGE_LIMIT
from ..transport import HttpTransport, RequestOptions, RetryOptions
from ..types import CreateSnapshotInput, Paginated, Pagination, Snapshot


class SnapshotScopeResource:
    """Snapshot operations scoped to one sandbox."""

    def __init__(self, transport: HttpTransport, sandbox_id: str) -> None:
        self._transport = transport
        self._sandbox_id = sandbox_id

    def create(
        self,
        input: CreateSnapshotInput,
        *,
        timeout_ms: int | None = None,
        idempotency_key: str | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> Snapshot:
        """Create a snapshot for this sandbox."""
        options = RequestOptions(timeout_ms=timeout_ms, idempotency_key=idempotency_key, retry=retry)
        return self._transport.request_json(
            endpoint=f"/sandboxes/{self._sandbox_id}/snapshots",
            method="POST",
            body=input,
            options=options,
        )

    def list(
        self,
        query: Pagination | None = None,
        *,
        timeout_ms: int | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> Paginated:
        """List snapshots for this sandbox."""
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
                endpoint=f"/sandboxes/{self._sandbox_id}/snapshots",
                method="GET",
                query=payload,
                options=options,
            ),
        )

    def iterate(
        self,
        query: Pagination | None = None,
        *,
        timeout_ms: int | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> Iterator[Snapshot]:
        """Iterate snapshots for this sandbox across pages."""
        page = query["page"] if query and "page" in query else DEFAULT_PAGE
        limit = query["limit"] if query and "limit" in query else DEFAULT_PAGE_LIMIT

        while True:
            payload = cast(Pagination, dict(query or {}))
            payload["page"] = page
            payload["limit"] = limit
            result = self.list(payload, timeout_ms=timeout_ms, retry=retry)
            data = cast(list[Snapshot], result.get("data", []))

            for snapshot in data:
                yield snapshot

            total_pages = result["totalPages"]
            if page >= total_pages or len(data) == 0:
                return

            page += 1


class SnapshotsResource:
    """Account-level snapshot operations."""

    def __init__(self, transport: HttpTransport) -> None:
        self._transport = transport

    def list_all(
        self,
        query: Pagination | None = None,
        *,
        timeout_ms: int | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> Paginated:
        """List all snapshots across all sandboxes."""
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
                endpoint="/sandboxes/snapshots",
                method="GET",
                query=payload,
                options=options,
            ),
        )

    def iterate_all(
        self,
        query: Pagination | None = None,
        *,
        timeout_ms: int | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> Iterator[Snapshot]:
        """Iterate all snapshots across pages."""
        page = query["page"] if query and "page" in query else DEFAULT_PAGE
        limit = query["limit"] if query and "limit" in query else DEFAULT_PAGE_LIMIT

        while True:
            payload = cast(Pagination, dict(query or {}))
            payload["page"] = page
            payload["limit"] = limit
            result = self.list_all(payload, timeout_ms=timeout_ms, retry=retry)
            data = cast(list[Snapshot], result.get("data", []))

            for snapshot in data:
                yield snapshot

            total_pages = result["totalPages"]
            if page >= total_pages or len(data) == 0:
                return

            page += 1

    def delete(
        self,
        snapshot_id: str,
        *,
        timeout_ms: int | None = None,
        idempotency_key: str | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> None:
        """Delete a snapshot by id."""
        options = RequestOptions(timeout_ms=timeout_ms, idempotency_key=idempotency_key, retry=retry)
        self._transport.request_json(
            endpoint=f"/sandboxes/snapshots/{snapshot_id}",
            method="DELETE",
            options=options,
        )
