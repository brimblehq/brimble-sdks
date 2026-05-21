"""HTTP transport helpers for the Sandbox SDK."""

from __future__ import annotations

import time
from collections.abc import Iterable, Mapping
from typing import Any, MutableMapping

import requests

from .constants import (
    DEFAULT_RETRY_BASE_DELAY_MS,
    DEFAULT_RETRY_MAX_ATTEMPTS,
    DEFAULT_RETRY_MAX_DELAY_MS,
    DEFAULT_RETRY_METHODS,
    DEFAULT_RETRY_STATUSES,
    SDK_PACKAGE_VERSION,
    DEFAULT_TIMEOUT_MS,
)
from .errors import AuthError, NotFoundError, RateLimitError, SandboxApiError, ValidationError


class RetryOptions:
    """Retry controls for transport requests."""

    def __init__(
        self,
        *,
        max_attempts: int | None = None,
        base_delay_ms: int | None = None,
        max_delay_ms: int | None = None,
        retry_statuses: Iterable[int] | None = None,
        retry_methods: Iterable[str] | None = None,
    ) -> None:
        self.max_attempts = max_attempts
        self.base_delay_ms = base_delay_ms
        self.max_delay_ms = max_delay_ms
        self.retry_statuses = tuple(retry_statuses) if retry_statuses is not None else None
        self.retry_methods = tuple(method.upper() for method in retry_methods) if retry_methods is not None else None


class RequestOptions:
    """Per-request transport options."""

    def __init__(
        self,
        timeout_ms: int | None = None,
        idempotency_key: str | None = None,
        retry: RetryOptions | bool | None = None,
    ) -> None:
        self.timeout_ms = timeout_ms
        self.idempotency_key = idempotency_key
        self.retry = retry


class _RetryConfig:
    def __init__(
        self,
        *,
        max_attempts: int,
        base_delay_ms: int,
        max_delay_ms: int,
        retry_statuses: tuple[int, ...],
        retry_methods: tuple[str, ...],
    ) -> None:
        self.max_attempts = max_attempts
        self.base_delay_ms = base_delay_ms
        self.max_delay_ms = max_delay_ms
        self.retry_statuses = retry_statuses
        self.retry_methods = retry_methods


def _build_url(base_url: str, endpoint: str, query: Mapping[str, object] | None = None) -> str:
    normalized_base = base_url[:-1] if base_url.endswith("/") else base_url
    normalized_endpoint = endpoint if endpoint.startswith("/") else f"/{endpoint}"
    url = f"{normalized_base}{normalized_endpoint}"

    if not query:
        return url

    params: dict[str, object] = {}
    for key, value in query.items():
        if value is None:
            continue
        params[key] = value

    prepared = requests.Request("GET", url, params=params).prepare()
    return prepared.url or url


def _to_timeout_seconds(timeout_ms: int | None, default_timeout_ms: int) -> float:
    effective = timeout_ms if timeout_ms is not None else default_timeout_ms
    return max(effective, 1) / 1000


def _extract_error_message(response: requests.Response, parsed_body: object) -> str:
    if isinstance(parsed_body, dict):
        message = parsed_body.get("message")
        if isinstance(message, str) and message:
            return message

    text = response.text.strip()
    if text:
        return text

    return response.reason or "Sandbox API request failed"


def _normalize_retry_config(options: RetryOptions | None) -> _RetryConfig:
    max_attempts = DEFAULT_RETRY_MAX_ATTEMPTS
    base_delay_ms = DEFAULT_RETRY_BASE_DELAY_MS
    max_delay_ms = DEFAULT_RETRY_MAX_DELAY_MS
    retry_statuses = tuple(DEFAULT_RETRY_STATUSES)
    retry_methods = tuple(DEFAULT_RETRY_METHODS)

    if options is not None:
        if options.max_attempts is not None:
            max_attempts = max(1, options.max_attempts)
        if options.base_delay_ms is not None:
            base_delay_ms = max(0, options.base_delay_ms)
        if options.max_delay_ms is not None:
            max_delay_ms = max(0, options.max_delay_ms)
        if options.retry_statuses is not None:
            retry_statuses = tuple(options.retry_statuses)
        if options.retry_methods is not None:
            retry_methods = tuple(method.upper() for method in options.retry_methods)

    return _RetryConfig(
        max_attempts=max_attempts,
        base_delay_ms=base_delay_ms,
        max_delay_ms=max_delay_ms,
        retry_statuses=retry_statuses,
        retry_methods=retry_methods,
    )


