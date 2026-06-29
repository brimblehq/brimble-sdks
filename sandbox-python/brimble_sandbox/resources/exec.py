"""Sandbox exec/code operations."""

from __future__ import annotations

from collections.abc import Callable

from ..streaming import ExecStream, consume_exec_stream
from ..transport import HttpTransport, RequestOptions, RetryOptions
from ..types import CodeInput, ExecInput, ExecResult


def _to_request_body(input: ExecInput | CodeInput) -> dict[str, object]:
    payload = dict(input)
    if payload.get("stream") is not True:
        payload.pop("stream", None)
    return payload


def _to_stream_body(input: ExecInput | CodeInput) -> dict[str, object]:
    payload = dict(input)
    payload["stream"] = True
    return payload


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
        on_stdout: Callable[[str], None] | None = None,
        on_stderr: Callable[[str], None] | None = None,
    ) -> ExecResult | ExecStream:
        """Run a shell command in the sandbox."""
        options = RequestOptions(timeout_ms=timeout_ms, idempotency_key=idempotency_key, retry=retry)

        if input.get("stream") is True:
            return self._open_exec_stream(input, options)

        if on_stdout is not None or on_stderr is not None:
            stream = self._open_exec_stream(input, options)
            return consume_exec_stream(stream, on_stdout=on_stdout, on_stderr=on_stderr)

        return self._transport.request_json(
            endpoint=f"/sandboxes/{self._sandbox_id}/exec",
            method="POST",
            body=_to_request_body(input),
            options=options,
        )

    def run_code(
        self,
        input: CodeInput,
        *,
        timeout_ms: int | None = None,
        idempotency_key: str | None = None,
        retry: RetryOptions | bool | None = None,
        on_stdout: Callable[[str], None] | None = None,
        on_stderr: Callable[[str], None] | None = None,
    ) -> ExecResult | ExecStream:
        """Run a code snippet in the sandbox."""
        options = RequestOptions(timeout_ms=timeout_ms, idempotency_key=idempotency_key, retry=retry)

        if input.get("stream") is True:
            return self._open_code_stream(input, options)

        if on_stdout is not None or on_stderr is not None:
            stream = self._open_code_stream(input, options)
            return consume_exec_stream(stream, on_stdout=on_stdout, on_stderr=on_stderr)

        return self._transport.request_json(
            endpoint=f"/sandboxes/{self._sandbox_id}/code",
            method="POST",
            body=_to_request_body(input),
            options=options,
        )

    def exec_stream(
        self,
        input: ExecInput,
        *,
        timeout_ms: int | None = None,
        idempotency_key: str | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> ExecStream:
        """Run a shell command and stream parsed stdout/stderr output."""
        options = RequestOptions(timeout_ms=timeout_ms, idempotency_key=idempotency_key, retry=retry)
        return self._open_exec_stream(input, options)

    def run_code_stream(
        self,
        input: CodeInput,
        *,
        timeout_ms: int | None = None,
        idempotency_key: str | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> ExecStream:
        """Run a code snippet and stream parsed stdout/stderr output."""
        options = RequestOptions(timeout_ms=timeout_ms, idempotency_key=idempotency_key, retry=retry)
        return self._open_code_stream(input, options)

    def _open_exec_stream(self, input: ExecInput, options: RequestOptions) -> ExecStream:
        response = self._transport.request_sse(
            endpoint=f"/sandboxes/{self._sandbox_id}/exec",
            method="POST",
            body=_to_stream_body(input),
            options=options,
        )
        return ExecStream(response)

    def _open_code_stream(self, input: CodeInput, options: RequestOptions) -> ExecStream:
        response = self._transport.request_sse(
            endpoint=f"/sandboxes/{self._sandbox_id}/code",
            method="POST",
            body=_to_stream_body(input),
            options=options,
        )
        return ExecStream(response)
