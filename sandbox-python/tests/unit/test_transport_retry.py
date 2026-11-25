from __future__ import annotations

import io

import pytest
import requests

from brimble_sandbox.transport import HttpTransport, RequestOptions, RetryOptions


class FlakySession(requests.Session):
    def __init__(self, failures: list[Exception | int]) -> None:
        super().__init__()
        self.failures = failures
        self.calls: list[dict[str, object]] = []

    def request(self, method, url, **kwargs):  # type: ignore[override]
        self.calls.append({"method": method, "json": kwargs.get("json"), "headers": dict(kwargs.get("headers") or {})})
        outcome = self.failures.pop(0) if self.failures else 200
        if isinstance(outcome, Exception):
            raise outcome
        response = requests.Response()
        response.status_code = outcome
        response._content = b'{"message":"ok","data":{"id":"sbx_1"}}'
        response.raw = io.BytesIO()
        return response


def transport(session: FlakySession) -> HttpTransport:
    return HttpTransport(
        base_url="https://api.example.test",
        api_key="test-key",
        retry=RetryOptions(max_attempts=3, base_delay_ms=0, max_delay_ms=0),
        session=session,
    )


def test_keyed_json_post_retries_after_a_timeout() -> None:
    session = FlakySession([requests.exceptions.ReadTimeout("timed out")])

    result = transport(session).request_json(
        endpoint="/sandboxes",
        method="POST",
        body={"template": "node"},
        options=RequestOptions(idempotency_key="create-1"),
    )

    assert result == {"id": "sbx_1"}
    assert len(session.calls) == 2
    assert all(call["json"] == {"template": "node"} for call in session.calls)
    assert all(call["headers"]["idempotency-key"] == "create-1" for call in session.calls)


def test_keyed_json_post_retries_on_a_retryable_status() -> None:
    session = FlakySession([503])

    transport(session).request_json(
        endpoint="/sandboxes",
        method="POST",
        body={"template": "node"},
        options=RequestOptions(idempotency_key="create-1"),
    )

    assert len(session.calls) == 2


def test_json_post_without_a_key_is_not_retried() -> None:
    session = FlakySession([requests.exceptions.ReadTimeout("timed out")])

    with pytest.raises(requests.exceptions.ReadTimeout):
        transport(session).request_json(endpoint="/sandboxes", method="POST", body={"template": "node"})

    assert len(session.calls) == 1


def test_streamed_upload_body_is_not_retried() -> None:
    session = FlakySession([requests.exceptions.ReadTimeout("timed out")])

    with pytest.raises(requests.exceptions.ReadTimeout):
        transport(session).request_binary(
            endpoint="/sandboxes/sbx_1/files/data.bin",
            method="PUT",
            body=io.BytesIO(b"payload"),
            options=RequestOptions(idempotency_key="upload-1"),
        )

    assert len(session.calls) == 1
