import asyncio
import base64
import json
import os
import threading
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Security
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _pipeline
    _pipeline = DewarpPipeline(WC_MODEL_PATH, BM_MODEL_PATH)
    print(f"Models loaded: wc={WC_MODEL_PATH}, bm={BM_MODEL_PATH}")
    yield


app = FastAPI(title="DewarpNet API", lifespan=lifespan)


def verify_api_key(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> None:
    if not credentials or credentials.credentials != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")


class ProcessRequest(BaseModel):
    image: str  # base64-encoded image (JPEG / PNG)


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
