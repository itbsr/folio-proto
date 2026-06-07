import os
import sys
from typing import Callable

# DewarpNet repo lives two directories above this file (../../DewarpNet).
# Works both in local dev (ai-server/inference/) and Docker (/app/ai-server/inference/).
_DEWARPNET_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "DewarpNet")
)
sys.path.insert(0, _DEWARPNET_ROOT)

import cv2
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

from models import get_model  # noqa: E402  (from DewarpNet)
from utils import convert_state_dict  # noqa: E402  (from DewarpNet)

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


class DewarpPipeline:
    """Two-stage DewarpNet pipeline: WC prediction → BM prediction → unwarp."""

    WC_SIZE = (256, 256)
    BM_SIZE = (128, 128)

    def __init__(self, wc_model_path: str, bm_model_path: str) -> None:
        self.wc_model = self._load(wc_model_path, "unetnc", n_classes=3)
        self.bm_model = self._load(bm_model_path, "dnetccnl", n_classes=2)
        self.htan = nn.Hardtanh(0, 1.0)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _load(path: str, name: str, n_classes: int) -> nn.Module:
        model = get_model(name, n_classes, in_channels=3)
        checkpoint = torch.load(path, map_location=DEVICE)
        state = convert_state_dict(checkpoint["model_state"])
        model.load_state_dict(state)
        model.eval()
        return model.to(DEVICE)

    @staticmethod
    def _decode(image_bytes: bytes) -> np.ndarray:
        arr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Cannot decode image — unsupported format or corrupt data")
        return cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

    @staticmethod
    def _to_tensor(img_rgb: np.ndarray, size: tuple[int, int]) -> torch.Tensor:
        resized = cv2.resize(img_rgb, size)
        # infer.py feeds BGR-channel-order into the model
        arr = resized[:, :, ::-1].astype(float) / 255.0
        arr = arr.transpose(2, 0, 1)
        return torch.from_numpy(np.expand_dims(arr, 0)).float().to(DEVICE)

    @staticmethod
    def _unwarp(imgorg: np.ndarray, bm: torch.Tensor) -> np.ndarray:
        """Apply backward mapping to the original image (mirrors infer.py)."""
        h, w = imgorg.shape[0], imgorg.shape[1]

        bm_np = bm.transpose(1, 2).transpose(2, 3).detach().cpu().numpy()[0]
        bm0 = cv2.resize(cv2.blur(bm_np[:, :, 0], (3, 3)), (w, h))
        bm1 = cv2.resize(cv2.blur(bm_np[:, :, 1], (3, 3)), (w, h))
        bm_t = torch.from_numpy(
            np.expand_dims(np.stack([bm0, bm1], axis=-1), 0)
        ).double()

        img_t = torch.from_numpy(
            np.expand_dims((imgorg.astype(float) / 255.0).transpose(2, 0, 1), 0)
        ).double()

        res = F.grid_sample(input=img_t, grid=bm_t)
        return res[0].numpy().transpose(1, 2, 0)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @torch.no_grad()
    def process(self, image_bytes: bytes) -> bytes:
        imgorg = self._decode(image_bytes)
        img_tensor = self._to_tensor(imgorg, self.WC_SIZE)

        wc_out = self.wc_model(img_tensor)
        pred_wc = self.htan(wc_out)
        bm_input = F.interpolate(pred_wc, self.BM_SIZE)
        bm_out = self.bm_model(bm_input)

        result = self._unwarp(imgorg, bm_out)

        result_bgr = cv2.cvtColor((result * 255).astype(np.uint8), cv2.COLOR_RGB2BGR)
        _, buf = cv2.imencode(".png", result_bgr)
        return buf.tobytes()

    def _run_with_hooks(
        self,
        model: nn.Module,
        input_tensor: torch.Tensor,
        start_pct: int,
        end_pct: int,
        on_progress: Callable[[int, str], None],
    ) -> torch.Tensor:
        """leafレイヤーにforward hookを付けて進捗をコールバックする。整数%が変化した時のみ送信。"""
        leaf_modules = [m for m in model.modules() if not list(m.children())]
        total = len(leaf_modules)
        counter = [0]
        last_pct = [start_pct]

        def hook(module, input, output):
            counter[0] += 1
            new_pct = start_pct + int((counter[0] / total) * (end_pct - start_pct))
            if new_pct > last_pct[0]:
                last_pct[0] = new_pct
                on_progress(new_pct, "layer")

        handles = [m.register_forward_hook(hook) for m in leaf_modules]
        try:
            return model(input_tensor)
        finally:
            for h in handles:
                h.remove()

    @torch.no_grad()
    def process_with_progress(
        self,
        image_bytes: bytes,
        on_progress: Callable[[int, str], None],
    ) -> bytes:
        on_progress(5, "decode")
        imgorg = self._decode(image_bytes)

        on_progress(15, "wc_preprocess")
        img_tensor = self._to_tensor(imgorg, self.WC_SIZE)

        on_progress(20, "wc_inference")
        wc_out = self._run_with_hooks(self.wc_model, img_tensor, 20, 55, on_progress)
        pred_wc = self.htan(wc_out)
        bm_input = F.interpolate(pred_wc, self.BM_SIZE)

        on_progress(55, "bm_inference")
        bm_out = self._run_with_hooks(self.bm_model, bm_input, 55, 85, on_progress)

        on_progress(85, "unwarp")
        result = self._unwarp(imgorg, bm_out)

        on_progress(95, "encode")
        result_bgr = cv2.cvtColor((result * 255).astype(np.uint8), cv2.COLOR_RGB2BGR)
        _, buf = cv2.imencode(".png", result_bgr)
        return buf.tobytes()
