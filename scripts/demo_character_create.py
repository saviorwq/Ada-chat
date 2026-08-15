# -*- coding: utf-8 -*-
"""demo1：上传一张人脸，新建角色档案。"""
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
    p.add_argument("--image", required=True, help="清晰正面人脸图")
    p.add_argument("--name", required=True, help="角色名")
    p.add_argument("--tags", default="lead")
    args = p.parse_args()
    from face_identity import create_character, library_root

    tags = [t.strip() for t in args.tags.split(",") if t.strip()]
    profile = create_character(args.image, args.name, tags=tags)
    print(
        json.dumps(
            {
                "ok": True,
                "library_root": library_root(),
                "cid": profile["cid"],
                "char_name": profile["char_name"],
                "vec_md5": profile["vec_md5"],
                "source_ref_img": profile["source_ref_img"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
