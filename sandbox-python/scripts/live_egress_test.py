#!/usr/bin/env python3
"""Live egress test for brimble-sandbox Python SDK."""

from __future__ import annotations

import os
import sys
import time

from brimble_sandbox import Sandbox
from brimble_sandbox.enums import SandboxEgressMode

api_key = os.environ.get("BRIMBLE_SANDBOX_KEY")
if not api_key:
    print("Set BRIMBLE_SANDBOX_KEY to run this script.")
    sys.exit(1)

NETWORK_SWITCH_WAIT_S = 25
PROBE_CMD = "curl -s -o /dev/null -w '%{http_code}' --connect-timeout 5 http://1.1.1.1 || echo 000"


def probe_http(sandbox: Sandbox) -> str:
    result = sandbox.exec({"cmd": PROBE_CMD})
    stdout = str(result.get("stdout", "")).strip()
    digits = "".join(ch for ch in stdout if ch.isdigit())
    return digits[:3] or "000"


def assert_step(label: str, actual: str, expected: str) -> None:
    ok = actual == expected
    print(f"{'PASS' if ok else 'FAIL'} {label}: got {actual}, expected {expected}")
    if not ok:
        raise SystemExit(1)


client = Sandbox(api_key=api_key)

print("Creating sandbox with deny_all egress...")
sandbox = client.sandboxes.create(
    {
        "template": "node-22",
        "egress": {"mode": SandboxEgressMode.DENY_ALL},
    }
)
print(f"Sandbox id: {sandbox.id}")

try:
    sandbox.wait_until_ready(timeout_ms=180_000, poll_interval_ms=2_000)
    print("Sandbox ready.\n")

    assert_step("deny_all blocks outbound", probe_http(sandbox), "000")

    print("\nUpdating egress to restricted (allow 1.1.1.1)...")
    restricted = sandbox.update_egress(
        {"mode": SandboxEgressMode.RESTRICTED, "allow": ["1.1.1.1"]}
    )
    print(
        f"  egress.mode={restricted.get('egress', {}).get('mode')}, "
        f"network_updated={restricted.get('network_updated', False)}"
    )

    time.sleep(NETWORK_SWITCH_WAIT_S)
    assert_step("restricted allows 1.1.1.1", probe_http(sandbox), "301")

    print("\nUpdating egress to open...")
    open_result = sandbox.update_egress({"mode": SandboxEgressMode.OPEN})
    print(
        f"  egress.mode={open_result.get('egress', {}).get('mode')}, "
        f"network_updated={open_result.get('network_updated', False)}"
    )

    if open_result.get("network_updated"):
        time.sleep(NETWORK_SWITCH_WAIT_S)

    assert_step("open allows outbound", probe_http(sandbox), "301")
    print("\nAll egress SDK checks passed.")
finally:
    print("\nDestroying sandbox...")
    try:
        sandbox.destroy()
        print("Sandbox destroyed.")
    except Exception as error:  # noqa: BLE001
        print(f"Cleanup failed: {error}")
