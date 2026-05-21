"""Path helpers for file endpoints."""

from urllib.parse import quote


def encode_path_segment(value: str) -> str:
    """Encode one path segment for URL use."""
    return quote(value, safe="")


def encode_file_path(path: str) -> str:
    """Encode a file path while preserving slash separators."""
    return "/".join(encode_path_segment(segment) for segment in path.split("/") if segment)
