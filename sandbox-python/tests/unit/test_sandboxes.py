from __future__ import annotations

from typing import Any

import pytest

from brimble_sandbox import Sandbox
from brimble_sandbox.enums import SandboxEgressMode


def test_list_templates_handles_wrapped_payload() -> None:
    client = Sandbox(api_key="test-key")

    def fake_request_json(**_: Any) -> object:
        return {
            "templates": [
                {
                    "name": "node-22",
                    "display_name": "Node.js 22",
                    "description": "Node runtime",
                }
            ]
        }

    client.sandboxes._transport.request_json = fake_request_json  # type: ignore[assignment]

    templates = client.sandboxes.list_templates()
    assert len(templates) == 1
    assert templates[0]["name"] == "node-22"


def test_get_template_finds_template() -> None:
    client = Sandbox(api_key="test-key")

    def fake_request_json(**_: Any) -> object:
        return {
            "templates": [
                {
                    "name": "python-3.12",
                    "display_name": "Python 3.12",
                    "description": "Python runtime",
                }
            ]
        }

    client.sandboxes._transport.request_json = fake_request_json  # type: ignore[assignment]

    template = client.sandboxes.get_template("python-3.12")
    assert template is not None
    assert template["name"] == "python-3.12"


def test_scoped_destroy_deletes_by_id() -> None:
    client = Sandbox(api_key="test-key")
    captured: dict[str, object] = {}

    def fake_request_json(**kwargs: Any) -> object:
        nonlocal captured
        captured = kwargs
        return None

    client.sandboxes._transport.request_json = fake_request_json  # type: ignore[assignment]

    client.sandboxes.use("sandbox-123").destroy()

    assert captured["endpoint"] == "/sandboxes/sandbox-123"
    assert captured["method"] == "DELETE"


def test_create_forwards_mount_path() -> None:
    client = Sandbox(api_key="test-key")
    captured: dict[str, object] = {}

    def fake_request_json(**kwargs: Any) -> object:
        nonlocal captured
        captured = kwargs
        return {
            "id": "sandbox-1",
            "name": "mount-test",
            "template": "node-22",
            "status": "starting",
            "created_at": "2026-01-01T00:00:00.000Z",
            "expires_at": "2026-01-01T00:30:00.000Z",
        }

    client.sandboxes._transport.request_json = fake_request_json  # type: ignore[assignment]

    sandbox = client.sandboxes.create(
        {
            "template": "node-22",
            "region": "region-1",
            "persistent": True,
            "persistentDiskGB": 20,
            "mountPath": "/var/www/html",
        }
    )

    assert sandbox.id == "sandbox-1"
    body = captured["body"]
    assert isinstance(body, dict)
    assert body["mountPath"] == "/var/www/html"


def test_mount_path_requires_persistent_or_volume_id() -> None:
    client = Sandbox(api_key="test-key")

    with pytest.raises(ValueError, match="mountPath requires either `persistent: true` or `volumeId`"):
        client.sandboxes.create(
            {
                "template": "node-22",
                "region": "region-1",
                "mountPath": "/workspace",
            }
        )


def test_create_defaults_mount_path_when_using_persistent_storage() -> None:
    client = Sandbox(api_key="test-key")
    captured: dict[str, object] = {}

    def fake_request_json(**kwargs: Any) -> object:
        nonlocal captured
        captured = kwargs
        return {
            "id": "sandbox-1",
            "name": "mount-default",
            "template": "node-22",
            "status": "starting",
            "created_at": "2026-01-01T00:00:00.000Z",
            "expires_at": "2026-01-01T00:30:00.000Z",
        }

    client.sandboxes._transport.request_json = fake_request_json  # type: ignore[assignment]

    client.sandboxes.create(
        {
            "template": "node-22",
            "region": "region-1",
            "persistent": True,
            "persistentDiskGB": 20,
        }
    )

    body = captured["body"]
    assert isinstance(body, dict)
    assert body["mountPath"] == "/workspace"


def test_mount_path_rejects_invalid_pattern() -> None:
    client = Sandbox(api_key="test-key")

    with pytest.raises(ValueError, match="mountPath must match"):
        client.sandboxes.create(
            {
                "template": "node-22",
                "region": "region-1",
                "persistent": True,
                "persistentDiskGB": 20,
                "mountPath": "/workspace?bad",
            }
        )


def test_create_infers_region_from_attached_volume_when_omitted() -> None:
    client = Sandbox(api_key="test-key")
    captured: dict[str, object] = {}

    def fake_request_json(**kwargs: Any) -> object:
        endpoint = kwargs.get("endpoint")
        method = kwargs.get("method")

        if endpoint == "/volumes/volume-123" and method == "GET":
            return {
                "id": "volume-123",
                "name": "cache",
                "type": "sandbox",
                "team": None,
                "csi_volume_id": None,
                "size": 20,
                "region": {
                    "id": "region-from-volume",
                    "name": "Test",
                    "country": "US",
                    "continent": "NA",
                    "provider": "test",
                    "is_paid": False,
                },
                "attached_sandbox_id": None,
                "attached_project_id": None,
                "last_attached_at": None,
                "created_at": None,
                "updated_at": None,
            }

        if endpoint == "/sandboxes" and method == "POST":
            nonlocal captured
            captured = kwargs
            return {
                "id": "sandbox-1",
                "name": "attach-test",
                "template": "node-22",
                "status": "starting",
                "created_at": "2026-01-01T00:00:00.000Z",
                "expires_at": "2026-01-01T00:30:00.000Z",
            }

        raise AssertionError(f"unexpected request: {method} {endpoint}")

    client.sandboxes._transport.request_json = fake_request_json  # type: ignore[assignment]

    client.sandboxes.create(
        {
            "template": "node-22",
            "volumeId": "volume-123",
        }
    )

    body = captured["body"]
    assert isinstance(body, dict)
    assert body["region"] == "region-from-volume"
    assert body["volumeId"] == "volume-123"
    assert body["mountPath"] == "/workspace"


def test_update_egress_sends_put_with_mode_and_allow() -> None:
    client = Sandbox(api_key="test-key")
    captured: dict[str, object] = {}

    def fake_request_json(**kwargs: Any) -> object:
        nonlocal captured
        captured = kwargs
        return {
            "id": "sandbox-123",
            "egress": {"mode": "restricted", "allow": ["1.1.1.1"]},
            "network_updated": True,
        }

    client.sandboxes._transport.request_json = fake_request_json  # type: ignore[assignment]

    result = client.sandboxes.update_egress(
        "sandbox-123",
        {"mode": SandboxEgressMode.RESTRICTED, "allow": ["1.1.1.1"]},
    )

    assert captured["endpoint"] == "/sandboxes/sandbox-123/egress"
    assert captured["method"] == "PUT"
    body = captured["body"]
    assert isinstance(body, dict)
    assert body["mode"] == "restricted"
    assert body["allow"] == ["1.1.1.1"]
    assert result["network_updated"] is True
