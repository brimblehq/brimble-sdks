from __future__ import annotations

import io
from typing import Any

from brimble_sandbox import Sandbox
from brimble_sandbox.enums import CodeLanguage
from brimble_sandbox.streaming import ExecStream


def test_exec_forwards_env_payload() -> None:
    client = Sandbox(api_key="test-key")
    captured: dict[str, object] = {}

    def fake_request_json(**kwargs: Any) -> object:
        nonlocal captured
        captured = dict(kwargs)
        return {
            "stdout": "ok\n",
            "stderr": "",
            "exit_code": 0,
            "duration_ms": 5,
        }

    client.sandboxes._transport.request_json = fake_request_json  # type: ignore[assignment]

    result = client.sandboxes.use("sandbox-1").exec(
        {
            "cmd": "printenv HELLO",
            "env": {"HELLO": "WORLD"},
        }
    )

    assert result["exit_code"] == 0
    assert captured["endpoint"] == "/sandboxes/sandbox-1/exec"
    assert captured["method"] == "POST"
    assert captured["body"] == {"cmd": "printenv HELLO", "env": {"HELLO": "WORLD"}}


def test_run_code_forwards_env_payload() -> None:
    client = Sandbox(api_key="test-key")
    captured: dict[str, object] = {}

    def fake_request_json(**kwargs: Any) -> object:
        nonlocal captured
        captured = dict(kwargs)
        return {
            "stdout": "WORLD\n",
            "stderr": "",
            "exit_code": 0,
            "duration_ms": 7,
        }

    client.sandboxes._transport.request_json = fake_request_json  # type: ignore[assignment]

    result = client.sandboxes.use("sandbox-1").run_code(
        {
            "language": CodeLanguage.PYTHON,
            "code": "import os; print(os.getenv('HELLO'))",
            "env": {"HELLO": "WORLD"},
        }
    )

    assert result["exit_code"] == 0
    assert captured["endpoint"] == "/sandboxes/sandbox-1/code"
    assert captured["method"] == "POST"
    assert captured["body"] == {
        "language": CodeLanguage.PYTHON,
        "code": "import os; print(os.getenv('HELLO'))",
        "env": {"HELLO": "WORLD"},
    }


def test_exec_stream_returns_exec_stream() -> None:
    client = Sandbox(api_key="test-key")
    captured: dict[str, object] = {}

    class _FakeResponse:
        def __init__(self) -> None:
            self.raw = io.BytesIO(
                b'data: {"type":"stdout","data":"live\\n"}\n\n'
                b'data: {"type":"done","exit_code":0,"duration_ms":2}\n\n'
            )

        def close(self) -> None:
            self.raw.close()

    def fake_request_sse(**kwargs: object) -> _FakeResponse:
        nonlocal captured
        captured = dict(kwargs)
        return _FakeResponse()

    client.sandboxes._transport.request_sse = fake_request_sse  # type: ignore[assignment]

    output = client.sandboxes.use("sandbox-1").exec_stream({"cmd": "echo live"})

    assert isinstance(output, ExecStream)
    assert captured["body"] == {"cmd": "echo live", "stream": True}
    assert list(output) == [{"stream": "stdout", "data": "live\n"}]


def test_exec_on_stdout_streams_live_output() -> None:
    client = Sandbox(api_key="test-key")

    class _FakeResponse:
        def __init__(self) -> None:
            self.raw = io.BytesIO(
                b'data: {"type":"stdout","data":"chunk\\n"}\n\n'
                b'data: {"type":"done","exit_code":0,"duration_ms":2}\n\n'
            )

        def close(self) -> None:
            self.raw.close()

    client.sandboxes._transport.request_sse = lambda **_kwargs: _FakeResponse()  # type: ignore[assignment]

    chunks: list[str] = []
    result = client.sandboxes.use("sandbox-1").exec(
        {"cmd": "echo chunk"},
        on_stdout=chunks.append,
    )

    assert chunks == ["chunk\n"]
    assert result["stdout"] == "chunk\n"
    assert result["exit_code"] == 0
