from __future__ import annotations

import io

from brimble_sandbox.streaming.exec_stream import ExecStream
from brimble_sandbox.streaming.sse import parse_sse_frames


class _FakeResponse:
    def __init__(self, payload: bytes) -> None:
        self.raw = io.BytesIO(payload)

    def close(self) -> None:
        self.raw.close()


def test_parse_sse_frames_ignores_comments() -> None:
    payload = (
        b": open\n\n"
        b'data: {"type":"stdout","data":"line-1\\n"}\n\n'
        b": ping\n\n"
        b'data: {"type":"done","exit_code":0,"duration_ms":12}\n\n'
    )

    frames = list(parse_sse_frames(io.BytesIO(payload)))

    assert frames == [
        {"type": "stdout", "data": "line-1\n"},
        {"type": "done", "exit_code": 0, "duration_ms": 12},
    ]


def test_exec_stream_iterates_logs_and_result() -> None:
    payload = (
        b'data: {"type":"stdout","data":"one\\n"}\n\n'
        b'data: {"type":"stderr","data":"warn\\n"}\n\n'
        b'data: {"type":"done","exit_code":0,"duration_ms":4}\n\n'
    )
    stream = ExecStream(_FakeResponse(payload))

    logs = list(stream)
    result = stream.result()

    assert logs == [
        {"stream": "stdout", "data": "one\n"},
        {"stream": "stderr", "data": "warn\n"},
    ]
    assert result == {
        "stdout": "one\n",
        "stderr": "warn\n",
        "exit_code": 0,
        "duration_ms": 4,
    }
