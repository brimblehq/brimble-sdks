from __future__ import annotations

import os
import time

import pytest

from brimble_sandbox import Sandbox
from brimble_sandbox.constants import MIN_VOLUME_SIZE_GB
from brimble_sandbox.enums import CodeLanguage, VolumeType


def _client() -> Sandbox:
    api_key = os.getenv("BRIMBLE_SANDBOX_KEY")
    if not api_key:
        pytest.skip("BRIMBLE_SANDBOX_KEY is not set")
    return Sandbox(api_key=api_key)


def _choose_template_name(templates: list[dict[str, object]]) -> str:
    for template in templates:
        name = template.get("name")
        if name == "node-22":
            return "node-22"

    first = templates[0].get("name")
    if not isinstance(first, str) or not first:
        raise AssertionError("Template list is empty or malformed")
    return first


def test_discovery_endpoints() -> None:
    client = _client()

    templates = client.sandboxes.list_templates()
    assert isinstance(templates, list)
    assert len(templates) > 0

    selected_name = _choose_template_name(templates)
    template = client.sandboxes.get_template(selected_name)
    assert template is not None
    assert template["name"] == selected_name

    regions = client.sandboxes.list_regions()
    assert len(regions["regions"]) > 0

    page = client.sandboxes.list({"page": 1, "limit": 15})
    assert page["currentPage"] == 1
    assert isinstance(page["data"], list)


def test_volume_lifecycle() -> None:
    client = _client()
    regions = client.sandboxes.list_regions()
    region_id = regions["regions"][0]["id"]

    volume = client.volumes.create(
        {
            "name": f"py-sdk-int-{int(time.time())}",
            "sizeGB": MIN_VOLUME_SIZE_GB,
            "region": region_id,
            "type": VolumeType.SANDBOX,
        }
    )

    try:
        assert volume["type"] == VolumeType.SANDBOX
        fetched = client.volumes.get(str(volume["id"]))
        assert fetched["id"] == volume["id"]

        seen = False
        for item in client.volumes.iterate({"limit": 15}):
            if item["id"] == volume["id"]:
                seen = True
                break
        assert seen
    finally:
        client.volumes.delete(str(volume["id"]))


@pytest.mark.skipif(os.getenv("BRIMBLE_SANDBOX_RUN_PROVISIONER_TESTS") != "1", reason="Provisioner-dependent")
def test_runtime_snapshot_flow() -> None:
    client = _client()

    templates = client.sandboxes.list_templates()
    template_name = _choose_template_name(templates)

    sandbox = client.sandboxes.create(
        {
            "template": template_name,
            "persistent": True,
            "persistentDiskGB": MIN_VOLUME_SIZE_GB,
        }
    )

    try:
        sandbox.wait_until_ready(timeout_ms=180_000, poll_interval_ms=2_000)

        result = sandbox.exec({"cmd": "echo py-sdk-test"})
        assert result["exit_code"] == 0
        assert "py-sdk-test" in result["stdout"]

        code = sandbox.run_code({"language": CodeLanguage.NODE, "code": 'console.log("x")'})
        assert code["exit_code"] == 0

        sandbox.put_file("tmp/py-sdk-test.txt", b"hello")
        data = sandbox.get_file("tmp/py-sdk-test.txt").content.decode("utf-8")
        assert "hello" in data

        batch = sandbox.put_files(
            [
                {"path": "/tmp/py-batch-a.txt", "body": "batch-a"},
                {"path": "/tmp/py-batch-b.txt", "body": b"batch-b"},
            ]
        )
        assert batch["failed"] == 0
        assert len(batch["results"]) == 2

        batch_data = sandbox.get_file("tmp/py-batch-a.txt").content.decode("utf-8")
        assert "batch-a" in batch_data

        stats = sandbox.stats({"hoursAgo": 1})
        assert stats["replicaCount"] >= 0

        snapshot = sandbox.create_snapshot({"name": f"py-snap-{int(time.time())}"})
        snapshots = sandbox.list_snapshots({"page": 1, "limit": 15})
        assert any(item["id"] == snapshot["id"] for item in snapshots["data"])

        try:
            client.snapshots.delete(str(snapshot["id"]))
        except Exception:
            pass
    finally:
        try:
            sandbox.destroy()
        except Exception:
            pass
