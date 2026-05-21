"""SDK error types."""

from __future__ import annotations


class SandboxApiError(Exception):
    """Raised when the Sandbox API returns a non-2xx HTTP response."""

    def __init__(self, status: int, message: str, endpoint: str, response_body: object, request_id: str | None = None) -> None:
        super().__init__(message)
        self.status = status
        self.endpoint = endpoint
        self.response_body = response_body
        self.request_id = request_id


class AuthError(SandboxApiError):
    """Raised when credentials are missing/invalid or access is denied."""


class ValidationError(SandboxApiError):
    """Raised when request payload/state fails validation."""


class NotFoundError(SandboxApiError):
    """Raised when a requested sandbox/volume/snapshot was not found."""


class RateLimitError(SandboxApiError):
    """Raised on 429 responses with optional retry-after guidance."""

    def __init__(
        self,
        status: int,
        message: str,
        endpoint: str,
        response_body: object,
        request_id: str | None = None,
        retry_after_seconds: float | None = None,
    ) -> None:
        super().__init__(status, message, endpoint, response_body, request_id)
        self.retry_after_seconds = retry_after_seconds
