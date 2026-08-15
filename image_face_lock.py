# -*- coding: utf-8 -*-
"""
锁脸换景：文生图出场景/姿态后，用参考脸做 InsightFace 换脸。
Face-lock: T2I for scene/pose, then InsightFace swap from reference.

FaceAnalysis 与 face_identity.stack 共用，避免双开。
"""
from __future__ import annotations

import os
import sys
import urllib.request
from typing import Any, Dict, Tuple

_FACE_SWAPPER = None
_FACE_INIT_ERROR = ""


def _face_models_dir() -> str:
    from face_identity.stack import face_models_dir

    return face_models_dir()


def _inswapper_path() -> str:
    return os.path.join(_face_models_dir(), "inswapper_128.onnx")


def _ensure_inswapper_model() -> str:
    path = _inswapper_path()
    if os.path.isfile(path) and os.path.getsize(path) > 10 * 1024 * 1024:
        return path
    urls = [
        "https://huggingface.co/ezioruan/inswapper_128.onnx/resolve/main/inswapper_128.onnx",
        "https://github.com/facefusion/facefusion-assets/releases/download/models-3.0.0/inswapper_128.onnx",
    ]
    tmp = path + ".part"
    last_err = None
    for url in urls:
        try:
            sys.stderr.write(f"[adachat-face] downloading inswapper from {url}\n")
            sys.stderr.flush()
            urllib.request.urlretrieve(url, tmp)
            if os.path.getsize(tmp) < 10 * 1024 * 1024:
                raise RuntimeError("download too small")
            os.replace(tmp, path)
            return path
        except Exception as e:
            last_err = e
            try:
                if os.path.isfile(tmp):
                    os.remove(tmp)
            except Exception:
                pass
    raise RuntimeError(f"inswapper download failed: {last_err}")


def face_lock_available() -> Tuple[bool, str]:
    global _FACE_INIT_ERROR
    try:
        import cv2  # noqa: F401
        import insightface  # noqa: F401
        import onnxruntime  # noqa: F401
    except Exception as e:
        _FACE_INIT_ERROR = f"缺少锁脸依赖：{e}；请 pip install -U insightface opencv-python-headless"
        return False, _FACE_INIT_ERROR
    try:
        _ensure_inswapper_model()
    except Exception as e:
        _FACE_INIT_ERROR = f"锁脸模型未就绪：{e}"
        return False, _FACE_INIT_ERROR
    return True, ""


def _get_face_stack():
    """懒加载 FaceAnalysis + INSwapper（CPU）。"""
    global _FACE_SWAPPER, _FACE_INIT_ERROR
    ok, err = face_lock_available()
    if not ok:
        raise RuntimeError(err)
    from face_identity.stack import get_face_analysis
    import insightface

    app = get_face_analysis()
    if _FACE_SWAPPER is None:
        model_path = _ensure_inswapper_model()
        _FACE_SWAPPER = insightface.model_zoo.get_model(
            model_path,
            download=False,
            download_zip=False,
            providers=["CPUExecutionProvider"],
        )
        sys.stderr.write("[adachat-face] FaceAnalysis + inswapper ready (CPU)\n")
        sys.stderr.flush()
    _FACE_INIT_ERROR = ""
    return app, _FACE_SWAPPER


def swap_face_pil(source_face_pil, target_scene_pil) -> Tuple[Any, Dict[str, Any]]:
    """
    把 source 的脸换到 target 场景图上。
    Returns (result_pil, meta).
    """
    from face_identity.stack import bgr_to_pil, largest_face, pil_to_bgr

    app, swapper = _get_face_stack()
    src_bgr = pil_to_bgr(source_face_pil)
    tgt_bgr = pil_to_bgr(target_scene_pil)
    src_faces = app.get(src_bgr)
    tgt_faces = app.get(tgt_bgr)
    src_face = largest_face(src_faces)
    tgt_face = largest_face(tgt_faces)
    if src_face is None:
        raise RuntimeError("参考图未检测到人脸，无法锁脸")
    if tgt_face is None:
        raise RuntimeError("生成图未检测到人脸，无法锁脸（可换更清晰的正面提示词重试）")
    out = swapper.get(tgt_bgr, tgt_face, src_face, paste_back=True)
    meta = {
        "face_locked": True,
        "source_faces": len(src_faces),
        "target_faces": len(tgt_faces),
    }
    return bgr_to_pil(out), meta
