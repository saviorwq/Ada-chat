# -*- coding: utf-8 -*-
"""
本地多角色档案库：人脸向量 + 人设 + 图/视频预设。
Local multi-character library with face vectors and presets.
"""
from __future__ import annotations

import json
import os
import shutil
import time
import uuid
from typing import Any, Dict, List, Optional

from face_identity.exceptions import CharacterNotFoundError
from face_identity.extract import extract_face_vector


def _project_root() -> str:
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def library_root() -> str:
    """默认 ai_data/character_library（与 gitignore 的运行时数据一致）。"""
    env = os.environ.get("ADACHAT_CHARACTER_LIBRARY", "").strip()
    if env:
        root = env
    else:
        root = os.path.join(_project_root(), "ai_data", "character_library")
    os.makedirs(os.path.join(root, "char_store"), exist_ok=True)
    idx = os.path.join(root, "character_index.json")
    if not os.path.isfile(idx):
        _atomic_write_json(idx, {"version": 1, "characters": []})
    return root


def _index_path() -> str:
    return os.path.join(library_root(), "character_index.json")


def _char_dir(cid: str) -> str:
    return os.path.join(library_root(), "char_store", cid)


def _profile_path(cid: str) -> str:
    return os.path.join(_char_dir(cid), "profile.json")


def _atomic_write_json(path: str, data: Any) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def _read_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8-sig") as f:
        return json.load(f)


def _load_index() -> Dict[str, Any]:
    data = _read_json(_index_path())
    if not isinstance(data, dict):
        data = {"version": 1, "characters": []}
    if not isinstance(data.get("characters"), list):
        data["characters"] = []
    return data


def _save_index(data: Dict[str, Any]) -> None:
    _atomic_write_json(_index_path(), data)


def _default_profile(cid: str, char_name: str, tags: Optional[List[str]] = None) -> Dict[str, Any]:
    return {
        "cid": cid,
        "char_name": char_name,
        "tags": list(tags or []),
        "face_vector": [],
        "vec_md5": "",
        "source_ref_img": "",
        "meta": {
            "age": None,
            "height": None,
            "weight": None,
            "body_param": "",
            "mark": "",
            "default_costume": "",
            "style_prefer": "",
        },
        "img2img_preset": {
            "id_weight": 0.60,
            "inject_t_start": 0.05,
            "inject_t_end": 0.68,
            "recommend_denoise": 0.33,
        },
        "video_reserved_preset": {
            "id_weight": 0.54,
            "frame_consistency": 0.62,
            "remark": "视频参数预留，当前仅存储暂不使用",
        },
        "bind_cids_reserved": [],
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }


def list_characters() -> List[Dict[str, Any]]:
    """返回索引摘要列表（不含完整 face_vector）。"""
    out = []
    for row in _load_index().get("characters", []):
        if not isinstance(row, dict):
            continue
        out.append(
            {
                "cid": row.get("cid"),
                "char_name": row.get("char_name"),
                "tags": row.get("tags") or [],
                "profile_path": row.get("profile_path"),
                "vec_md5": row.get("vec_md5"),
            }
        )
    return out


def get_character_profile(cid: str) -> Dict[str, Any]:
    path = _profile_path(cid)
    if not os.path.isfile(path):
        raise CharacterNotFoundError(cid)
    data = _read_json(path)
    if not isinstance(data, dict):
        raise CharacterNotFoundError(cid)
    return data