def _merge_retry_config(base: _RetryConfig, override: RetryOptions | bool | None) -> _RetryConfig:
    if override is False:
        return _RetryConfig(
            max_attempts=1,
            base_delay_ms=base.base_delay_ms,
            max_delay_ms=base.max_delay_ms,
            retry_statuses=base.retry_statuses,
            retry_methods=base.retry_methods,
        )

    if override is None or override is True:
        return base

    return _normalize_retry_config(
        RetryOptions(
            max_attempts=override.max_attempts if override.max_attempts is not None else base.max_attempts,
            base_delay_ms=override.base_delay_ms if override.base_delay_ms is not None else base.base_delay_ms,
            max_delay_ms=override.max_delay_ms if override.max_delay_ms is not None else base.max_delay_ms,
            retry_statuses=override.retry_statuses if override.retry_statuses is not None else base.retry_statuses,
            retry_methods=override.retry_methods if override.retry_methods is not None else base.retry_methods,
        )
    )


def _can_retry_body(body: object | None) -> bool:
    if body is None:
        return True
    if isinstance(body, (bytes, bytearray, str)):
        return True
    return False


def _compute_delay_ms(attempt: int, base_delay_ms: int, max_delay_ms: int) -> int:
    delay_ms = base_delay_ms * (2 ** max(0, attempt - 1))
    return min(max_delay_ms, delay_ms)


def _request_id(response: requests.Response) -> str | None:
    return response.headers.get("x-request-id") or response.headers.get("x-correlation-id")


def _retry_after_seconds(response: requests.Response) -> float | None:
    header = response.headers.get("retry-after")
    if not header:
        return None

    try:
        return float(header)
    except ValueError:
        return None


def _build_api_error(
    response: requests.Response,
    *,
    method: str,
    endpoint: str,
    parsed: object,
) -> SandboxApiError:
    status = response.status_code
    message = _extract_error_message(response, parsed)
    args = {
        "status": status,
        "message": message,
        "endpoint": f"{method.upper()} {endpoint}",
        "response_body": parsed,
        "request_id": _request_id(response),
    }

    if status in (401, 403):
        return AuthError(**args)
    if status in (400, 422):
        return ValidationError(**args)
    if status == 404:
        return NotFoundError(**args)
    if status == 429:
        return RateLimitError(**args, retry_after_seconds=_retry_after_seconds(response))
    return SandboxApiError(**args)


