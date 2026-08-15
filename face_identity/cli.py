# -*- coding: utf-8 -*-
"""
face_identity CLI：供 PHP / demo 调用，JSON stdout。
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import traceback
from typing import Any


def _json_out(payload: Any, code: int = 0) -> int:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False, default=_default))
    sys.stdout.write("\n")
    return code


def _default(o: Any):
    try:
        import numpy as np

        if isinstance(o, np.ndarray):
            return o.tolist()
        if isinstance(o, (np.floating, np.integer)):
            return o.item()
    except Exception:
        pass
    return str(o)


def main(argv=None) -> int:
    # 保证可从项目根 import face_identity
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if root not in sys.path:
        sys.path.insert(0, root)

    p = argparse.ArgumentParser(prog="face_identity")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("extract", help="提取人脸向量")
    s.add_argument("--image", required=True)

    s = sub.add_parser("create", help="新建角色")
    s.add_argument("--image", required=True)
    s.add_argument("--name", required=True)
    s.add_argument("--tags", default="", help="逗号分隔标签")

    s = sub.add_parser("refresh", help="刷新角色向量")
    s.add_argument("--cid", required=True)
    s.add_argument("--image", required=True)

    s = sub.add_parser("rename", help="重命名")
    s.add_argument("--cid", required=True)
    s.add_argument("--name", required=True)

    s = sub.add_parser("delete", help="删除角色")
    s.add_argument("--cid", required=True)

    s = sub.add_parser("list", help="列出角色")

    s = sub.add_parser("export", help="导出向量")
    s.add_argument("--cid", required=True)
    s.add_argument("--out", default="")

    s = sub.add_parser("condition", help="get_character_condition")
    s.add_argument("--cid", required=True)

    s = sub.add_parser("resolve", help="resolve_face_source")
    s.add_argument("--temp-face", default="")
    s.add_argument("--bind-cid", default="")
    s.add_argument("--fallback", default="")
    s.add_argument("--use-char-preset", action="store_true", default=True)

    args = p.parse_args(argv)

    try:
        if args.cmd == "extract":
            from face_identity.extract import extract_face_vector_dict

            return _json_out({"success": True, **extract_face_vector_dict(args.image)})

        if args.cmd == "create":
            from face_identity.library import create_character

            tags = [t.strip() for t in str(args.tags).split(",") if t.strip()]
            profile = create_character(args.image, args.name, tags=tags)
            # 列表响应用精简字段
            return _json_out(
                {
                    "success": True,
                    "cid": profile["cid"],
                    "char_name": profile["char_name"],
                    "vec_md5": profile["vec_md5"],
                    "source_ref_img": profile["source_ref_img"],
                }
            )

        if args.cmd == "refresh":
            from face_identity.library import refresh_character_vector

            profile = refresh_character_vector(args.cid, args.image)
            return _json_out(
                {
                    "success": True,
                    "cid": profile["cid"],
                    "vec_md5": profile["vec_md5"],
                }
            )

        if args.cmd == "rename":
            from face_identity.library import rename_character

            profile = rename_character(args.cid, args.name)
            return _json_out(
                {"success": True, "cid": profile["cid"], "char_name": profile["char_name"]}
            )

        if args.cmd == "delete":
            from face_identity.library import delete_character

            delete_character(args.cid)
            return _json_out({"success": True, "cid": args.cid})

        if args.cmd == "list":
            from face_identity.library import list_characters, library_root

            return _json_out(
                {
                    "success": True,
                    "library_root": library_root(),
                    "characters": list_characters(),
                }
            )

        if args.cmd == "export":
            from face_identity.library import export_face_vector

            path = export_face_vector(args.cid, args.out or None)
            return _json_out({"success": True, "path": path})

        if args.cmd == "condition":
            from face_identity.condition import get_character_condition

            cond = get_character_condition(args.cid)
            # 不把完整 projected ndarray 刷屏：给摘要
            projected = cond.get("projected")
            try:
                import numpy as np

                if isinstance(projected, np.ndarray):
                    cond = dict(cond)
                    cond["projected_shape"] = list(projected.shape)
                    cond["projected_preview"] = projected.reshape(-1)[:8].tolist()
                    del cond["projected"]
            except Exception:
                pass
            return _json_out({"success": True, "condition": cond})

        if args.cmd == "resolve":
            from face_identity.condition import resolve_face_source

            r = resolve_face_source(
                temp_face_ref=args.temp_face or None,
                bind_cid=args.bind_cid or None,
                fallback_image=args.fallback or None,
                use_char_preset=True,
            )
            if "projected" in r:
                try:
                    import numpy as np

                    if isinstance(r["projected"], np.ndarray):
                        r = dict(r)
                        r["projected_shape"] = list(r["projected"].shape)
                        del r["projected"]
                except Exception:
                    pass
            return _json_out({"success": True, "resolved": r})

        return _json_out({"success": False, "error": "unknown_cmd"}, 1)
    except Exception as e:
        return _json_out(
            {
                "success": False,
                "error": str(e),
                "error_type": type(e).__name__,
                "trace": traceback.format_exc()[-800:],
            },
            1,
        )


if __name__ == "__main__":
    raise SystemExit(main())
