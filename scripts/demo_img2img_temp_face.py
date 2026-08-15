# -*- coding: utf-8 -*-
"""
demo2：临时人脸参考 — 仅验证 resolve + 向量/MLP（不跑完整 Diffusers）。
Temp face resolve smoke (no full diffusion).
完整出图请用 UI 图生图上传构图底图，并在请求里带 temp_face（或与底图同一张脸）。
"""
from __future__ import annotations

import argparse
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--temp-face", required=True)
    p.add_argument("--base", default="", help="可选构图底图路径（仅校验存在）")
    args = p.parse_args()
    from face_identity import resolve_face_source

    r = resolve_face_source(temp_face_ref=args.temp_face, fallback_image=args.base or None)
    out = {
        "ok": True,
        "mode": r.get("mode"),
        "face_image_path": r.get("face_image_path"),
        "vec_md5": r.get("vec_md5"),
        "token_dim": r.get("token_dim"),
        "usable_for_identity": r.get("usable_for_identity"),
        "note": "身份落地请走 InsightFace 换脸；MLP 投影仅预留",
    }
    if args.base:
        out["img2img_base_exists"] = os.path.isfile(args.base)
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
