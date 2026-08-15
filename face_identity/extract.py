# -*- coding: utf-8 -*-
"""
人脸预处理：图片 → Buffalo-L → 归一化 512D ArcFace 向量。
Face preprocess: image → buffalo_l → L2-normalized 512-D embedding.
"""
from __future__ import annotations

import hashlib
import os
from typing import Any, Dict, Tuple, Union

import numpy as np

from face_identity.exceptions import FaceDetectNotFoundError
from face_identity.stack import get_face_analysis, largest_face, load_bgr, pil_to_bgr


def _l2_normalize(vec: np.ndarray) -> np.ndarray:
    v = np.asarray(vec, dtype=np.float32).reshape(-1)
    n = float(np.linalg.norm(v))
    if n < 1e-12:
        raise ValueError("人脸向量范数过小，无法归一化")
    return (v / n).astype(np.float32)


def _md5_of_vector(vec: np.ndarray) -> str:
    raw = np.asarray(vec, dtype=np.float32).tobytes()
    return hashlib.md5(raw).hexdigest()


def extract_face_vector(
    image_path: Union[str, Any],
) -> Tuple[np.ndarray, str]:
    """
    从本地人脸图提取归一化 512 维向量。
    Extract L2-normalized 512-D ArcFace vector from a face image.

    Args:
        image_path: 本地路径，或已打开的 PIL.Image。
    Returns:
        (face_512, vec_md5)
    Raises:
        FaceDetectNotFoundError: 未检测到人脸
    """
    app = get_face_analysis()
    if hasattr(image_path, "convert"):
        bgr = pil_to_bgr(image_path)
        src_label = "pil"
    else:
        bgr = load_bgr(str(image_path))
        src_label = str(image_path)

    faces = app.get(bgr)
    face = largest_face(faces)
    if face is None:
        raise FaceDetectNotFoundError(f"未检测到人脸: {src_label}")

    emb = getattr(face, "normed_embedding", None)
    if emb is None:
        emb = getattr(face, "embedding", None)
    if emb is None:
        raise FaceDetectNotFoundError(f"人脸无 embedding: {src_label}")

    vec = _l2_normalize(emb)
    if vec.shape[0] != 512:
        # 少数模型维度不同：仍返回，但记录
        pass
    md5 = _md5_of_vector(vec)
    return vec, md5


def extract_face_vector_dict(image_path: Union[str, Any]) -> Dict[str, Any]:
    """便于 CLI / PHP 的 JSON 友好包装。JSON-friendly wrapper."""
    vec, md5 = extract_face_vector(image_path)
    return {
        "dim": int(vec.shape[0]),
        "vec_md5": md5,
        "face_vector": [float(x) for x in vec.tolist()],
    }
