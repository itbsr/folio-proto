"""API-level tests for server.py, run against the stubbed pipeline.

conftest.py replaces ``inference.pipeline`` with a torch-free fake before
server is imported, so these tests exercise auth and request handling only —
never the DewarpNet model. SSE / job-sweeper timing (#38) is out of scope.
"""

import base64

# pytest (importmode=prepend, no __init__.py) loads conftest.py as the
# top-level module "conftest", so this resolves to the already-loaded module.
from conftest import FAKE_RESULT_BYTES, TEST_API_KEY

VALID_PAYLOAD = {"image": base64.b64encode(b"pretend-jpeg-bytes").decode()}


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── Bearer auth ─────────────────────────────────────────────────────────────


def test_process_without_token_is_rejected(client):
    res = client.post("/process", json=VALID_PAYLOAD)
    assert res.status_code in (401, 403)


def test_process_with_wrong_token_is_401(client):
    res = client.post("/process", json=VALID_PAYLOAD, headers=auth("wrong-key"))
    assert res.status_code == 401


def test_health_needs_no_token(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "model_loaded": True}


# ── Happy path (fake pipeline) ──────────────────────────────────────────────


def test_process_happy_path_returns_fake_result(client):
    res = client.post("/process", json=VALID_PAYLOAD, headers=auth(TEST_API_KEY))
    assert res.status_code == 200
    result = base64.b64decode(res.json()["result_image"])
    assert result == FAKE_RESULT_BYTES


def test_process_rejects_invalid_base64(client):
    res = client.post(
        "/process", json={"image": "!!not-base64!!"}, headers=auth(TEST_API_KEY)
    )
    assert res.status_code == 400
