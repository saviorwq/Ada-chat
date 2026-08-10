#!/usr/bin/env python3
"""
Ada Chat 本地文生视频桥（可选，无需 ComfyUI UI）
需要 diffusers + torch + safetensors 格式的 Wan 权重目录（非 ComfyUI GGUF）

Commands:
  - doctor: 检查依赖
  - scan: 扫描可本地推理的视频模型目录
  - generate: --request-file JSON
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any, Dict, List, Optional


def _json_out(payload: Dict[str, Any], code: int = 0) -> int:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))
    sys.stdout.flush()
    return code


def _has(pkg: str) -> bool:
    try:
        import importlib.util
        return importlib.util.find_spec(pkg) is not None
    except Exception:
        return False


def _find_wan_safetensors_dirs(models_dir: str) -> List[Dict[str, str]]:
    out: List[Dict[str, str]] = []
    if not models_dir or not os.path.isdir(models_dir):
        return out
    for root, _dirs, files in os.walk(models_dir):
        lower_files = [f.lower() for f in files]
        if "config.json" not in lower_files:
            continue
        name = os.path.basename(root).lower()
        parent = os.path.basename(os.path.dirname(root)).lower()
        hint = f"{parent}/{name}" if parent else name
        if "wan" in hint or "ti2v" in hint or "t2v" in hint:
            if any(f.endswith(".safetensors") for f in lower_files):
                rel = os.path.relpath(root, models_dir).replace("\\", "/")
                out.append({"id": rel, "path": root, "format": "safetensors"})
    return out


def cmd_doctor(_args: argparse.Namespace) -> int:
    return _json_out({
        "success": True,
        "torch": _has("torch"),
        "diffusers": _has("diffusers"),
        "transformers": _has("transformers"),
        "ready": _has("torch") and _has("diffusers"),
        "hint": "本地视频需 HuggingFace 格式 Wan 目录（含 config.json + safetensors），ComfyUI GGUF 请用云端 API 或 ComfyUI。",
    })


def cmd_scan(args: argparse.Namespace) -> int:
    models = _find_wan_safetensors_dirs(args.models_dir)
    return _json_out({"success": True, "models": models, "count": len(models), "models_dir": args.models_dir})


def _resolve_model(models_dir: str, model_id: str) -> Optional[Dict[str, str]]:
    for m in _find_wan_safetensors_dirs(models_dir):
        if m["id"] == model_id or m["id"].endswith("/" + model_id):
            return m
    if model_id.lower().endswith(".gguf"):
        return None
    return None


def cmd_generate(args: argparse.Namespace) -> int:
    req_path = str(args.request_file or "").strip()
    if not req_path or not os.path.isfile(req_path):
        return _json_out({"success": False, "error": "missing request file"}, 1)
    with open(req_path, "r", encoding="utf-8") as f:
        req = json.load(f)

    models_dir = str(req.get("models_dir") or args.models_dir or "").strip()
    model_id = str(req.get("model_id") or "").strip()
    prompt = str(req.get("prompt") or "").strip()
    output_file = str(req.get("output_file") or "").strip()

    if not prompt:
        return _json_out({"success": False, "error": "empty prompt"}, 1)
    if not output_file:
        return _json_out({"success": False, "error": "missing output_file"}, 1)

    if model_id.lower().endswith(".gguf") or "wan" in model_id.lower() and model_id.lower().endswith(".gguf"):
        return _json_out({
            "success": False,
            "error": (
                "本地 ComfyUI 格式 Wan GGUF 不能直接用于 Ada Chat 一键出片。"
                "请任选：1) 设置硅基流动等云端 API Key 使用 Wan2.2-T2V；"
                "2) 下载 HuggingFace 格式 Wan2.2-TI2V-5B safetensors 到模型目录。"
            ),
        }, 1)

    model = _resolve_model(models_dir, model_id)
    if not model:
        return _json_out({
            "success": False,
            "error": f"未找到本地 safetensors 视频模型: {model_id}。当前目录仅有 GGUF 时请使用云端模式。",
        }, 1)

    if not (_has("torch") and _has("diffusers")):
        return _json_out({
            "success": False,
            "error": "请安装: pip install torch diffusers transformers accelerate",
        }, 1)

    try:
        import torch
        from diffusers import DiffusionPipeline

        pipe = DiffusionPipeline.from_pretrained(
            model["path"],
            torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
            trust_remote_code=True,
        )
        if torch.cuda.is_available():
            pipe = pipe.to("cuda")

        result = pipe(prompt, num_frames=49, guidance_scale=5.0)
        frames = getattr(result, "frames", None) or getattr(result, "images", None)
        if not frames:
            return _json_out({"success": False, "error": "pipeline 未返回帧"}, 1)

        os.makedirs(os.path.dirname(output_file) or ".", exist_ok=True)
        try:
            import imageio.v3 as iio
            import numpy as np

            frame0 = frames[0] if isinstance(frames[0], list) else frames
            arr = [np.array(f) for f in frame0]
            iio.imwrite(output_file, arr, fps=8, codec="libx264")
        except Exception as exc:
            return _json_out({
                "success": False,
                "error": f"导出 mp4 失败: {exc}。可 pip install imageio[ffmpeg]",
            }, 1)

        return _json_out({"success": True, "output_file": output_file})
    except Exception as exc:
        return _json_out({"success": False, "error": str(exc)}, 1)


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_doc = sub.add_parser("doctor")
    p_doc.set_defaults(func=cmd_doctor)

    p_scan = sub.add_parser("scan")
    p_scan.add_argument("--models-dir", required=True)
    p_scan.set_defaults(func=cmd_scan)

    p_gen = sub.add_parser("generate")
    p_gen.add_argument("--request-file", required=True)
    p_gen.add_argument("--models-dir", default="")
    p_gen.set_defaults(func=cmd_generate)

    args = parser.parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
