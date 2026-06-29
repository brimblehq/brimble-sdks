#!/usr/bin/env python3
"""Live streaming test against sandbox.brimble.io using the local package."""

from __future__ import annotations

import os
import sys

from brimble_sandbox import Sandbox
from brimble_sandbox.enums import CodeLanguage

api_key = os.environ.get("BRIMBLE_SANDBOX_KEY")
if not api_key:
    print("Set BRIMBLE_SANDBOX_KEY")
    sys.exit(1)

client = Sandbox(api_key=api_key)
failed = False

print("Creating sandbox...")
sandbox = client.sandboxes.create_ready({"template": "node-22"})
print(f"Sandbox ready: {sandbox.id}\n")

try:
    print("1) Buffered exec")
    buffered = sandbox.exec({"cmd": "echo hello-buffered"})
    if buffered["exit_code"] == 0 and "hello-buffered" in buffered["stdout"]:
        print("PASS  buffered exec")
    else:
        failed = True
        print("FAIL  buffered exec", buffered)

    print("\n2) Streaming exec (for log in output)")
    output = sandbox.exec_stream({"cmd": "for i in 1 2 3; do echo line-$i; sleep 0.15; done"})
    logs = list(output)
    result = output.result()
    for log in logs:
        print(f"   [{log['stream']}] {log['data']!r}")
    if logs and result["exit_code"] == 0 and "line-1" in result["stdout"]:
        print("PASS  streaming exec")
    else:
        failed = True
        print("FAIL  streaming exec", logs, result)

    print("\n3) Callback exec")
    chunks: list[str] = []
    callback = sandbox.exec(
        {"cmd": "printf callback-ok"},
        on_stdout=chunks.append,
    )
    print(f"   [callback] {chunks!r}")
    if chunks and "callback-ok" in callback["stdout"]:
        print("PASS  callback exec")
    else:
        failed = True
        print("FAIL  callback exec", chunks, callback)

    print("\n4) Streaming run_code")
    code_output = sandbox.run_code_stream(
        {
            "language": CodeLanguage.NODE,
            "code": "for (let i = 1; i <= 2; i++) console.log(`code-${i}`)",
        }
    )
    code_logs = list(code_output)
    code_result = code_output.result()
    if code_logs and code_result["exit_code"] == 0 and "code-1" in code_result["stdout"]:
        print("PASS  streaming run_code")
    else:
        failed = True
        print("FAIL  streaming run_code", code_logs, code_result)

    print("\n5) File upload + streamed download")
    sandbox.put_file("tmp/live-python-stream.txt", b"local-python-stream-ok")
    file_stream = sandbox.get_file("tmp/live-python-stream.txt")
    file_contents = b"".join(file_stream).decode("utf-8")
    file_stream.close()
    if "local-python-stream-ok" in file_contents:
        print("PASS  file stream download")
    else:
        failed = True
        print("FAIL  file stream download", file_contents)

finally:
    print("\nDestroying sandbox...")
    sandbox.destroy()
    print("Sandbox destroyed.")

if failed:
    sys.exit(1)

print("\nAll Python live streaming checks passed.")