class HttpTransport:
    """Low-level HTTP layer used by all resources."""

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        timeout_ms: int = DEFAULT_TIMEOUT_MS,
        retry: RetryOptions | None = None,
        session: requests.Session | None = None,
    ) -> None:
        """Create a transport configured for one API key and base URL."""
        self._base_url = base_url
        self._api_key = api_key
        self._timeout_ms = timeout_ms
        self._retry = _normalize_retry_config(retry)
        self._session = session or requests.Session()

    def request_json(
        self,
        *,
        endpoint: str,
        method: str,
        query: Mapping[str, object] | None = None,
        body: object | None = None,
        headers: Mapping[str, str] | None = None,
        options: RequestOptions | None = None,
    ) -> Any:
        """Send a JSON request and return unwrapped `data` (or raw body when no envelope)."""
        response = self._request(
            endpoint=endpoint,
            method=method,
            query=query,
            json=body,
            headers=headers,
            options=options,
            stream=False,
            body_for_retry=body,
        )

        if response.status_code == 204:
            return None

        parsed: object
        try:
            parsed = response.json()
        except ValueError:
            parsed = response.text

        if not response.ok:
            raise _build_api_error(response, method=method, endpoint=endpoint, parsed=parsed)

        if isinstance(parsed, dict) and "message" in parsed:
            if "data" in parsed:
                return parsed["data"]
            return parsed

        return parsed

    def request_binary(
        self,
        *,
        endpoint: str,
        method: str,
        body: object,
        headers: Mapping[str, str] | None = None,
        options: RequestOptions | None = None,
    ) -> None:
        """Send a binary upload request and return when it succeeds."""
        response = self._request(
            endpoint=endpoint,
            method=method,
            data=body,
            headers=headers,
            options=options,
            stream=False,
            body_for_retry=body,
        )

        if response.ok or response.status_code == 204:
            return

        parsed: object
        try:
            parsed = response.json()
        except ValueError:
            parsed = response.text

        raise _build_api_error(response, method=method, endpoint=endpoint, parsed=parsed)

    def request_stream(
        self,
        *,
        endpoint: str,
        method: str,
        query: Mapping[str, object] | None = None,
        options: RequestOptions | None = None,
    ) -> requests.Response:
        """Request a streamed/binary response (used for file downloads)."""
        response = self._request(
            endpoint=endpoint,
            method=method,
            query=query,
            options=options,
            stream=True,
            body_for_retry=None,
        )

        if response.ok:
            return response

        parsed: object
        try:
            parsed = response.json()
        except ValueError:
            parsed = response.text

        raise _build_api_error(response, method=method, endpoint=endpoint, parsed=parsed)

    def request_sse(
        self,
        *,
        endpoint: str,
        method: str,
        body: object,
        options: RequestOptions | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> requests.Response:
        """Request an SSE stream for JSON-body endpoints like exec/code with stream=true."""
        request_headers: dict[str, str] = {"content-type": "application/json"}
        if headers:
            request_headers.update(headers)

        response = self._request(
            endpoint=endpoint,
            method=method,
            json=body,
            headers=request_headers,
            options=options,
            stream=True,
            body_for_retry=body,
        )

        if response.ok:
            return response

        parsed: object
        try:
            parsed = response.json()
        except ValueError:
            parsed = response.text

        raise _build_api_error(response, method=method, endpoint=endpoint, parsed=parsed)

    def _request(
        self,
        *,
        endpoint: str,
        method: str,
        query: Mapping[str, object] | None = None,
        json: object | None = None,
        data: object | None = None,
        headers: Mapping[str, str] | None = None,
        options: RequestOptions | None = None,
        stream: bool = False,
        body_for_retry: object | None = None,
    ) -> requests.Response:
        timeout_s = _to_timeout_seconds(options.timeout_ms if options else None, self._timeout_ms)

        retry_config = _merge_retry_config(self._retry, options.retry if options else None)
        method_name = method.upper()
        can_retry_method = method_name in retry_config.retry_methods or (
            method_name == "POST" and bool(options and options.idempotency_key)
        )
        can_retry_body = _can_retry_body(body_for_retry)

        request_headers: MutableMapping[str, str] = {
            "x-brimble-key": self._api_key,
            "source": "sdk-package",
            "source-version": SDK_PACKAGE_VERSION,
        }
        if options and options.idempotency_key:
            request_headers["idempotency-key"] = options.idempotency_key

        if headers:
            request_headers.update(headers)

        last_error: Exception | None = None

        for attempt in range(1, retry_config.max_attempts + 1):
            try:
                response = self._session.request(
                    method=method_name,
                    url=_build_url(self._base_url, endpoint, query),
                    headers=request_headers,
                    json=json,
                    data=data,
                    timeout=timeout_s,
                    stream=stream,
                )
            except requests.RequestException as error:
                last_error = error
                should_retry = (
                    attempt < retry_config.max_attempts and can_retry_method and can_retry_body
                )
                if not should_retry:
                    raise

                time.sleep(_compute_delay_ms(attempt, retry_config.base_delay_ms, retry_config.max_delay_ms) / 1000)
                continue

            should_retry_status = (
                attempt < retry_config.max_attempts
                and can_retry_method
                and can_retry_body
                and response.status_code in retry_config.retry_statuses
            )

            if should_retry_status:
                response.close()
                time.sleep(_compute_delay_ms(attempt, retry_config.base_delay_ms, retry_config.max_delay_ms) / 1000)
                continue

            return response

        if last_error is not None:
            raise last_error

        raise RuntimeError("HTTP request failed before receiving a response.")
