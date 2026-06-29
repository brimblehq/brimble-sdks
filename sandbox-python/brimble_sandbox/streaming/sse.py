"""Incremental SSE (`text/event-stream`) frame parser."""

from __future__ import annotations

import json
from collections.abc import Iterator
from typing import IO, cast

from ..types import ExecStreamFrame


def _parse_sse_block(block: str) -> ExecStreamFrame | None:
    data_line = next((line.strip() for line in block.split("\n") if line.strip().startswith("data:")), None)
    if not data_line:
        return None

    payload = data_line[len("data:") :].strip()
    if not payload:
        return None

    return cast(ExecStreamFrame, json.loads(payload))


def parse_sse_frames(body: IO[bytes]) -> Iterator[ExecStreamFrame]:
    """Parse SSE frames from a byte stream. Comment blocks (`: open`, `: ping`) are ignored."""
    buffer = ""

    while True:
        chunk = body.read(4096)
        if not chunk:
            break

        buffer += chunk.decode("utf-8")

        while "\n\n" in buffer:
            block, buffer = buffer.split("\n\n", 1)
            frame = _parse_sse_block(block)
            if frame is not None:
                yield frame

    if buffer.strip():
        frame = _parse_sse_block(buffer)
        if frame is not None:
            yield frame
