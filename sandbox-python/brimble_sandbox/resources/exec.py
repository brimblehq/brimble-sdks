"""Sandbox exec/code operations."""

from __future__ import annotations

import requests

from ..transport import HttpTransport, RequestOptions, RetryOptions
from ..types import CodeInput, ExecInput, ExecResult


class ExecResource:
    """Run shell commands or code snippets in one sandbox."""

    def __init__(self, transport: HttpTransport, sandbox_id: str) -> None:
        self._transport = transport
        self._sandbox_id = sandbox_id

    def exec(
        self,
        input: ExecInput,
        *,
        timeout_ms: int | None = None,
        idempotency_key: str | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> ExecResult | requests.Response:
        """Run a shell command in the sandbox."""
        options = RequestOptions(timeout_ms=timeout_ms, idempotency_key=idempotency_key, retry=retry)

        if input.get("stream") is True:
            return self._transport.request_sse(
                endpoint=f"/sandboxes/{self._sandbox_id}/exec",
                method="POST",
                body=input,
                options=options,
            )

        return self._transport.request_json(
            endpoint=f"/sandboxes/{self._sandbox_id}/exec",
            method="POST",
            body=input,
            options=options,
        )

    def run_code(
        self,
        input: CodeInput,
        *,
        timeout_ms: int | None = None,
        idempotency_key: str | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> ExecResult | requests.Response:
        """Run a code snippet in the sandbox."""
        options = RequestOptions(timeout_ms=timeout_ms, idempotency_key=idempotency_key, retry=retry)

        if input.get("stream") is True:
            return self._transport.request_sse(
                endpoint=f"/sandboxes/{self._sandbox_id}/code",
                method="POST",
                body=input,
                options=options,
            )

        return self._transport.request_json(
            endpoint=f"/sandboxes/{self._sandbox_id}/code",
            method="POST",
            body=input,
            options=options,
        )

    def exec_stream(
        self,
        input: ExecInput,
        *,
        timeout_ms: int | None = None,
        idempotency_key: str | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> requests.Response:
        """Run a shell command and stream SSE output frames."""
        payload = dict(input)
        payload["stream"] = True
        options = RequestOptions(timeout_ms=timeout_ms, idempotency_key=idempotency_key, retry=retry)
        return self._transport.request_sse(
            endpoint=f"/sandboxes/{self._sandbox_id}/exec",
            method="POST",
            body=payload,
            options=options,
        )

    def run_code_stream(
        self,
        input: CodeInput,
        *,
        timeout_ms: int | None = None,
        idempotency_key: str | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> requests.Response:
        """Run a code snippet and stream SSE output frames."""
        payload = dict(input)
        payload["stream"] = True
        options = RequestOptions(timeout_ms=timeout_ms, idempotency_key=idempotency_key, retry=retry)
        return self._transport.request_sse(
            endpoint=f"/sandboxes/{self._sandbox_id}/code",
            method="POST",
            body=payload,
            options=options,
        )
