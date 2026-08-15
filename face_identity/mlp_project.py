# -*- coding: utf-8 -*-
"""
简易两层 MLP：512 → hidden → token_dim（仅推理通路，随机初始化权重）。
Two-layer MLP stub for future cross-attn / Adapter injection.

注意 / NOTE:
  未训练权重**不能**作为真实身份条件；当前图生图锁脸请用 InsightFace 换脸。
  Random weights are NOT identity lock — use face-swap until a trained adapter exists.
"""
from __future__ import annotations

import os
from typing import Any, Dict, Optional, Tuple

import numpy as np

from face_identity.stack import face_models_dir

_DEFAULT_TOKEN_DIM = 768
_DEFAULT_HIDDEN = 1024
_MLP = None
_MLP_META: Dict[str, Any] = {}


def mlp_weights_path() -> str:
    return os.path.join(face_models_dir(), "face_mlp_init.npz")


def ensure_mlp_weights(
    token_dim: int = _DEFAULT_TOKEN_DIM,
    hidden: int = _DEFAULT_HIDDEN,
    seed: int = 42,
) -> str:
    """若不存在则生成并持久化随机初始化权重。Create & persist random init if missing."""
    path = mlp_weights_path()
    if os.path.isfile(path) and os.path.getsize(path) > 1000:
        return path
    rng = np.random.default_rng(seed)
    # Xavier-ish
    w1 = (rng.standard_normal((512, hidden)) * np.sqrt(2.0 / 512)).astype(np.float32)
    b1 = np.zeros((hidden,), dtype=np.float32)
    w2 = (rng.standard_normal((hidden, token_dim)) * np.sqrt(2.0 / hidden)).astype(
        np.float32
    )
    b2 = np.zeros((token_dim,), dtype=np.float32)
    np.savez_compressed(
        path,
        w1=w1,
        b1=b1,
        w2=w2,
        b2=b2,
        token_dim=np.array([token_dim], dtype=np.int32),
        hidden=np.array([hidden], dtype=np.int32),
        note=np.array(["untrained_stub_not_for_identity"]),
    )
    return path


def _load_mlp() -> Tuple[Dict[str, np.ndarray], Dict[str, Any]]:
    global _MLP, _MLP_META
    if _MLP is not None:
        return _MLP, _MLP_META
    path = ensure_mlp_weights()
    data = np.load(path, allow_pickle=True)
    weights = {
        "w1": data["w1"].astype(np.float32),
        "b1": data["b1"].astype(np.float32),
        "w2": data["w2"].astype(np.float32),
        "b2": data["b2"].astype(np.float32),
    }
    meta = {
        "path": path,
        "token_dim": int(data["token_dim"][0]) if "token_dim" in data else _DEFAULT_TOKEN_DIM,
        "hidden": int(data["hidden"][0]) if "hidden" in data else _DEFAULT_HIDDEN,
        "trained": False,
        "warning": "untrained_stub_not_for_identity",
    }
    _MLP = weights
    _MLP_META = meta
    return weights, meta


def project_face_vector(
    face_512_vector,
    *,
    as_tokens: bool = True,
) -> Dict[str, Any]:
    """
    512 维人脸向量 → MLP → 条件 token（或扁平向量）。
    Forward-only projection. Does NOT provide real identity without trained weights.

    Returns dict:
      projected: np.ndarray shape (1, token_dim) if as_tokens else (token_dim,)
      meta: weight info
    """
    weights, meta = _load_mlp()
    x = np.asarray(face_512_vector, dtype=np.float32).reshape(-1)
    if x.shape[0] != 512:
        raise ValueError(f"期望 512 维人脸向量，收到 {x.shape[0]}")
    h = np.maximum(0.0, x @ weights["w1"] + weights["b1"])  # ReLU
    y = h @ weights["w2"] + weights["b2"]
    if as_tokens:
        y = y.reshape(1, -1)
    return {
        "projected": y.astype(np.float32),
        "token_dim": int(y.shape[-1]),
        "meta": dict(meta),
        "usable_for_identity": False,
    }
