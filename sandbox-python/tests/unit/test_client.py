from __future__ import annotations

import os

import pytest

from brimble_sandbox import Sandbox
from brimble_sandbox.constants import SANDBOX_API_KEY_ENV_NAME


def test_client_requires_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(SANDBOX_API_KEY_ENV_NAME, raising=False)

    with pytest.raises(ValueError, match="Sandbox API key is required"):
        Sandbox()


def test_client_reads_api_key_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(SANDBOX_API_KEY_ENV_NAME, "env-test-key")

    client = Sandbox()

    assert client is not None


def test_client_prefers_explicit_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(SANDBOX_API_KEY_ENV_NAME, "env-test-key")

    client = Sandbox(api_key="explicit-key")

    assert client is not None
