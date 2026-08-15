# -*- coding: utf-8 -*-
"""
共享 InsightFace Buffalo-L（CPU），供向量提取与换脸复用。
Shared FaceAnalysis on CPU for extract + swap.
"""
from __future__ import annotations

import os
import sys
from typing import Any, Optional, Tuple

_FACE_APP: Any = None
_FACE_INIT_ERROR = ""


def face_models_dir() -> str:
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    d = os.path.join(root, "ai_data", "face_models")
    os.makedirs(d, exist_ok=True)
    return d


def get_face_analysis():
    """懒加载 buffalo_l；ctx_id=-1 → CPU，避免抢 Arc 显存。"""
    global _FACE_APP, _FACE_INIT_ERROR
    if _FACE_APP is not None:
        return _FACE_APP
    try:
        import insightface  # noqa: F401
        from insightface.app import FaceAnalysis
    except Exception as e:
        _FACE_INIT_ERROR = f"缺少 InsightFace：{e}"
        raise RuntimeError(_FACE_INIT_ERROR) from e

    app = FaceAnalysis(
        name="buffalo_l",
        root=face_models_dir(),
        providers=["CPUExecutionProvider"],
    )
    app.prepare(ctx_id=-1, det_size=(640, 640))
    _FACE_APP = app
    _FACE_INIT_ERROR = ""
    sys.stderr.write("[adachat-face-id] FaceAnalysis buffalo_l ready (CPU)\n")
    sys.stderr.flush()
    return app


def largest_face(faces):
    if not faces:
        return None

    def area(f):
        b = f.bbox
        return float(max(0, b[2] - b[0]) * max(0, b[3] - b[1]))

    return max(faces, key=area)


def pil_to_bgr(pil_img):
    import cv2
    import numpy as np

    rgb = pil_img.convert("RGB")
    return cv2.cvtColor(np.asarray(rgb), cv2.COLOR_RGB2BGR)


def bgr_to_pil(bgr):
    import cv2
    from PIL import Image

    return Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))


def load_bgr(image_path: str):
    import cv2

    path = os.path.abspath(image_path)
    if not os.path.isfile(path):
        raise FileNotFoundError(path)
    img = cv2.imread(path)
    if img is None:
        raise ValueError(f"无法读取图片: {path}")
    return img
