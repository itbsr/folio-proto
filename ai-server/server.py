import asyncio
import base64
import json
import os
import threading
import time
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request, Security
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from inference.pipeline import DewarpPipeline

load_dotenv()

API_KEY = os.getenv("API_KEY", "")
if not API_KEY:
    raise RuntimeError("API_KEY environment variable is required")

WC_MODEL_PATH = os.getenv("WC_MODEL_PATH", "./weights/unetnc_doc3d_final.pkl")
BM_MODEL_PATH = os.getenv("BM_MODEL_PATH", "./weights/dnetccnl_doc3d_final.pkl")

_pipeline: DewarpPipeline | None = None
security = HTTPBearer(auto_error=False)

# ── Per-job progress state ─────────────────────────────────────────────────
# Design A: the upload (POST /upload/{job}) and the progress stream
# (GET /progress/{job}) arrive as two separate requests. We correlate them in
# this stateful process via `job` — no Cloudflare Durable Object needed.
_job_queues: dict[str, "asyncio.Queue[dict]"] = {}
_job_buffers: dict[str, bytearray] = {}
_job_started: dict[str, float] = {}
_JOB_TTL_SEC = 300


def _job_queue(job: str) -> "asyncio.Queue[dict]":
    q = _job_queues.get(job)
    if q is None:
        q = asyncio.Queue()
        _job_queues[job] = q
        _job_started[job] = time.monotonic()
    return q


def _cleanup_job(job: str) -> None:
    _job_queues.pop(job, None)
    _job_buffers.pop(job, None)
    _job_started.pop(job, None)


async def _sweep_jobs() -> None:
    """Drop abandoned jobs (progress stream never connected) so we don't leak."""
    while True:
        await asyncio.sleep(60)
        now = time.monotonic()
        for job, started in list(_job_started.items()):
            if now - started > _JOB_TTL_SEC:
                _cleanup_job(job)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _pipeline
    _pipeline = DewarpPipeline(WC_MODEL_PATH, BM_MODEL_PATH)
    print(f"Models loaded: wc={WC_MODEL_PATH}, bm={BM_MODEL_PATH}")
    sweeper = asyncio.create_task(_sweep_jobs())
    try:
        yield
    finally:
        sweeper.cancel()


app = FastAPI(title="DewarpNet API", lifespan=lifespan)


