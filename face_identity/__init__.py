# -*- coding: utf-8 -*-
"""
Ada Chat 人脸身份链路（提取 / MLP 预留 / 角色库 / 条件获取）。
Face-identity stack: extract → MLP stub → character library → condition.

身份落地当前仍走 InsightFace 换脸；投影向量供未来 Adapter / 视频复用。
Identity is applied via face-swap today; projected tokens reserved for future adapters.
"""
from __future__ import annotations

from face_identity.exceptions import FaceDetectNotFoundError, CharacterNotFoundError
from face_identity.extract import extract_face_vector
from face_identity.mlp_project import project_face_vector, ensure_mlp_weights
from face_identity.library import (
    create_character,
    refresh_character_vector,
    rename_character,
    delete_character,
    list_characters,
    export_face_vector,
    get_character_profile,
    library_root,
)
from face_identity.condition import (
    get_character_condition,
    resolve_face_source,
)

__all__ = [
    "FaceDetectNotFoundError",
    "CharacterNotFoundError",
    "extract_face_vector",
    "project_face_vector",
    "ensure_mlp_weights",
    "create_character",
    "refresh_character_vector",
    "rename_character",
    "delete_character",
    "list_characters",
    "export_face_vector",
    "get_character_profile",
    "library_root",
    "get_character_condition",
    "resolve_face_source",
]
