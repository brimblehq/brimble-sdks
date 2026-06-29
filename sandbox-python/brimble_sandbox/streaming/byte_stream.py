"""Iterable wrapper for streamed file downloads."""

from __future__ import annotations

from collections.abc import Iterator
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import requests


class ByteStream:
    """File download stream that supports `for chunk in stream`."""

    def __init__(self, response: requests.Response) -> None:
        self._response = response

    def __iter__(self) -> Iterator[bytes]:
        yield from self._response.iter_content(chunk_size=None)

    def close(self) -> None:
        self._response.close()

    def __enter__(self) -> ByteStream:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()
