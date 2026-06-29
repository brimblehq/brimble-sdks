"""Parsed exec/code streaming output."""

from __future__ import annotations

from collections.abc import Callable, Iterator
from typing import TYPE_CHECKING, cast

from ..types import ExecLog, ExecResult, ExecStreamFrame
from .sse import parse_sse_frames

if TYPE_CHECKING:
    import requests


def _aggregate_frames(frames: list[ExecStreamFrame]) -> ExecResult:
    stdout = ""
    stderr = ""
    exit_code = 1
    duration_ms = 0
    saw_done = False

    for frame in frames:
        frame_type = frame["type"]
        if frame_type == "stdout":
            stdout += frame["data"]
        elif frame_type == "stderr":
            stderr += frame["data"]
        elif frame_type == "done":
            exit_code = frame["exit_code"]
            duration_ms = frame["duration_ms"]
            saw_done = True
        elif frame_type == "error":
            raise RuntimeError(frame["message"])

    if not saw_done:
        raise RuntimeError("Command stream ended before completion")

    return {
        "stdout": stdout,
        "stderr": stderr,
        "exit_code": exit_code,
        "duration_ms": duration_ms,
    }


class ExecStream:
    """
    Live command output from a streaming exec or run_code call.

    ```python
    output = sandbox.exec_stream({"cmd": "npm install"})
    for log in output:
        if log["stream"] == "stdout":
            print(log["data"], end="")
    result = output.result()
    ```
    """

    def __init__(self, response: requests.Response) -> None:
        self._response = response
        self._cached_frames: list[ExecStreamFrame] | None = None

    def logs(self) -> Iterator[ExecLog]:
        """Iterate stdout/stderr chunks as they arrive."""
        for frame in self.frames():
            frame_type = frame["type"]
            if frame_type == "stdout":
                yield {"stream": "stdout", "data": frame["data"]}
            elif frame_type == "stderr":
                yield {"stream": "stderr", "data": frame["data"]}

    def frames(self) -> Iterator[ExecStreamFrame]:
        """Iterate all SSE frames, including the terminal `done` frame."""
        if self._cached_frames is not None:
            yield from self._cached_frames
            return

        frames: list[ExecStreamFrame] = []
        body = self._response.raw
        if body is None:
            raise RuntimeError("Expected a response stream but received an empty body")

        for frame in parse_sse_frames(body):
            frames.append(frame)
            yield frame

        self._cached_frames = frames

    def result(self) -> ExecResult:
        """Wait for completion and return the aggregated command result."""
        if self._cached_frames is not None:
            return _aggregate_frames(self._cached_frames)

        frames = list(self.frames())
        return _aggregate_frames(frames)

    def close(self) -> None:
        self._response.close()

    def __iter__(self) -> Iterator[ExecLog]:
        return self.logs()

    def __enter__(self) -> ExecStream:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()


def consume_exec_stream(
    stream: ExecStream,
    *,
    on_stdout: Callable[[str], None] | None = None,
    on_stderr: Callable[[str], None] | None = None,
) -> ExecResult:
    """Drain a stream, invoking callbacks for live output."""
    for frame in stream.frames():
        frame_type = frame["type"]
        if frame_type == "stdout":
            if on_stdout is not None:
                on_stdout(frame["data"])
        elif frame_type == "stderr":
            if on_stderr is not None:
                on_stderr(frame["data"])
        elif frame_type == "error":
            raise RuntimeError(cast(dict[str, str], frame)["message"])

    return stream.result()
