# -*- coding: utf-8 -*-
"""
demo3：读取角色档案 get_character_condition + resolve(bind_cid)。
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
    p.add_argument("--cid", required=True)
    p.add_argument("--base", default="", help="可选构图底图")
    args = p.parse_args()
    from face_identity import get_character_condition, resolve_face_source
    import numpy as np

    cond = get_character_condition(args.cid)
    proj = cond.get("projected")
    shape = list(np.asarray(proj).shape) if proj is not None else None
    resolved = resolve_face_source(
        bind_cid=args.cid,
        fallback_image=args.base or None,
        use_char_preset=True,
    )
    print(
        json.dumps(
            {
                "ok": True,
                "cid": args.cid,
                "char_name": cond.get("char_name"),
                "vec_md5": cond.get("vec_md5"),
                "projected_shape": shape,
                "usable_for_identity": cond.get("usable_for_identity"),
                "img2img_preset": cond.get("img2img_preset"),
                "video_reserved_preset": cond.get("video_reserved_preset"),
                "source_ref_abs": cond.get("source_ref_abs"),
                "resolved_mode": resolved.get("mode"),
                "resolved_face": resolved.get("face_image_path"),
                "note": "图生图请上传构图底图并选择该角色；换脸用 source_ref",
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
