# -*- coding: utf-8 -*-
"""
统一条件获取：cid / 临时人脸 → 向量 + MLP 投影 + 换脸用参考图路径。
Unified condition resolver for img2img / future video.
"""
from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, Union

from face_identity.exceptions import CharacterNotFoundError, FaceDetectNotFoundError
from face_identity.extract import extract_face_vector
from face_identity.library import (
    get_character_profile,
    resolve_source_ref_abs,
)
from face_identity.mlp_project import project_face_vector


def get_character_condition(cid: str) -> Dict[str, Any]:
    """
    读取档案 face_vector → MLP 投影 → 供调度使用的条件包。
    Also returns source_ref_abs for InsightFace swap (current identity path).
    """
    profile = get_character_profile(cid)
    vec = profile.get("face_vector") or []
    if not vec or len(vec) < 128:
        raise ValueError(f"角色 face_vector 无效: {cid}")
    proj = project_face_vector(vec)
    source_abs = None
    try:
        source_abs = resolve_source_ref_abs(profile)
    except Exception:
        source_abs = None
    return {
        "cid": cid,
        "char_name": profile.get("char_name"),
        "face_vector": vec,
        "vec_md5": profile.get("vec_md5"),
        "projected": proj["projected"],
        "token_dim": proj["token_dim"],
        "usable_for_identity": False,
        "mlp_meta": proj.get("meta"),
        "img2img_preset": profile.get("img2img_preset") or {},
        "video_reserved_preset": profile.get("video_reserved_preset") or {},
        "meta": profile.get("meta") or {},
        "source_ref_abs": source_abs,
        "bind_cids_reserved": profile.get("bind_cids_reserved") or [],
    }


def resolve_face_source(
    *,
    temp_face_ref: Optional[str] = None,
    bind_cid: Optional[Union[str, List[str]]] = None,
    fallback_image: Optional[str] = None,
    use_char_preset: bool = True,
) -> Dict[str, Any]:
    """
    图生图人脸来源二选一（多 cid 时只取第一个）。
    Prefer temp_face_ref, else first bind_cid, else fallback_image (init).

    Returns:
      mode: temp | character | fallback
      face_image_path: 换脸用本地图
      face_vector / projected / preset / cid …
    """
    # 多 cid 预留：仅处理第一个
    cid = None
    if isinstance(bind_cid, list):
        cid = str(bind_cid[0]).strip() if bind_cid else None
    elif bind_cid:
        cid = str(bind_cid).strip()

    if temp_face_ref and str(temp_face_ref).strip():
        path = os.path.abspath(str(temp_face_ref).strip())
        if not os.path.isfile(path):
            raise FileNotFoundError(path)
        vec, md5 = extract_face_vector(path)
        proj = project_face_vector(vec)
        return {
            "mode": "temp",
            "cid": None,
            "face_image_path": path,
            "face_vector": vec.tolist(),
            "vec_md5": md5,
            "projected": proj["projected"],
            "token_dim": proj["token_dim"],
            "usable_for_identity": False,
            "img2img_preset": {
                "id_weight": 0.60,
                "inject_t_start": 0.05,
                "inject_t_end": 0.68,
                "recommend_denoise": 0.33,
            },
            "use_char_preset": False,
        }

    if cid:
        cond = get_character_condition(cid)
        face_path = cond.get("source_ref_abs")
        if not face_path or not os.path.isfile(face_path):
            raise FileNotFoundError(f"角色参考图缺失: {cid}")
        preset = cond.get("img2img_preset") or {}
        return {
            "mode": "character",
            "cid": cid,
            "char_name": cond.get("char_name"),
            "face_image_path": face_path,
            "face_vector": cond.get("face_vector"),
            "vec_md5": cond.get("vec_md5"),
            "projected": cond.get("projected"),
            "token_dim": cond.get("token_dim"),
            "usable_for_identity": False,
            "img2img_preset": preset if use_char_preset else {},
            "video_reserved_preset": cond.get("video_reserved_preset"),
            "use_char_preset": bool(use_char_preset),
            "meta": cond.get("meta"),
        }

    if fallback_image and str(fallback_image).strip():
        path = os.path.abspath(str(fallback_image).strip())
        if not os.path.isfile(path):
            raise FileNotFoundError(path)
        vec, md5 = extract_face_vector(path)
        proj = project_face_vector(vec)
        return {
            "mode": "fallback",
            "cid": None,
            "face_image_path": path,
            "face_vector": vec.tolist(),
            "vec_md5": md5,
            "projected": proj["projected"],
            "token_dim": proj["token_dim"],
            "usable_for_identity": False,
            "img2img_preset": {},
            "use_char_preset": False,
        }

    raise FaceDetectNotFoundError("未提供 temp_face_ref / bind_cid / fallback 人脸图")
