#!/usr/bin/env python3
"""
Ada Chat 本地文生图桥（不依赖 SD WebUI / ComfyUI）
Local text-to-image bridge via Diffusers (no WebUI dependency)

支持：
  - Diffusers 目录（model_index.json + 子目录）：SD1.5 / SDXL / Z-Image（ZImagePipeline）
  - 单文件 Checkpoint（*.safetensors / *.ckpt）← SD1.5 / SDXL 社区最常见
  - 不支持：Comfy 纯 UNET 单文件、Flux / SD3（MVP）

Commands:
  - doctor
  - scan --models-dir
  - generate --request-file JSON
  - serve --host --port   (resident worker: load once, reuse)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any, Dict, List, Optional, Tuple


def _ensure_windows_path_env() -> None:
    """
    PHP `start /B` 子进程有时没有 PATH；torch+xpu 导入时会 os.environ['PATH'] 直接 KeyError。
    Detached PHP workers sometimes inherit an empty PATH; torch+xpu then crashes on import.
    """
    if os.name != "nt":
        return
    current = os.environ.get("PATH") or os.environ.get("Path") or ""
    extras = [
        r"C:\Windows\system32",
        r"C:\Windows",
        r"C:\Windows\System32\Wbem",
        r"C:\Windows\System32\WindowsPowerShell\v1.0",
        r"C:\Python314",
        r"C:\Python314\Scripts",
        r"C:\Program Files (x86)\Intel\oneAPI\2026.0\bin",
        r"C:\Program Files (x86)\Intel\oneAPI\compiler\latest\bin",
        r"C:\Program Files (x86)\Intel\oneAPI\compiler\latest\windows\bin",
        r"C:\Program Files (x86)\Intel\oneAPI\compiler\2025.0\bin",
        os.path.dirname(sys.executable) if sys.executable else "",
        os.path.join(os.path.dirname(sys.executable), "Scripts")
        if sys.executable
        else "",
    ]
    # Level Zero / SYCL loader dirs if present
    for root in (
        r"C:\Program Files (x86)\Intel\oneAPI",
        r"C:\Program Files\Intel\oneAPI",
    ):
        if not os.path.isdir(root):
            continue
        for dirpath, dirnames, filenames in os.walk(root):
            low = {f.lower() for f in filenames}
            if "ze_loader.dll" in low or "sycl8.dll" in low or "sycl7.dll" in low:
                extras.append(dirpath)
            # limit walk depth
            depth = dirpath[len(root) :].count(os.sep)
            if depth >= 4:
                dirnames[:] = []
            if len(extras) > 40:
                break
        if len(extras) > 40:
            break

    if not os.environ.get("SYSTEMROOT"):
        os.environ["SYSTEMROOT"] = r"C:\Windows"
    if not os.environ.get("WINDIR"):
        os.environ["WINDIR"] = r"C:\Windows"
    # Machine + User PATH（若可读）
    try:
        import winreg

        for root, sub in (
            (winreg.HKEY_LOCAL_MACHINE, r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment"),
            (winreg.HKEY_CURRENT_USER, r"Environment"),
        ):
            try:
                with winreg.OpenKey(root, sub) as key:
                    val, _ = winreg.QueryValueEx(key, "Path")
                    if isinstance(val, str) and val.strip():
                        extras.append(val)
            except OSError:
                pass
    except Exception:
        pass

    parts: List[str] = []
    seen = set()
    for chunk in [current] + extras:
        for p in str(chunk).split(";"):
            p = p.strip()
            if not p:
                continue
            key = p.lower()
            if key in seen:
                continue
            seen.add(key)
            parts.append(p)
    if parts:
        joined = ";".join(parts)
        os.environ["PATH"] = joined
        os.environ["Path"] = joined


_ensure_windows_path_env()


# 单文件完整 checkpoint 通常 > ~1.5GB；更小的多为 LoRA/VAE 组件
SINGLE_FILE_MIN_BYTES = int(1.5 * 1024 * 1024 * 1024)


def _json_out(payload: Dict[str, Any], code: int = 0) -> int:
    # Windows 下 PHP exec 管道常非 UTF-8；ensure_ascii 避免 JSON 被截断/解析失败
    # PHP exec pipes on Windows are often not UTF-8; keep JSON ASCII-safe
    sys.stdout.write(json.dumps(payload, ensure_ascii=True))
    sys.stdout.flush()
    return code


def _has(pkg: str) -> bool:
    try:
        import importlib.util

        return importlib.util.find_spec(pkg) is not None
    except Exception:
        return False


def _guess_family(name: str) -> str:
    n = name.lower().replace("\\", "/")
    # Z-Image / Lumina2 / Qwen-Image：非 SD 单文件，需单独拒绝
    if any(
        k in n
        for k in (
            "z-image",
            "z_image",
            "zimage",
            "lumina2",
            "lumina-2",
            "qwen-image",
            "qwen_image",
        )
    ):
        return "zimage"
    # SDXL 系关键词优先（很多文件名会夹带 Flux 字样但实为 SDXL/Pony）
    if any(
        k in n
        for k in (
            "sdxl",
            "pony",
            "illustrious",
            "juggernautxl",
            "realvisxl",
            "xl-",
            "_xl_",
            "xlflux",  # 命名噪声，仍按 SDXL 单文件尝试
        )
    ) or ("xl" in n and "flux" not in n):
        return "sdxl"
    if "flux" in n:
        return "flux"
    if any(k in n for k in ("sd3", "stable-diffusion-3")):
        return "sd3"
    return "sd"


def _peek_single_file_family(path: str) -> Optional[str]:
    """
    用 safetensors 键名识别非 SD 架构（避免误走 from_single_file）。
    Peek weight keys to reject Z-Image / DiT UNET masquerading as SD checkpoints.
    """
    try:
        from safetensors import safe_open

        with safe_open(path, framework="pt", device="cpu") as f:
            keys = list(f.keys())
    except Exception:
        return None
    if not keys:
        return None
    head = keys[:300]
    sample = " ".join(head[:80]).lower()
    joined = "\n".join(k.lower() for k in head)
    if (
        "model.diffusion_model.context_refiner" in joined
        or "cap_embedder" in sample
        or "context_refiner" in sample
    ):
        return "zimage"
    if any("qwen3" in k.lower() or "qwen2" in k.lower() for k in head[:50]):
        return "zimage"
    has_dm = any(k.startswith("model.diffusion_model.") for k in head)
    has_sd_bundle = any(
        k.startswith(
            (
                "first_stage_model.",
                "conditioner.",
                "cond_stage_model.",
                "text_encoder",
                "vae.",
            )
        )
        or "text_model" in k
        for k in head
    )
    # Comfy 导出的纯 UNET（缺 VAE/文本编码器）不能走 SD from_single_file
    if has_dm and not has_sd_bundle:
        return "zimage"
    if any("conditioner.embedders" in k or "text_encoder_2" in k for k in head):
        return "sdxl"
    return None


def _family_for_single_file(path: str, name_hint: str) -> str:
    peeked = _peek_single_file_family(path)
    if peeked:
        return peeked
    return _guess_family(name_hint)


def _family_for_diffusers_dir(path: str, name_hint: str) -> str:
    """
    优先读 model_index.json 的 _class_name（如 ZImagePipeline）。
    Prefer model_index _class_name (e.g. ZImagePipeline) over path heuristics.
    """
    idx_path = os.path.join(path, "model_index.json")
    try:
        with open(idx_path, "r", encoding="utf-8") as f:
            idx = json.load(f)
        cls = str(idx.get("_class_name") or "")
        if "ZImage" in cls or "z_image" in cls.lower():
            return "zimage"
        if "Flux" in cls:
            return "flux"
        if "StableDiffusion3" in cls or "SD3" in cls:
            return "sd3"
        if "StableDiffusionXL" in cls or "SDXL" in cls:
            return "sdxl"
    except Exception:
        pass
    return _guess_family(name_hint)


def _reject_unsupported_model(model: Dict[str, str]) -> Optional[Dict[str, Any]]:
    """
    Flux/SD3 仍拒；Z-Image 仅允许 Diffusers 目录（拒绝 Comfy 纯 UNET 单文件）。
    Flux/SD3 still rejected; Z-Image allowed only as Diffusers dirs.
    """
    family = str(model.get("family") or "sd")
    fmt = str(model.get("format") or "")
    if family in ("flux", "sd3"):
        return {
            "success": False,
            "error": f"{family}_not_in_mvp",
            "hint": "MVP 暂不支持 Flux / SD3；请用 SD1.5 / SDXL，或 Diffusers 目录的 Z-Image",
            "docs": "docs/v1.5-local-image-runtime.md",
        }
    if family == "zimage" and fmt == "single_file":
        return {
            "success": False,
            "error": "zimage_single_file_unsupported",
            "hint": (
                "该文件是 ComfyUI 系 Z-Image/Lumina2 纯 UNET，不是 Diffusers 包。"
                "请下载 Diffusers 目录模型（如 Bl4ckSpaces/z-image-turbo-nsfw-v2-int4），"
                "或改用 SDXL 单文件 / Illustrious Diffusers。"
            ),
            "docs": "docs/v1.5-local-image-runtime.md",
        }
    if fmt == "diffusers_dir" and not _diffusers_dir_has_weights(str(model.get("path") or "")):
        return {
            "success": False,
            "error": "diffusers_weights_missing",
            "hint": (
                "Diffusers 目录缺少子组件权重（仅有 config 或残片）。"
                "请完整下载模型包后再试（transformer/unet + text_encoder + vae）。"
                "INT4 完整包目前在 local/Qwen；勿选未下完的 z-image-turbo-nsfw-v2-int4 空壳。"
            ),
            "docs": "docs/v1.5-local-image-runtime.md",
        }
    if family == "zimage" and fmt == "diffusers_dir":
        # 量化包依赖：缺库时给可执行提示
        te_cfg = os.path.join(str(model.get("path") or ""), "text_encoder", "config.json")
        need_bnb = False
        try:
            with open(te_cfg, "r", encoding="utf-8") as f:
                te = json.load(f)
            qc = te.get("quantization_config") or {}
            if qc.get("quant_method") == "bitsandbytes" or qc.get("load_in_4bit"):
                need_bnb = True
        except Exception:
            pass
        if need_bnb and not _has("bitsandbytes"):
            return {
                "success": False,
                "error": "bitsandbytes_required",
                "install_hint": "pip install -U \"bitsandbytes>=0.46.1\" optimum-quanto",
                "hint": (
                    "该 INT4 包的文本塔需要 bitsandbytes。"
                    "注意：bnb 主要为 CUDA 优化；本机 Arc(XPU) 上量化层常落在 CPU 内存，"
                    "显存占用仍可能不高。更稳可改用未量化的 Z-Image-Turbo。"
                ),
            }
    return None


def _zimage_infer_params(
    req: Dict[str, Any], steps: int, guidance: float
) -> Tuple[int, float]:
    """
    Z-Image Turbo：少步数 + 低 CFG。
    Ada/PHP 默认 steps=28、guidance=7.0 → 改写为 8 / 0；其它显式值尊重并钳制。
    """
    del req  # 保留签名兼容调用方；默认改写看数值本身
    try:
        steps_i = int(steps)
    except Exception:
        steps_i = 28
    try:
        gs = float(guidance)
    except Exception:
        gs = 7.0
    if steps_i == 28:
        steps_i = 8
    else:
        steps_i = max(1, min(steps_i, 30))
    if abs(gs - 7.0) < 1e-6:
        gs = 0.0
    return steps_i, gs


def _diffusers_dir_has_weights(root: str) -> bool:
    """
    子目录需有去噪核心权重（unet 或 transformer），且单文件 >100MB。
    排除只有 config / 几 MB 残片的半成品包。
    """
    def _big_weight(dir_path: str) -> bool:
        if not os.path.isdir(dir_path):
            return False
        try:
            names = os.listdir(dir_path)
        except OSError:
            return False
        for f in names:
            fl = f.lower()
            if not fl.endswith((".safetensors", ".bin", ".pt", ".ckpt")):
                continue
            if fl.endswith(".part") or fl.endswith(".incomplete"):
                continue
            try:
                if os.path.getsize(os.path.join(dir_path, f)) > 100 * 1024 * 1024:
                    return True
            except OSError:
                continue
        return False

    if not (
        _big_weight(os.path.join(root, "unet"))
        or _big_weight(os.path.join(root, "transformer"))
    ):
        return False
    # Z-Image 等还需文本塔；缺 text_encoder 权重的半成品不进列表
    family = _family_for_diffusers_dir(root, root)
    if family == "zimage" and not _big_weight(os.path.join(root, "text_encoder")):
        return False
    return True


def _find_diffusers_dirs(models_dir: str) -> List[Dict[str, str]]:
    out: List[Dict[str, str]] = []
    if not models_dir or not os.path.isdir(models_dir):
        return out
    for root, _dirs, files in os.walk(models_dir):
        lower = [f.lower() for f in files]
        if "model_index.json" not in lower and "config.json" not in lower:
            continue
        # Diffusers 包：优先有 model_index.json；或 config + 权重 + 典型子目录
        has_weights = any(
            f.endswith(".safetensors") or f.endswith(".bin") for f in lower
        )
        if "model_index.json" not in lower and not has_weights:
            continue
        # 单文件仓库里常有孤立的 model_index.json，无子目录 —— 跳过这种空壳
        sub = set(os.listdir(root))
        looks_diffusers = ("model_index.json" in lower) and any(
            d in sub for d in ("unet", "vae", "text_encoder", "transformer")
        )
        looks_hf_dir = ("config.json" in lower) and has_weights and any(
            d in sub for d in ("unet", "vae", "text_encoder")
        )
        if not (looks_diffusers or looks_hf_dir):
            continue
        # 仅有 config、缺权重的半成品包（如未下完的 Z-Image）不进列表
        if not _diffusers_dir_has_weights(root):
            continue
        rel = os.path.relpath(root, models_dir).replace("\\", "/")
        out.append(
            {
                "id": rel,
                "path": root,
                "format": "diffusers_dir",
                "family": _family_for_diffusers_dir(root, rel),
            }
        )
    return out


def _find_single_file_checkpoints(models_dir: str) -> List[Dict[str, str]]:
    out: List[Dict[str, str]] = []
    if not models_dir or not os.path.isdir(models_dir):
        return out
    for root, _dirs, files in os.walk(models_dir):
        for f in files:
            fl = f.lower()
            if not (fl.endswith(".safetensors") or fl.endswith(".ckpt")):
                continue
            # 跳过明显组件名
            if any(
                k in fl
                for k in (
                    "lora",
                    "vae",
                    "text_encoder",
                    "unet.safetensors",
                    "diffusion_pytorch_model",
                )
            ):
                continue
            full = os.path.join(root, f)
            try:
                size = os.path.getsize(full)
            except OSError:
                continue
            if size < SINGLE_FILE_MIN_BYTES:
                continue
            rel = os.path.relpath(full, models_dir).replace("\\", "/")
            out.append(
                {
                    "id": rel,
                    "path": full,
                    "format": "single_file",
                    "family": _family_for_single_file(full, rel),
                    "bytes": size,
                }
            )
    return out


def _find_all_models(models_dir: str) -> List[Dict[str, str]]:
    seen = set()
    merged: List[Dict[str, str]] = []
    for m in _find_diffusers_dirs(models_dir) + _find_single_file_checkpoints(
        models_dir
    ):
        if m["id"] in seen:
            continue
        seen.add(m["id"])
        merged.append(m)
    merged.sort(key=lambda x: x["id"].lower())
    return merged


def cmd_doctor(_args: argparse.Namespace) -> int:
    device, dtype = "cpu", "float32"
    xpu_ok = False
    cuda_ok = False
    torch_ver = ""
    if _has("torch"):
        import torch

        torch_ver = str(getattr(torch, "__version__", ""))
        device, dtype_t = _pick_torch_device()
        dtype = str(dtype_t).replace("torch.", "")
        try:
            xpu_ok = bool(hasattr(torch, "xpu") and torch.xpu.is_available())
        except Exception:
            xpu_ok = False
        cuda_ok = bool(torch.cuda.is_available())
    ready = _has("torch") and _has("diffusers") and _has("PIL")
    return _json_out(
        {
            "success": True,
            "torch": _has("torch"),
            "diffusers": _has("diffusers"),
            "transformers": _has("transformers"),
            "pillow": _has("PIL"),
            "bitsandbytes": _has("bitsandbytes"),
            "optimum_quanto": _has("optimum.quanto") or _has("quanto"),
            "ready": ready,
            "device": device,
            "dtype": dtype,
            "cuda": cuda_ok,
            "xpu": xpu_ok,
            "torch_version": torch_ver,
            "supports": [
                "diffusers_dir",
                "single_file_safetensors",
                "single_file_ckpt",
                "zimage_diffusers",
            ],
            "hint": (
                "pip install -r requirements-local-image.txt；"
                "Intel Arc 需 PyTorch XPU 版。Z-Image 全精度走 sequential offload（偏内存）；"
                "INT4 需 bitsandbytes（bnb 在无 CUDA 时量化层常在 CPU）。"
            ),
            "docs": "docs/v1.5-local-image-runtime.md",
        }
    )


def cmd_scan(args: argparse.Namespace) -> int:
    models = _find_all_models(args.models_dir)
    return _json_out(
        {
            "success": True,
            "models": models,
            "count": len(models),
            "models_dir": args.models_dir,
            "formats": {
                "diffusers_dir": sum(1 for m in models if m["format"] == "diffusers_dir"),
                "single_file": sum(1 for m in models if m["format"] == "single_file"),
            },
        }
    )


def _resolve_model(models_dir: str, model_id: str) -> Optional[Dict[str, str]]:
    mid = (model_id or "").replace("\\", "/").strip()
    for m in _find_all_models(models_dir):
        if m["id"] == mid or m["id"].endswith("/" + mid) or os.path.basename(m["id"]) == mid:
            return m
    abs_try = os.path.join(models_dir, mid.replace("/", os.sep))
    if os.path.isfile(abs_try) and abs_try.lower().endswith(
        (".safetensors", ".ckpt")
    ):
        return {
            "id": mid,
            "path": abs_try,
            "format": "single_file",
            "family": _family_for_single_file(abs_try, mid),
        }
    if os.path.isdir(abs_try) and (
        os.path.isfile(os.path.join(abs_try, "model_index.json"))
        or os.path.isfile(os.path.join(abs_try, "config.json"))
    ):
        fam = _family_for_diffusers_dir(abs_try, mid)
        return {
            "id": mid,
            "path": abs_try,
            "format": "diffusers_dir",
            "family": fam,
            # 半成品仍返回，由 _reject_unsupported_model 给出明确提示
        }
    return None


def _pick_torch_device() -> Tuple[str, Any]:
    """Prefer Intel XPU (Arc) > CUDA > CPU. / 优先 Intel XPU（Arc）> CUDA > CPU。"""
    import torch

    try:
        if hasattr(torch, "xpu") and torch.xpu.is_available():
            return "xpu", torch.float16
    except Exception:
        pass
    if torch.cuda.is_available():
        return "cuda", torch.float16
    return "cpu", torch.float32


def _zimage_quant_methods(path: str) -> Dict[str, str]:
    """读取 text_encoder / transformer 的 quant_method（bitsandbytes / quanto 等）。"""
    out: Dict[str, str] = {}
    for sub in ("text_encoder", "transformer"):
        cfg_path = os.path.join(path, sub, "config.json")
        try:
            with open(cfg_path, "r", encoding="utf-8") as f:
                qc = json.load(f).get("quantization_config") or {}
            method = str(qc.get("quant_method") or "").strip()
            if method:
                out[sub] = method
            elif qc.get("load_in_4bit") or qc.get("_load_in_4bit"):
                out[sub] = "bitsandbytes"
        except Exception:
            continue
    return out


def _parse_size(raw: str, family: str) -> Tuple[int, int]:
    s = str(raw or "").lower().replace("*", "x").replace("×", "x")
    if "x" in s:
        a, b = s.split("x", 1)
        try:
            return max(256, int(a)), max(256, int(b))
        except Exception:
            pass
    if family in ("sdxl", "zimage"):
        return 1024, 1024
    return 512, 512


def _load_pipeline(model: Dict[str, str], dtype, device: str):
    from diffusers import (
        AutoPipelineForText2Image,
        DiffusionPipeline,
        StableDiffusionPipeline,
        StableDiffusionXLPipeline,
    )

    fmt = model.get("format") or "diffusers_dir"
    family = model.get("family") or "sd"
    path = model["path"]

    if fmt == "single_file":
        # 社区 Checkpoint：单文件加载
        if family == "sdxl":
            pipe = StableDiffusionXLPipeline.from_single_file(
                path,
                torch_dtype=dtype,
                local_files_only=True,
            )
        else:
            pipe = StableDiffusionPipeline.from_single_file(
                path,
                torch_dtype=dtype,
                local_files_only=True,
            )
    elif family == "zimage":
        # Z-Image：通用 DiffusionPipeline 会落到 ZImagePipeline（Diffusers ≥0.35）
        import torch

        load_dtype = dtype
        # XPU/CUDA：优先 bf16，避免 fp16 在 DiT/VAE 上出 NaN→黑图
        if device in ("cuda", "xpu") and hasattr(torch, "bfloat16"):
            load_dtype = torch.bfloat16

        quant = _zimage_quant_methods(path)
        is_quant = bool(quant)
        # 量化包：Diffusers 强制 low_cpu_mem_usage=True；切勿再 pipe.to()/offload（会触发 meta tensor）
        try:
            pipe = DiffusionPipeline.from_pretrained(
                path,
                torch_dtype=load_dtype,
                local_files_only=True,
                low_cpu_mem_usage=True,
            )
        except Exception as e1:
            sys.stderr.write(f"[adachat-image] zimage load retry: {e1}\n")
            sys.stderr.flush()
            pipe = DiffusionPipeline.from_pretrained(
                path,
                torch_dtype=dtype,
                local_files_only=True,
                low_cpu_mem_usage=True,
            )

        if is_quant:
            # bnb/quanto：整条链路钉在 CPU（Arc/XPU 上 bnb 内核不可用；混用会 device mismatch）
            # 注意：6B DiT 纯 CPU 极慢，Arc 用户应优先用未量化 Z-Image-Turbo + sequential offload
            if device == "xpu" and not torch.cuda.is_available():
                sys.stderr.write(
                    "[adachat-image] WARN: quantized Z-Image on Arc/XPU runs on CPU only "
                    "(bitsandbytes has no XPU kernels); expect very slow inference. "
                    "Prefer non-quant Z-Image-Turbo for usable speed.\n"
                )
                sys.stderr.flush()
            try:
                pipe = pipe.to("cpu")
            except Exception as e:
                sys.stderr.write(f"[adachat-image] quant pipe.to(cpu) skipped: {e}\n")
                sys.stderr.flush()
            try:
                # 防止 Diffusers 因检测到 xpu 而把 latents 放到加速器上
                pipe._execution_device = torch.device("cpu")
            except Exception:
                pass
            sys.stderr.write(
                f"[adachat-image] zimage quantized={quant} force_device=cpu\n"
            )
            sys.stderr.flush()
            try:
                setattr(pipe, "_adachat_force_cpu", True)
            except Exception:
                pass
            return pipe

        # 非量化：VAE fp32 更稳
        try:
            if hasattr(pipe, "vae") and pipe.vae is not None:
                pipe.vae.to(dtype=torch.float32)
        except Exception as e:
            sys.stderr.write(f"[adachat-image] vae fp32 skipped: {e}\n")
            sys.stderr.flush()

        # 非量化：XPU 用 sequential offload（~16GB Arc）
        if device == "xpu":
            try:
                torch.xpu.empty_cache()
            except Exception:
                pass
            for fn_name in (
                "enable_attention_slicing",
                "enable_vae_slicing",
                "enable_vae_tiling",
            ):
                try:
                    getattr(pipe, fn_name)()
                except Exception:
                    pass
            for mode, fn_name in (
                ("sequential", "enable_sequential_cpu_offload"),
                ("model", "enable_model_cpu_offload"),
            ):
                fn = getattr(pipe, fn_name, None)
                if not callable(fn):
                    continue
                try:
                    try:
                        fn(device="xpu")
                    except TypeError:
                        fn()
                    sys.stderr.write(
                        f"[adachat-image] zimage xpu offload={mode} dtype={load_dtype}\n"
                    )
                    sys.stderr.flush()
                    return pipe
                except Exception as e:
                    sys.stderr.write(f"[adachat-image] zimage offload {mode} failed: {e}\n")
                    sys.stderr.flush()
            return pipe.to(device)
        if device == "cuda":
            try:
                pipe.enable_attention_slicing()
            except Exception:
                pass
            return pipe.to(device)
        return pipe
    else:
        pipe = AutoPipelineForText2Image.from_pretrained(
            path,
            torch_dtype=dtype,
            local_files_only=True,
        )

    if device in ("cuda", "xpu") and family != "zimage":
        try:
            pipe.enable_attention_slicing()
        except Exception:
            pass
        try:
            pipe.enable_vae_slicing()
        except Exception:
            pass
    return pipe.to(device)


def _run_generate_request(req: Dict[str, Any]) -> Dict[str, Any]:
    """
    执行一次文生图；成功返回 success=True 字典，失败返回 success=False。
    Shared generate core for oneshot CLI and resident worker.
    """
    if not (_has("torch") and _has("diffusers") and _has("PIL")):
        return {
            "success": False,
            "error": "缺少依赖",
            "install_hint": "pip install -r requirements-local-image.txt",
        }

    models_dir = str(req.get("models_dir") or "")
    model_id = str(req.get("model_id") or "")
    prompt = str(req.get("prompt") or "").strip()
    negative = str(req.get("negative_prompt") or req.get("negative") or "").strip()
    out_file = str(req.get("output_file") or "").strip()
    steps = int(req.get("steps") or 28)
    guidance = float(req.get("guidance_scale") or 7.0)
    seed = req.get("seed", None)

    if not prompt:
        return {"success": False, "error": "prompt_empty"}
    if not out_file:
        return {"success": False, "error": "output_file_missing"}

    model = _resolve_model(models_dir, model_id)
    if not model:
        return {
            "success": False,
            "error": "model_not_found",
            "hint": "支持：① Diffusers 目录 ② 单文件 .safetensors/.ckpt（完整 checkpoint，约≥1.5GB）",
        }

    family = str(model.get("family") or "sd")
    # 单文件再 peek；Diffusers 目录再读 model_index
    if (model.get("format") or "") == "single_file":
        family = _family_for_single_file(str(model["path"]), family)
        model = {**model, "family": family}
    elif (model.get("format") or "") == "diffusers_dir":
        family = _family_for_diffusers_dir(str(model["path"]), family)
        model = {**model, "family": family}

    rejected = _reject_unsupported_model(model)
    if rejected is not None:
        return rejected

    if family == "zimage":
        steps, guidance = _zimage_infer_params(req, steps, guidance)

    width, height = _parse_size(str(req.get("image_size") or ""), family)
    os.makedirs(os.path.dirname(out_file) or ".", exist_ok=True)

    try:
        import torch

        device, dtype = _pick_torch_device()
        sys.stderr.write(f"[adachat-image] device={device} dtype={dtype} model={model_id}\n")
        sys.stderr.flush()
        if device == "cpu":
            return {
                "success": False,
                "error": "未检测到可用 GPU（CUDA/XPU），拒绝在 CPU 加载大模型以免占满系统内存",
                "hint": (
                    "本机 Arc 应使用 PyTorch XPU 版（当前 python -c \"import torch; print(torch.xpu.is_available())\" 应为 True）。"
                    "若为 False，请安装 Intel 的 torch+xpu 轮子。"
                ),
                "device": device,
                "torch_version": getattr(torch, "__version__", ""),
            }

        sys.stderr.write("[adachat-image] loading pipeline (weights may sit in RAM until .to(device))\n")
        sys.stderr.flush()
        pipe = _load_pipeline(model, dtype, device)
        force_cpu = bool(getattr(pipe, "_adachat_force_cpu", False))
        infer_device = "cpu" if force_cpu else device
        sys.stderr.write(
            f"[adachat-image] pipeline infer_device={infer_device} starting inference\n"
        )
        sys.stderr.flush()
        try:
            if infer_device == "xpu":
                torch.xpu.synchronize()
            elif infer_device == "cuda":
                torch.cuda.synchronize()
        except Exception:
            pass

        generator = None
        if seed is not None and str(seed).strip() != "":
            try:
                try:
                    generator = torch.Generator(device=infer_device).manual_seed(int(seed))
                except Exception:
                    generator = torch.Generator(device="cpu").manual_seed(int(seed))
            except Exception:
                generator = None

        result = pipe(
            prompt=prompt,
            negative_prompt=negative or None,
            num_inference_steps=max(1, min(steps, 60)),
            guidance_scale=guidance,
            width=width,
            height=height,
            generator=generator,
        )
        image = result.images[0]
        image.save(out_file)
    except Exception as e:
        import torch as _torch  # noqa: F401

        return {
            "success": False,
            "error": str(e),
            "device": locals().get("device"),
            "torch_version": getattr(_torch, "__version__", ""),
        }

    if not os.path.isfile(out_file):
        return {"success": False, "error": "output_missing"}
    return {
        "success": True,
        "output_file": out_file,
        "width": width,
        "height": height,
        "family": family,
        "format": model.get("format"),
        "device": infer_device if "infer_device" in locals() else device,
        "dtype": str(dtype).replace("torch.", ""),
        "model_id": model_id,
        "model_path": model.get("path"),
        "steps": steps,
        "guidance_scale": guidance,
        "reloaded": True,
    }


def cmd_generate(args: argparse.Namespace) -> int:
    req_path = str(args.request_file or "").strip()
    if not req_path or not os.path.isfile(req_path):
        return _json_out({"success": False, "error": "request_file_missing"}, 1)
    try:
        with open(req_path, "r", encoding="utf-8-sig") as f:
            req = json.load(f)
    except Exception as e:
        return _json_out({"success": False, "error": f"bad_request_json: {e}"}, 1)

    payload = _run_generate_request(req)
    return _json_out(payload, 0 if payload.get("success") else 1)


# --- Resident Image Worker -------------------------------------------------

_WORKER_STATE = "STOPPED"
_WORKER_LOCK = None  # set in cmd_serve
_WORKER_PIPE = None
_WORKER_MODEL_KEY = ""  # models_dir|model_id|path
_WORKER_MODEL_META: Dict[str, Any] = {}
_WORKER_DEVICE = ""
_WORKER_LAST_ERROR = ""


def _worker_set_state(state: str) -> None:
    global _WORKER_STATE
    _WORKER_STATE = state
    sys.stderr.write(f"[adachat-image-worker] state={state}\n")
    sys.stderr.flush()


def _worker_model_key(models_dir: str, model_id: str, path: str) -> str:
    return f"{models_dir}|{model_id}|{path}"


def _worker_ensure_pipeline(req: Dict[str, Any]) -> Tuple[Optional[Any], Optional[Dict[str, Any]]]:
    """
    确保管道已加载；同模型复用。返回 (pipe, error_dict)。
    Ensure pipeline loaded; reuse same model. Returns (pipe, error_dict).
    """
    global _WORKER_PIPE, _WORKER_MODEL_KEY, _WORKER_MODEL_META, _WORKER_DEVICE, _WORKER_LAST_ERROR

    if not (_has("torch") and _has("diffusers") and _has("PIL")):
        return None, {
            "success": False,
            "error": "缺少依赖",
            "install_hint": "pip install -r requirements-local-image.txt",
        }

    models_dir = str(req.get("models_dir") or "")
    model_id = str(req.get("model_id") or "")
    model = _resolve_model(models_dir, model_id)
    if not model:
        return None, {
            "success": False,
            "error": "model_not_found",
            "hint": "支持：① Diffusers 目录 ② 单文件 .safetensors/.ckpt",
        }

    family = str(model.get("family") or "sd")
    if (model.get("format") or "") == "single_file":
        family = _family_for_single_file(str(model["path"]), family)
        model = {**model, "family": family}
    elif (model.get("format") or "") == "diffusers_dir":
        family = _family_for_diffusers_dir(str(model["path"]), family)
        model = {**model, "family": family}

    rejected = _reject_unsupported_model(model)
    if rejected is not None:
        return None, rejected

    key = _worker_model_key(models_dir, model_id, str(model.get("path") or ""))
    if _WORKER_PIPE is not None and _WORKER_MODEL_KEY == key:
        return _WORKER_PIPE, None

    import torch

    device, dtype = _pick_torch_device()
    if device == "cpu":
        return None, {
            "success": False,
            "error": "未检测到可用 GPU（CUDA/XPU），拒绝在 CPU 加载大模型以免占满系统内存",
            "device": device,
        }

    _worker_set_state("LOADING")
    try:
        # drop previous pipe before loading another
        _WORKER_PIPE = None
        _WORKER_MODEL_KEY = ""
        pipe = _load_pipeline(model, dtype, device)
        _WORKER_PIPE = pipe
        _WORKER_MODEL_KEY = key
        _WORKER_MODEL_META = {
            "model_id": model_id,
            "path": model.get("path"),
            "format": model.get("format"),
            "family": family,
        }
        _WORKER_DEVICE = device
        _WORKER_LAST_ERROR = ""
        return pipe, None
    except Exception as e:
        _WORKER_PIPE = None
        _WORKER_MODEL_KEY = ""
        _WORKER_LAST_ERROR = str(e)
        _worker_set_state("ERROR")
        return None, {"success": False, "error": str(e), "device": device}


def _worker_generate(req: Dict[str, Any]) -> Dict[str, Any]:
    global _WORKER_LAST_ERROR

    prompt = str(req.get("prompt") or "").strip()
    negative = str(req.get("negative_prompt") or req.get("negative") or "").strip()
    out_file = str(req.get("output_file") or "").strip()
    steps = int(req.get("steps") or 28)
    guidance = float(req.get("guidance_scale") or 7.0)
    seed = req.get("seed", None)

    if not prompt:
        return {"success": False, "error": "prompt_empty"}
    if not out_file:
        return {"success": False, "error": "output_file_missing"}

    reloaded = True
    models_dir = str(req.get("models_dir") or "")
    model_id = str(req.get("model_id") or "")
    model = _resolve_model(models_dir, model_id)
    if model:
        key = _worker_model_key(models_dir, model_id, str(model.get("path") or ""))
        reloaded = not (_WORKER_PIPE is not None and _WORKER_MODEL_KEY == key)

    pipe, err = _worker_ensure_pipeline(req)
    if err is not None:
        return err
    assert pipe is not None

    family = str((_WORKER_MODEL_META or {}).get("family") or "sd")
    if family == "zimage":
        steps, guidance = _zimage_infer_params(req, steps, guidance)
    width, height = _parse_size(str(req.get("image_size") or ""), family)
    os.makedirs(os.path.dirname(out_file) or ".", exist_ok=True)

    _worker_set_state("BUSY")
    try:
        import torch

        device = _WORKER_DEVICE or _pick_torch_device()[0]
        force_cpu = bool(getattr(pipe, "_adachat_force_cpu", False))
        infer_device = "cpu" if force_cpu else device
        generator = None
        if seed is not None and str(seed).strip() != "":
            try:
                try:
                    generator = torch.Generator(device=infer_device).manual_seed(int(seed))
                except Exception:
                    generator = torch.Generator(device="cpu").manual_seed(int(seed))
            except Exception:
                generator = None

        result = pipe(
            prompt=prompt,
            negative_prompt=negative or None,
            num_inference_steps=max(1, min(steps, 60)),
            guidance_scale=guidance,
            width=width,
            height=height,
            generator=generator,
        )
        image = result.images[0]
        image.save(out_file)
        if not os.path.isfile(out_file):
            _WORKER_LAST_ERROR = "output_missing"
            _worker_set_state("ERROR")
            return {"success": False, "error": "output_missing"}

        _WORKER_LAST_ERROR = ""
        _worker_set_state("READY")
        return {
            "success": True,
            "output_file": out_file,
            "width": width,
            "height": height,
            "family": family,
            "format": (_WORKER_MODEL_META or {}).get("format"),
            "device": infer_device,
            "model_id": (_WORKER_MODEL_META or {}).get("model_id") or model_id,
            "reloaded": reloaded,
            "worker_status": "READY",
        }
    except Exception as e:
        _WORKER_LAST_ERROR = str(e)
        _worker_set_state("ERROR")
        return {"success": False, "error": str(e), "worker_status": "ERROR"}


def cmd_serve(args: argparse.Namespace) -> int:
    """
    常驻 Image Worker：模型加载一次后复用。
    Resident image worker — load Diffusers once, reuse across jobs.
    """
    global _WORKER_LOCK, _WORKER_STATE

    import threading
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

    host = str(args.host or "127.0.0.1")
    port = int(args.port or 18766)
    _WORKER_LOCK = threading.Lock()
    _worker_set_state("STARTING")

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt: str, *a: Any) -> None:
            sys.stderr.write("[adachat-image-worker] " + (fmt % a) + "\n")

        def _send_json(self, code: int, payload: Dict[str, Any]) -> None:
            raw = json.dumps(payload, ensure_ascii=True).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def do_GET(self) -> None:  # noqa: N802
            if self.path.startswith("/health"):
                self._send_json(
                    200,
                    {
                        "ok": True,
                        "status": _WORKER_STATE,
                        "loaded_model": (_WORKER_MODEL_META or {}).get("model_id") or None,
                        "loaded_path": (_WORKER_MODEL_META or {}).get("path") or None,
                        "device": _WORKER_DEVICE or None,
                        "last_error": _WORKER_LAST_ERROR or None,
                        "python": sys.executable,
                        "mode": "resident",
                    },
                )
                return
            self._send_json(404, {"ok": False, "error": "not_found"})

        def do_POST(self) -> None:  # noqa: N802
            if self.path.startswith("/stop"):
                _worker_set_state("STOPPING")
                self._send_json(200, {"ok": True, "status": "STOPPING"})
                # 延迟关闭，先回响应
                threading.Thread(target=lambda: (os._exit(0)), daemon=True).start()
                return

            if not self.path.startswith("/generate"):
                self._send_json(404, {"ok": False, "error": "not_found"})
                return

            try:
                length = int(self.headers.get("Content-Length") or "0")
                raw = self.rfile.read(max(0, length))
                req = json.loads(raw.decode("utf-8"))
                if not isinstance(req, dict):
                    raise ValueError("body must be object")
            except Exception as exc:
                self._send_json(400, {"success": False, "error": str(exc)})
                return

            assert _WORKER_LOCK is not None
            if not _WORKER_LOCK.acquire(blocking=False):
                self._send_json(
                    409,
                    {
                        "success": False,
                        "error": "worker_busy",
                        "worker_status": _WORKER_STATE,
                    },
                )
                return
            try:
                # ERROR 后允许再试；BUSY 已由锁挡住
                if _WORKER_STATE in ("STOPPING", "STARTING"):
                    self._send_json(
                        503,
                        {
                            "success": False,
                            "error": "worker_not_ready",
                            "worker_status": _WORKER_STATE,
                        },
                    )
                    return
                result = _worker_generate(req)
                code = 200 if result.get("success") else 500
                self._send_json(code, result)
            finally:
                _WORKER_LOCK.release()

    # bind 成功后进入 READY（尚无模型；首任务再 LOADING）
    httpd = ThreadingHTTPServer((host, port), Handler)
    _worker_set_state("READY")
    sys.stderr.write(f"[adachat-image-worker] listening on http://{host}:{port}\n")
    sys.stderr.flush()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        _worker_set_state("STOPPING")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description="Ada Chat local image inference bridge")
    sub = p.add_subparsers(dest="cmd", required=True)

    d = sub.add_parser("doctor")
    d.set_defaults(func=cmd_doctor)

    s = sub.add_parser("scan")
    s.add_argument("--models-dir", required=True)
    s.set_defaults(func=cmd_scan)

    g = sub.add_parser("generate")
    g.add_argument("--request-file", required=True)
    g.set_defaults(func=cmd_generate)

    srv = sub.add_parser("serve")
    srv.add_argument("--host", default="127.0.0.1")
    srv.add_argument("--port", type=int, default=18766)
    srv.set_defaults(func=cmd_serve)

    args = p.parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
