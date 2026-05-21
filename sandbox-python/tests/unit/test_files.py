from __future__ import annotations

from typing import Any

from brimble_sandbox import Sandbox
from brimble_sandbox.errors import AuthError


def test_put_files_encodes_base64_and_normalizes_path() -> None:
    client = Sandbox(api_key="test-key")

    captured_body: dict[str, object] = {}

    def fake_request_json(**kwargs: Any) -> object:
        nonlocal captured_body
        captured_body = dict(kwargs.get("body", {}))
        return {
            "uploaded": 2,
            "failed": 0,
            "results": [
                {"path": "/tmp/a.txt", "bytes": 5, "success": True},
                {"path": "/tmp/b.txt", "bytes": 4, "success": True},
            ],
        }

    client.sandboxes._transport.request_json = fake_request_json  # type: ignore[assignment]

    result = client.sandboxes.use("sandbox-1").put_files(
        [
            {"path": "tmp/a.txt", "body": "hello"},
            {"path": "/tmp/b.txt", "body": b"\x01\x02\x03\x04"},
        ]
    )

    assert result["uploaded"] == 2
    assert captured_body == {
        "files": [
            {"path": "/tmp/a.txt", "content_base64": "aGVsbG8="},
            {"path": "/tmp/b.txt", "content_base64": "AQIDBA=="},
        ]
    }


def test_put_files_validates_count_bounds() -> None:
    client = Sandbox(api_key="test-key")
    scope = client.sandboxes.use("sandbox-1")

    try:
        scope.put_files([])
        raise AssertionError("Expected ValueError for empty file list")
    except ValueError as error:
        assert "at least one file" in str(error)

    too_many = [{"path": f"/tmp/{idx}.txt", "body": "x"} for idx in range(101)]

    try:
        scope.put_files(too_many)
        raise AssertionError("Expected ValueError for >100 files")
    except ValueError as error:
        assert "at most 100 files" in str(error)


def test_put_files_falls_back_to_single_upload_on_known_batch_auth_error() -> None:
    client = Sandbox(api_key="test-key")
    scope = client.sandboxes.use("sandbox-1")

    captured_binary_paths: list[str] = []

    def fake_request_json(**_: Any) -> object:
        raise AuthError(401, "Oops not authenticated", "POST /sandboxes/sandbox-1/files/batch", {}, None)

    def fake_request_binary(**kwargs: Any) -> None:
        captured_binary_paths.append(str(kwargs["endpoint"]))

    client.sandboxes._transport.request_json = fake_request_json  # type: ignore[assignment]
    client.sandboxes._transport.request_binary = fake_request_binary  # type: ignore[assignment]

    result = scope.put_files(
        [
            {"path": "tmp/a.txt", "body": "hello"},
            {"path": "/tmp/b.txt", "body": b"world"},
        ]
    )

    assert result["uploaded"] == 2
    assert result["failed"] == 0
    assert captured_binary_paths == [
        "/sandboxes/sandbox-1/files/tmp/a.txt",
        "/sandboxes/sandbox-1/files/tmp/b.txt",
    ]
