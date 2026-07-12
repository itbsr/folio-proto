"""Shared pytest setup for the ai-server test suite.

server.py imports ``inference.pipeline`` at module import time, which pulls in
torch — and torch is intentionally NOT in requirements.txt (it is installed in
the Docker image only). To make the API testable without the model runtime we
insert a stub module into ``sys.modules["inference.pipeline"]`` BEFORE server
is imported. Production behaviour is unchanged: the real module wins whenever
torch is available because nothing here runs outside pytest.
"""

import os
import sys
import types
from pathlib import Path

import pytest

# Make `inference` and `server` importable when pytest runs from anywhere.
AI_SERVER_DIR = Path(__file__).resolve().parents[1]
if str(AI_SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(AI_SERVER_DIR))

# server.py refuses to import without an API key. Set it before any import of
# server. load_dotenv() does not override pre-existing environment variables,
# so this value also wins over a local ai-server/.env.
TEST_API_KEY = "test-api-key"
os.environ["API_KEY"] = TEST_API_KEY

# Deterministic fake result so tests can assert the exact response payload.
FAKE_RESULT_BYTES = b"fake-dewarped-png-bytes"


class FakeDewarpPipeline:
    """Stands in for inference.pipeline.DewarpPipeline (torch-free)."""

    def __init__(self, wc_model_path: str, bm_model_path: str) -> None:
        self.wc_model_path = wc_model_path
        self.bm_model_path = bm_model_path

    def process(self, image_bytes: bytes) -> bytes:
        if not image_bytes:
            raise ValueError("Cannot decode image — unsupported format or corrupt data")
        return FAKE_RESULT_BYTES

    def process_with_progress(self, image_bytes, on_progress) -> bytes:
        on_progress(5, "decode")
        on_progress(95, "encode")
        return self.process(image_bytes)


def _install_pipeline_stub() -> None:
    stub = types.ModuleType("inference.pipeline")
    stub.DewarpPipeline = FakeDewarpPipeline
    sys.modules["inference.pipeline"] = stub
    # Keep `import inference; inference.pipeline` consistent with the stub.
    import inference

    inference.pipeline = stub


_install_pipeline_stub()


@pytest.fixture()
def client():
    """TestClient with the app lifespan running (loads the fake pipeline)."""
    from fastapi.testclient import TestClient

    import server

    with TestClient(server.app) as c:
        yield c
