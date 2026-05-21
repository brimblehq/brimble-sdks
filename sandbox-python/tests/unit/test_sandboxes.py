from __future__ import annotations

from typing import Any

from brimble_sandbox import Sandbox


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
