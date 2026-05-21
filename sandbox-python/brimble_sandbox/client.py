"""Top-level Sandbox client."""

from __future__ import annotations

import os

import requests

from .constants import DEFAULT_BASE_URL, DEFAULT_TIMEOUT_MS, SANDBOX_API_KEY_ENV_NAME
from .resources import SandboxesResource, SnapshotsResource, VolumesResource
from .transport import HttpTransport, RetryOptions


class Sandbox:
    """Entry-point client for Brimble Sandbox API resources."""

    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str = DEFAULT_BASE_URL,
        timeout_ms: int = DEFAULT_TIMEOUT_MS,
        retry: RetryOptions | None = None,
        session: requests.Session | None = None,
    ) -> None:
        """Create a client from explicit key or BRIMBLE_SANDBOX_KEY env variable."""
        resolved_api_key = api_key or os.getenv(SANDBOX_API_KEY_ENV_NAME)
        if not resolved_api_key:
            raise ValueError(
                f"Sandbox API key is required. Pass api_key explicitly or set {SANDBOX_API_KEY_ENV_NAME}."
            )

        transport = HttpTransport(
            base_url=base_url,
            api_key=resolved_api_key,
            timeout_ms=timeout_ms,
            retry=retry,
            session=session,
        )

        self.sandboxes = SandboxesResource(transport)
        self.snapshots = SnapshotsResource(transport)
        self.volumes = VolumesResource(transport)