def verify_api_key(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> None:
    if not credentials or credentials.credentials != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")


class ProcessRequest(BaseModel):
    image: str  # base64-encoded image (JPEG / PNG / HEIC / HEIF — anything OpenCV or PIL can read)


class ProcessResponse(BaseModel):
    result_image: str  # base64-encoded dewarped image (PNG)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "model_loaded": _pipeline is not None}


@app.post("/process", response_model=ProcessResponse)
def process(
    req: ProcessRequest,
    _: None = Depends(verify_api_key),
) -> ProcessResponse:
    try:
        image_bytes = base64.b64decode(req.image)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image data")

    try:
        result_bytes = _pipeline.process(image_bytes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing failed: {e}")

    return ProcessResponse(result_image=base64.b64encode(result_bytes).decode())


@app.post("/process-stream")
async def process_stream(
    req: ProcessRequest,
    _: None = Depends(verify_api_key),
) -> StreamingResponse:
    try:
        image_bytes = base64.b64decode(req.image)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image data")

    queue: asyncio.Queue[str | None] = asyncio.Queue()
    loop = asyncio.get_event_loop()

    def run() -> None:
        def on_progress(pct: int, stage: str) -> None:
            asyncio.run_coroutine_threadsafe(
                queue.put(f"data: {json.dumps({'progress': pct, 'stage': stage})}\n\n"),
                loop,
            )

        try:
            result_bytes = _pipeline.process_with_progress(image_bytes, on_progress)
            result_b64 = base64.b64encode(result_bytes).decode()
            asyncio.run_coroutine_threadsafe(
                queue.put(f"data: {json.dumps({'progress': 100, 'stage': 'done', 'result': result_b64})}\n\n"),
                loop,
            )
        except ValueError as e:
            asyncio.run_coroutine_threadsafe(
                queue.put(f"data: {json.dumps({'error': str(e)})}\n\n"),
                loop,
            )
        except Exception as e:
            asyncio.run_coroutine_threadsafe(
                queue.put(f"data: {json.dumps({'error': f'Processing failed: {e}'})}\n\n"),
                loop,
            )
        finally:
            asyncio.run_coroutine_threadsafe(queue.put(None), loop)

    threading.Thread(target=run, daemon=True).start()

    async def generate():
        while True:
            item = await queue.get()
            if item is None:
                break
            yield item

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Design A: split upload + progress, correlated by {job} ──────────────────


@app.post("/upload/{job}")
async def upload(
    job: str,
    request: Request,
    _: None = Depends(verify_api_key),
) -> StreamingResponse:
    """Receive the image (stream), run inference, and return the result on THIS
    response. Progress is reported on the job's SSE stream:
      ``received`` (② 上り受信) → ``infer`` (③ 推論) → ``result_sent`` (③' 下り送信) → ``done``.
    The ① 上り送信 / ④ 下り受信 bars are measured client-side on the XHR itself.
    """
    total = int(request.headers.get("content-length") or 0)
    q = _job_queue(job)
    buf = _job_buffers.setdefault(job, bytearray())

    # ② 上り受信: count bytes as they arrive from the Worker.
    received = 0
    last_pct = -1
    async for chunk in request.stream():
        if not chunk:
            continue
        buf += chunk
        received += len(chunk)
        _job_started[job] = time.monotonic()  # keep-alive against the sweeper
        pct = int(received / total * 100) if total else 0
        if pct != last_pct:
            last_pct = pct
            await q.put({"type": "received", "pct": pct})

    try:
        payload = json.loads(bytes(buf).decode("utf-8"))
        image_bytes = base64.b64decode(payload["image"])
    except Exception:
        _job_buffers.pop(job, None)
        await q.put({"type": "error", "message": "Invalid upload payload"})
        raise HTTPException(status_code=400, detail="Invalid upload payload")
    _job_buffers.pop(job, None)  # raw bytes no longer needed; image captured below

    # ③ 推論: run in a worker thread so the event loop stays free to deliver SSE.
    loop = asyncio.get_event_loop()

    def on_progress(pct: int, stage: str) -> None:
        loop.call_soon_threadsafe(q.put_nowait, {"type": "infer", "pct": pct, "step": stage})

    try:
        result_bytes = await loop.run_in_executor(
            None, _pipeline.process_with_progress, image_bytes, on_progress
        )
    except ValueError as e:
        await q.put({"type": "error", "message": str(e)})
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        await q.put({"type": "error", "message": f"Processing failed: {e}"})
        raise HTTPException(status_code=500, detail="Processing failed")

    # Result goes back as THIS response body (base64 text, fixed Content-Length so
    # the client gets ④ download progress). ③' 下り送信 is reported as we stream out.
    data = base64.b64encode(result_bytes)  # ASCII bytes
    total_out = len(data)

    async def stream_result():
        chunk_size = 64 * 1024
        sent = 0
        last = -1
        for i in range(0, total_out, chunk_size):
            chunk = data[i : i + chunk_size]
            sent += len(chunk)
            pct = int(sent / total_out * 100) if total_out else 100
            if pct != last:
                last = pct
                q.put_nowait({"type": "result_sent", "pct": pct})
            yield chunk
        q.put_nowait({"type": "done"})

    return StreamingResponse(
        stream_result(),
        media_type="text/plain; charset=utf-8",
        headers={
            "Content-Length": str(total_out),
            "X-Result-Bytes": str(total_out),  # robust total for ④ even if CL is dropped
            "Cache-Control": "no-cache, no-transform",  # no-transform: keep CL (no proxy gzip)
        },
    )


@app.get("/progress/{job}")
async def progress(
    job: str,
    _: None = Depends(verify_api_key),
) -> StreamingResponse:
    """SSE stream carrying ``received`` → ``infer`` → ``done``/``error`` for one job."""
    q = _job_queue(job)

    async def generate():
        try:
            while True:
                ev = await q.get()
                yield f"data: {json.dumps(ev)}\n\n"
                if ev.get("type") in ("done", "error"):
                    break
        finally:
            _cleanup_job(job)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
