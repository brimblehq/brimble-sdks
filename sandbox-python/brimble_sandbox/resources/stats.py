"""Sandbox metrics operations."""

from __future__ import annotations

from ..transport import HttpTransport, RequestOptions, RetryOptions
from ..types import Stats, StatsQuery


class StatsResource:
    """Fetch stats for one sandbox."""

    def __init__(self, transport: HttpTransport, sandbox_id: str) -> None:
        self._transport = transport
        self._sandbox_id = sandbox_id

    def stats(
        self,
        query: StatsQuery | None = None,
        *,
        timeout_ms: int | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> Stats:
        """Fetch CPU/memory/network usage stats."""
        options = RequestOptions(timeout_ms=timeout_ms, retry=retry)
        return self._transport.request_json(
            endpoint=f"/sandboxes/{self._sandbox_id}/stats",
            method="GET",
            query=query or {},
            options=options,
        )