def create_character(
    face_image_path: str,
    char_name: str,
    *,
    tags: Optional[List[str]] = None,
    meta: Optional[Dict[str, Any]] = None,
    cid: Optional[str] = None,
) -> Dict[str, Any]:
    """
    上传人脸图 → 提取向量 → 新建档案。
    Create character profile from a face image.
    """
    face_image_path = os.path.abspath(face_image_path)
    if not os.path.isfile(face_image_path):
        raise FileNotFoundError(face_image_path)

    vec, md5 = extract_face_vector(face_image_path)
    new_cid = cid or ("char_" + uuid.uuid4().hex[:12])
    cdir = _char_dir(new_cid)
    os.makedirs(cdir, exist_ok=True)

    ext = os.path.splitext(face_image_path)[1].lower() or ".png"
    if ext not in (".png", ".jpg", ".jpeg", ".webp", ".bmp"):
        ext = ".png"
    ref_name = "source_ref" + ext
    ref_abs = os.path.join(cdir, ref_name)
    shutil.copy2(face_image_path, ref_abs)
    # 相对 library_root 的路径，便于迁移
    ref_rel = os.path.join("char_store", new_cid, ref_name).replace("\\", "/")

    profile = _default_profile(new_cid, char_name.strip() or new_cid, tags)
    profile["face_vector"] = [float(x) for x in vec.tolist()]
    profile["vec_md5"] = md5
    profile["source_ref_img"] = ref_rel
    if isinstance(meta, dict):
        profile["meta"].update({k: v for k, v in meta.items() if k in profile["meta"] or True})
        # merge known keys preferentially already via update

    _atomic_write_json(_profile_path(new_cid), profile)

    index = _load_index()
    index["characters"] = [
        c for c in index["characters"] if not (isinstance(c, dict) and c.get("cid") == new_cid)
    ]
    index["characters"].append(
        {
            "cid": new_cid,
            "char_name": profile["char_name"],
            "tags": profile["tags"],
            "profile_path": os.path.join("char_store", new_cid, "profile.json").replace(
                "\\", "/"
            ),
            "vec_md5": md5,
        }
    )
    _save_index(index)
    return profile


def refresh_character_vector(cid: str, face_image_path: str) -> Dict[str, Any]:
    profile = get_character_profile(cid)
    face_image_path = os.path.abspath(face_image_path)
    vec, md5 = extract_face_vector(face_image_path)

    cdir = _char_dir(cid)
    ext = os.path.splitext(face_image_path)[1].lower() or ".png"
    if ext not in (".png", ".jpg", ".jpeg", ".webp", ".bmp"):
        ext = ".png"
    ref_name = "source_ref" + ext
    ref_abs = os.path.join(cdir, ref_name)
    shutil.copy2(face_image_path, ref_abs)
    profile["face_vector"] = [float(x) for x in vec.tolist()]
    profile["vec_md5"] = md5
    profile["source_ref_img"] = os.path.join("char_store", cid, ref_name).replace("\\", "/")
    profile["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    _atomic_write_json(_profile_path(cid), profile)

    index = _load_index()
    for row in index["characters"]:
        if isinstance(row, dict) and row.get("cid") == cid:
            row["vec_md5"] = md5
            row["char_name"] = profile.get("char_name")
            break
    _save_index(index)
    return profile


def rename_character(cid: str, new_name: str) -> Dict[str, Any]:
    profile = get_character_profile(cid)
    profile["char_name"] = (new_name or "").strip() or profile["char_name"]
    profile["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    _atomic_write_json(_profile_path(cid), profile)
    index = _load_index()
    for row in index["characters"]:
        if isinstance(row, dict) and row.get("cid") == cid:
            row["char_name"] = profile["char_name"]
            break
    _save_index(index)
    return profile


def delete_character(cid: str) -> bool:
    path = _profile_path(cid)
    if not os.path.isfile(path):
        raise CharacterNotFoundError(cid)
    cdir = _char_dir(cid)
    shutil.rmtree(cdir, ignore_errors=True)
    index = _load_index()
    index["characters"] = [
        c for c in index["characters"] if not (isinstance(c, dict) and c.get("cid") == cid)
    ]
    _save_index(index)
    return True


def export_face_vector(cid: str, out_path: Optional[str] = None) -> str:
    profile = get_character_profile(cid)
    vec = profile.get("face_vector") or []
    if not vec:
        raise ValueError(f"角色无 face_vector: {cid}")
    if not out_path:
        out_path = os.path.join(_char_dir(cid), "face_vector_export.json")
    payload = {
        "cid": cid,
        "char_name": profile.get("char_name"),
        "vec_md5": profile.get("vec_md5"),
        "dim": len(vec),
        "face_vector": vec,
    }
    _atomic_write_json(out_path, payload)
    return out_path


def resolve_source_ref_abs(profile: Dict[str, Any]) -> str:
    rel = str(profile.get("source_ref_img") or "").strip()
    if not rel:
        raise FileNotFoundError("profile 缺少 source_ref_img")
    abs_path = rel if os.path.isabs(rel) else os.path.join(library_root(), rel)
    abs_path = os.path.normpath(abs_path)
    if not os.path.isfile(abs_path):
        raise FileNotFoundError(abs_path)
    return abs_path
