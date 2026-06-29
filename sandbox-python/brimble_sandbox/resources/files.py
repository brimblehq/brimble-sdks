"""Sandbox file upload/download operations."""

from __future__ import annotations

import base64

from ..errors import AuthError
from ..streaming import ByteStream
from ..transport import HttpTransport, RequestOptions, RetryOptions
from ..types import BatchFileUploadFileInput, FileUploadBody, SandboxBatchFileUpload, SandboxBatchFileUploadResult
from .path import encode_file_path


class FilesResource:
    """Upload and download files for one sandbox."""

    def __init__(self, transport: HttpTransport, sandbox_id: str) -> None:
        self._transport = transport
        self._sandbox_id = sandbox_id

    def put(
        self,
        path: str,
        body: FileUploadBody,
        *,
        timeout_ms: int | None = None,
        idempotency_key: str | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> None:
        """Upload bytes to a path inside the sandbox."""
        headers: dict[str, str] = {
            "content-type": "application/octet-stream",
        }

        if isinstance(body, (bytes, bytearray)):
            headers["content-length"] = str(len(body))

        options = RequestOptions(timeout_ms=timeout_ms, idempotency_key=idempotency_key, retry=retry)
        self._transport.request_binary(
            endpoint=f"/sandboxes/{self._sandbox_id}/files/{encode_file_path(path)}",
            method="PUT",
            body=body,
            headers=headers,
            options=options,
        )

    def get(
        self,
        path: str,
        *,
        timeout_ms: int | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> ByteStream:
        """Download a file from the sandbox as an iterable byte stream."""
        options = RequestOptions(timeout_ms=timeout_ms, retry=retry)
        response = self._transport.request_stream(
            endpoint=f"/sandboxes/{self._sandbox_id}/files/{encode_file_path(path)}",
            method="GET",
            options=options,
        )
        return ByteStream(response)

    def put_batch(
        self,
        files: list[BatchFileUploadFileInput],
        *,
        timeout_ms: int | None = None,
        idempotency_key: str | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> SandboxBatchFileUpload:
        """Upload multiple files in one request using base64-encoded JSON payloads."""
        if len(files) == 0:
            raise ValueError("put_batch requires at least one file.")
        if len(files) > 100:
            raise ValueError("put_batch supports at most 100 files per request.")

        payload = {
            "files": [
                {
                    "path": _normalize_batch_path(file["path"]),
                    "content_base64": _encode_batch_body(file["body"]),
                }
                for file in files
            ]
        }

        options = RequestOptions(timeout_ms=timeout_ms, idempotency_key=idempotency_key, retry=retry)
        try:
            return self._transport.request_json(
                endpoint=f"/sandboxes/{self._sandbox_id}/files/batch",
                method="POST",
                body=payload,
                headers={"content-type": "application/json"},
                options=options,
            )
        except AuthError as error:
            if _is_known_batch_auth_issue(error):
                return self._put_batch_fallback(files, timeout_ms=timeout_ms, idempotency_key=idempotency_key, retry=retry)
            raise

    def _put_batch_fallback(
        self,
        files: list[BatchFileUploadFileInput],
        *,
        timeout_ms: int | None,
        idempotency_key: str | None,
        retry: RetryOptions | bool | None,
    ) -> SandboxBatchFileUpload:
        """Fallback path for `/files/batch` auth glitches in provisioner flow."""
        uploaded = 0
        failed = 0
        results: list[SandboxBatchFileUploadResult] = []

        for file in files:
            raw = _to_raw_bytes(file["body"])
            path = _normalize_batch_path(file["path"])
            try:
                self.put(
                    path,
                    raw,
                    timeout_ms=timeout_ms,
                    idempotency_key=idempotency_key,
                    retry=retry,
                )
                uploaded += 1
                results.append(
                    {
                        "path": path,
                        "bytes": len(raw),
                        "success": True,
                    }
                )
            except Exception as error:
                failed += 1
                results.append(
                    {
                        "path": path,
                        "bytes": len(raw),
                        "success": False,
                        "error": str(error),
                    }
                )

        return {
            "uploaded": uploaded,
            "failed": failed,
            "results": results,
        }


def _normalize_batch_path(path: str) -> str:
    return path if path.startswith("/") else f"/{path}"


def _encode_batch_body(body: bytes | bytearray | str) -> str:
    raw = _to_raw_bytes(body)
    return base64.b64encode(raw).decode("ascii")


def _to_raw_bytes(body: bytes | bytearray | str) -> bytes:
    if isinstance(body, str):
        return body.encode("utf-8")
    return bytes(body)


def _is_known_batch_auth_issue(error: AuthError) -> bool:
    return error.status in (401, 403) and "oops not authenticated" in str(error).lower()
