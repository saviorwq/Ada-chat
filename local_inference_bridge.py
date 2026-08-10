#!/usr/bin/env python3
"""
Ada Chat 本地模型推理桥 — 直接加载 GGUF / Safetensors，无需 Ollama。

Commands:
  - scan: 扫描目录中的 .gguf 与 safetensors 模型
  - doctor: 检查 Python 依赖
  - chat: 从 --request-file 读取 JSON 请求并输出 OpenAI 兼容 SSE
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import uuid
from typing import Any, Dict, Generator, List, Optional


def _configure_stdio_utf8() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    if hasattr(sys.stderr, "reconfigure"):
        try:
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass


_configure_stdio_utf8()


def _ensure_user_site_packages() -> None:
    """
    PHP/托盘进程有时禁用 user site，或 USERPROFILE/APPDATA 异常，
    导致 Roaming 里已装的包找不到。主动把常见用户 site 路径插入 sys.path。
    PHP/tray may disable user site or have wrong USERPROFILE/APPDATA;
    proactively inject common user site paths onto sys.path.
    """
    candidates: List[str] = []
    try:
        import site

        user_site = site.getusersitepackages()
        if isinstance(user_site, str) and user_site:
            candidates.append(user_site)
        elif isinstance(user_site, (list, tuple)):
            candidates.extend([p for p in user_site if isinstance(p, str)])
    except Exception:
        pass

    # 即使 site 模块禁用 user site，也按环境变量拼出常见路径
    # Build common paths even when user site is disabled
    appdata = os.environ.get("APPDATA") or os.environ.get("AppData") or ""
    userprofile = os.environ.get("USERPROFILE") or ""
    local_appdata = os.environ.get("LOCALAPPDATA") or ""
    ver = f"{sys.version_info.major}{sys.version_info.minor}"
    for base in (appdata, os.path.join(userprofile, "AppData", "Roaming") if userprofile else ""):
        if base:
            candidates.append(os.path.join(base, "Python", f"Python{ver}", "site-packages"))
    # 本机已知安装位置兜底（Windows Ada Chat 常见布局）
    # Known local install fallback for this Ada Chat Windows layout
    if userprofile:
        candidates.append(
            os.path.join(
                userprofile,
                "AppData",
                "Roaming",
                "Python",
                f"Python{ver}",
                "site-packages",
            )
        )
    if local_appdata:
        candidates.append(
            os.path.join(local_appdata, "Python", f"pythoncore-{sys.version_info.major}.{sys.version_info.minor}-64", "Lib", "site-packages")
        )
    # 绝对兜底：当前解释器旁的 site-packages 已由标准库处理；再补 Administrator 常见路径
    candidates.append(
        r"C:\Users\Administrator\AppData\Roaming\Python\Python314\site-packages"
    )
    candidates.append(
        r"C:\Users\Administrator\AppData\Local\Python\pythoncore-3.14-64\Lib\site-packages"
    )

    seen = set()
    for path in candidates:
        if not path:
            continue
        norm = os.path.normcase(os.path.abspath(path))
        if norm in seen:
            continue
        seen.add(norm)
        if not os.path.isdir(path):
            continue
        if path not in sys.path:
            sys.path.insert(0, path)
        try:
            import site

            site.addsitedir(path)
        except Exception:
            pass


_ensure_user_site_packages()


def _json_out(payload: Dict[str, Any], code: int = 0) -> int:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))
    sys.stdout.flush()
    return code


def _sse_chunk(text: str) -> None:
    payload = {
        "id": "local-" + uuid.uuid4().hex[:12],
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": "local",
        "choices": [{"index": 0, "delta": {"content": text}, "finish_reason": None}],
    }
    sys.stdout.write("data: " + json.dumps(payload, ensure_ascii=False) + "\n\n")
    sys.stdout.flush()


def _sse_error(message: str) -> None:
    payload = {
        "error": {"message": str(message), "type": "local_inference_error"},
    }
    sys.stdout.write("data: " + json.dumps(payload, ensure_ascii=False) + "\n\n")
    sys.stdout.write("data: [DONE]\n\n")
    sys.stdout.flush()


def _sse_done() -> None:
    sys.stdout.write("data: [DONE]\n\n")
    sys.stdout.flush()


def _emit_failure(err: Dict[str, Any], stream: bool) -> None:
    inner = err.get("error")
    if isinstance(inner, dict):
        msg = str(inner.get("message") or "本地推理失败")
    elif isinstance(inner, str):
        msg = inner
    else:
        msg = "本地推理失败"
    if stream:
        _sse_error(msg)
    else:
        sys.stdout.write(json.dumps(err, ensure_ascii=False))
        sys.stdout.flush()


def _llama_cpp_import_error() -> Optional[str]:
    try:
        import llama_cpp  # noqa: F401

        return None
    except Exception as exc:
        return f"{type(exc).__name__}: {exc}"


def _has_llama_cpp() -> bool:
    return _llama_cpp_import_error() is None


def _has_transformers() -> bool:
    try:
        import transformers  # noqa: F401
        import torch  # noqa: F401

        return True
    except Exception:
        return importlib_available("transformers") and importlib_available("torch")


def importlib_available(name: str) -> bool:
    try:
        import importlib.util

        return importlib.util.find_spec(name) is not None
    except Exception:
        return False


def _is_under_diffusers_tree(path: str) -> bool:
    """Skip SD/Diffusers component weights in chat scan / 对话扫描跳过 Diffusers 组件权重."""
    cur = path
    for _ in range(8):
        if os.path.isfile(os.path.join(cur, "model_index.json")):
            return True
        parent = os.path.dirname(cur)
        if not parent or parent == cur:
            break
        cur = parent
    return False


def _walk_models(models_dir: str) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    if not models_dir or not os.path.isdir(models_dir):
        return out

    skip_name_prefixes = ("mmproj-", "mmproj.")

    for root, _dirs, files in os.walk(models_dir):
        # Diffusers 目录（含 model_index.json）交给 Image Runtime，不进对话模型列表
        if os.path.isfile(os.path.join(root, "model_index.json")):
            _dirs[:] = []
            continue
        if _is_under_diffusers_tree(root):
            continue

        for fname in files:
            lower = fname.lower()
            if any(lower.startswith(p) for p in skip_name_prefixes):
                continue
            full = os.path.join(root, fname)
            rel = os.path.relpath(full, models_dir).replace("\\", "/")
            model_id = rel

            if lower.endswith(".gguf"):
                model_type = "chat"
                if "ti2v" in lower or "t2v" in lower or "i2v" in lower or lower.startswith("wan"):
                    model_type = "video"
                out.append(
                    {
                        "id": model_id,
                        "path": full,
                        "format": "gguf",
                        "type": model_type,
                        "label": fname,
                        "runtime": "comfyui-gguf" if model_type == "video" else "llama-cpp",
                    }
                )
                continue

            # 跳过扩散单文件权重文件名；完整单文件 checkpoint 留给 Image Runtime
            if lower.endswith((".safetensors", ".ckpt")) and (
                "diffusion_pytorch" in lower
                or lower in ("unet.safetensors", "vae.safetensors")
            ):
                continue

            if lower.endswith(".safetensors") and lower != "model.safetensors":
                cfg = os.path.join(root, "config.json")
                if os.path.isfile(cfg) and not _is_under_diffusers_tree(root):
                    out.append(
                        {
                            "id": model_id,
                            "path": root,
                            "format": "safetensors",
                            "type": "chat",
                            "label": os.path.basename(root) + "/" + fname,
                        }
                    )

        if "model.safetensors" in files and os.path.isfile(os.path.join(root, "config.json")):
            if _is_under_diffusers_tree(root):
                continue
            full = root
            rel = os.path.relpath(full, models_dir).replace("\\", "/")
            if not any(x["id"] == rel for x in out):
                out.append(
                    {
                        "id": rel,
                        "path": full,
                        "format": "safetensors",
                        "type": "chat",
                        "label": os.path.basename(root),
                    }
                )

    out.sort(key=lambda x: str(x.get("id", "")))
    return out


def _normalize_chat_messages(messages: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    out: List[Dict[str, str]] = []
    for m in messages:
        if not isinstance(m, dict):
            continue
        role = str(m.get("role") or "user").strip().lower()
        if role not in ("system", "user", "assistant"):
            role = "user"
        content = m.get("content")
        if isinstance(content, list):
            parts: List[str] = []
            for part in content:
                if isinstance(part, dict) and part.get("type") == "text":
                    parts.append(str(part.get("text") or ""))
            content = "\n".join([p for p in parts if p])
        text = str(content or "").strip()
        if not text:
            continue
        out.append({"role": role, "content": text})
    return out


def _format_messages(messages: List[Dict[str, Any]]) -> str:
    parts: List[str] = []
    for m in messages:
        role = str(m.get("role") or "user").strip().lower()
        content = str(m.get("content") or "").strip()
        if not content:
            continue
        if role == "system":
            parts.append(f"[System]\n{content}\n")
        elif role == "assistant":
            parts.append(f"[Assistant]\n{content}\n")
        else:
            parts.append(f"[User]\n{content}\n")
    parts.append("[Assistant]\n")
    return "\n".join(parts)


def _resolve_model(models_dir: str, model_id: str) -> Optional[Dict[str, Any]]:
    models = _walk_models(models_dir)
    for m in models:
        if str(m.get("id")) == model_id:
            return m
    # 兼容仅传文件名
    for m in models:
        if str(m.get("id", "")).endswith("/" + model_id) or str(m.get("label")) == model_id:
            return m
    return None


def _cpu_count() -> int:
    try:
        n = os.cpu_count() or 4
    except Exception:
        n = 4
    return max(1, min(int(n), 16))


_LLM_CACHE: Dict[str, Any] = {}
_LLM_CACHE_LOCK = None


def _get_llm_cache_lock():
    global _LLM_CACHE_LOCK
    if _LLM_CACHE_LOCK is None:
        import threading

        _LLM_CACHE_LOCK = threading.Lock()
    return _LLM_CACHE_LOCK


def _sse_comment(text: str) -> None:
    # SSE 注释：刷新前端空闲计时，但不进入回答正文
    # SSE comment: keeps idle timer alive without polluting answer text
    msg = str(text or "").replace("\n", " ").strip()
    if not msg:
        return
    sys.stdout.write(f": {msg}\n\n")
    sys.stdout.flush()


def _guess_no_think(model_path: str) -> bool:
    """
    Qwen3 默认常开启 thinking，易占满 max_tokens 导致正文极短。
    Qwen3 often enables thinking by default, which can exhaust max_tokens.
    """
    env = str(os.getenv("ADACHAT_QWEN_NO_THINK", "1")).strip().lower()
    if env in ("0", "false", "no", "off"):
        return False
    name = str(model_path or "").lower()
    return "qwen3" in name or "qwen2.5" in name or "/qwen/" in name.replace("\\", "/")


def _apply_no_think_messages(messages: List[Dict[str, str]]) -> List[Dict[str, str]]:
    out = [dict(m) for m in messages]
    # 在最后一条 user 上附加 /no_think（Qwen 官方习惯）
    for i in range(len(out) - 1, -1, -1):
        if out[i].get("role") == "user":
            content = str(out[i].get("content") or "")
            if "/no_think" not in content and "/think" not in content:
                out[i]["content"] = content.rstrip() + "\n/no_think"
            break
    return out


class _ThinkTagFilter:
    """流式过滤 <think>...</think>，避免思考链污染可见回答。"""

    def __init__(self) -> None:
        self._buf = ""
        self._in_think = False

    def feed(self, text: str) -> str:
        if not text:
            return ""
        self._buf += text
        out: List[str] = []
        while self._buf:
            if self._in_think:
                end = self._buf.find("</think>")
                if end < 0:
                    # 保留可能的不完整结尾标签
                    keep = min(len(self._buf), 8)
                    self._buf = self._buf[-keep:] if keep else ""
                    break
                self._buf = self._buf[end + len("</think>") :]
                self._in_think = False
                continue
            start = self._buf.find("<think>")
            if start < 0:
                # 可能是不完整开头
                lt = self._buf.rfind("<")
                if lt >= 0 and "think" in self._buf[lt:] and ">" not in self._buf[lt:]:
                    out.append(self._buf[:lt])
                    self._buf = self._buf[lt:]
                else:
                    out.append(self._buf)
                    self._buf = ""
                break
            out.append(self._buf[:start])
            self._buf = self._buf[start + len("<think>") :]
            self._in_think = True
        return "".join(out)

    def flush(self) -> str:
        if self._in_think:
            self._buf = ""
            return ""
        left = self._buf
        self._buf = ""
        return left


def _get_or_load_llama(model_path: str, progress_cb=None):
    """
    进程内缓存 Llama，配合常驻 worker 可避免每次冷启动。
    In-process Llama cache; with a persistent worker this avoids cold starts.
    """
    from llama_cpp import Llama

    lock = _get_llm_cache_lock()
    with lock:
        cached = _LLM_CACHE.get(model_path)
        if cached is not None:
            if progress_cb:
                progress_cb("已复用内存中的本地模型，开始生成…")
            return cached

        n_gpu_layers = int(os.getenv("ADACHAT_N_GPU_LAYERS", "-1"))
        n_ctx = int(os.getenv("ADACHAT_N_CTX", "4096"))
        n_threads = int(os.getenv("ADACHAT_N_THREADS", str(_cpu_count())))
        if progress_cb:
            progress_cb(
                f"正在加载本地模型（threads={n_threads}, ctx={n_ctx}, gpu_layers={n_gpu_layers}），"
                "首次可能需要数分钟，请耐心等待…"
            )

        stop_flag = {"stop": False}

        def _heartbeat():
            import time as _t

            elapsed = 0
            while not stop_flag["stop"]:
                _t.sleep(8)
                if stop_flag["stop"]:
                    break
                elapsed += 8
                if progress_cb:
                    progress_cb(f"模型仍在加载中… 已等待 {elapsed} 秒")

        import threading

        hb = threading.Thread(target=_heartbeat, daemon=True)
        hb.start()
        try:
            llm_kwargs: Dict[str, Any] = {
                "model_path": model_path,
                "n_ctx": max(512, n_ctx),
                "n_gpu_layers": n_gpu_layers,
                "n_threads": max(1, n_threads),
                "use_mmap": True,
                "use_mlock": False,
                "verbose": False,
            }
            name = model_path.lower()
            chat_format = None
            if "qwen" in name:
                chat_format = "qwen"
            elif "gemma" in name:
                chat_format = "gemma"
            elif "llama-3" in name or "llama3" in name:
                chat_format = "llama-3"
            try:
                if chat_format:
                    llm = Llama(**{**llm_kwargs, "chat_format": chat_format})
                else:
                    llm = Llama(**llm_kwargs)
            except Exception:
                # 模板名不兼容时回退到 GGUF 内置模板
                llm = Llama(**llm_kwargs)
        finally:
            stop_flag["stop"] = True

        _LLM_CACHE[model_path] = llm
        if progress_cb:
            progress_cb("模型加载完成，开始生成…")
        return llm


def _stream_gguf(
    model_path: str,
    messages: List[Dict[str, Any]],
    temperature: float,
    max_tokens: int,
) -> Generator[str, None, None]:
    import queue
    import threading

    msgs = _normalize_chat_messages(messages)
    if not msgs:
        msgs = [{"role": "user", "content": "你好"}]
    if _guess_no_think(model_path):
        msgs = _apply_no_think_messages(msgs)

    # 本地无计费额度：max_tokens 仅作生成长度上限，默认给足，封顶受 ctx 约束
    # Local has no billing quota: max_tokens is only a length cap (ctx-bounded)
    requested = int(max_tokens or 0)
    if requested <= 0:
        requested = 4096
    gen_max = max(256, min(requested, 8192))

    q: "queue.Queue[tuple[str, Any]]" = queue.Queue()

    def progress_cb(msg: str) -> None:
        q.put(("progress", msg))

    def loader() -> None:
        try:
            llm = _get_or_load_llama(model_path, progress_cb=progress_cb)
            q.put(("ready", llm))
        except Exception as exc:
            q.put(("error", exc))

    threading.Thread(target=loader, daemon=True).start()
    llm = None
    while llm is None:
        kind, payload = q.get()
        if kind == "progress":
            # 进度走注释通道（由上层决定如何发）；这里先 yield 特殊前缀
            yield "\x00PROGRESS:" + str(payload)
        elif kind == "ready":
            llm = payload
        elif kind == "error":
            raise payload

    chat_stream = llm.create_chat_completion(
        messages=msgs,
        max_tokens=gen_max,
        temperature=max(0.0, min(temperature, 2.0)),
        stream=True,
    )
    think_filter = _ThinkTagFilter()
    finish_reason = None
    for chunk in chat_stream:
        text = ""
        try:
            choice0 = chunk["choices"][0]
            delta = choice0.get("delta") or {}
            text = str(delta.get("content") or "")
            fr = choice0.get("finish_reason")
            if fr:
                finish_reason = fr
        except Exception:
            text = ""
        visible = think_filter.feed(text)
        if visible:
            yield visible
    tail = think_filter.flush()
    if tail:
        yield tail
    if finish_reason == "length":
        yield (
            "\n\n（回复达到本次生成长度上限。"
            "本地模型无额度限制；若需更长回答，可在设置 → 模型总设置 调高 Max Tokens。）"
        )


def _stream_safetensors(model_dir: str, prompt: str, temperature: float, max_tokens: int) -> Generator[str, None, None]:
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(model_dir, trust_remote_code=True)
    model = AutoModelForCausalLM.from_pretrained(
        model_dir,
        torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
        device_map="auto" if torch.cuda.is_available() else None,
        trust_remote_code=True,
    )
    inputs = tokenizer(prompt, return_tensors="pt")
    if torch.cuda.is_available():
        inputs = {k: v.cuda() for k, v in inputs.items()}

    gen = model.generate(
        **inputs,
        max_new_tokens=max(16, min(max_tokens, 2048)),
        temperature=max(0.1, min(temperature, 2.0)),
        do_sample=temperature > 0.05,
        pad_token_id=tokenizer.eos_token_id,
    )
    new_tokens = gen[0][inputs["input_ids"].shape[-1] :]
    text = tokenizer.decode(new_tokens, skip_special_tokens=True)
    # safetensors 路径暂以整段输出模拟流式
    step = 24
    for i in range(0, len(text), step):
        yield text[i : i + step]


def cmd_scan(args: argparse.Namespace) -> int:
    models = _walk_models(args.models_dir)
    return _json_out(
        {
            "success": True,
            "models": models,
            "count": len(models),
            "models_dir": args.models_dir,
        }
    )


def cmd_doctor(_args: argparse.Namespace) -> int:
    llama_err = _llama_cpp_import_error()
    has_llama = llama_err is None
    has_jinja = importlib_available("jinja2")
    ready = (has_llama and has_jinja) or _has_transformers()
    return _json_out(
        {
            "success": True,
            "llama_cpp": has_llama,
            "llama_cpp_error": llama_err,
            "jinja2": has_jinja,
            "transformers": _has_transformers(),
            "torch": importlib_available("torch"),
            "ready": ready,
            "python": sys.executable,
            "sys_path_head": sys.path[:8],
            "hint": "pip install -r requirements-local-inference.txt",
        }
    )


def cmd_chat(args: argparse.Namespace) -> int:
    req_path = str(args.request_file or "").strip()
    if not req_path or not os.path.isfile(req_path):
        sys.stderr.write("missing request file\n")
        return 1

    with open(req_path, "r", encoding="utf-8-sig") as f:
        req = json.load(f)

    models_dir = str(req.get("models_dir") or args.models_dir or "").strip()
    model_id = str(req.get("model_id") or "").strip()
    messages = req.get("messages") if isinstance(req.get("messages"), list) else []
    stream = bool(req.get("stream", True))
    temperature = float(req.get("temperature", 0.7) or 0.7)
    max_tokens = int(req.get("max_tokens", 512) or 512)

    model = _resolve_model(models_dir, model_id)
    if not model:
        err = {
            "error": {
                "message": f"本地模型未找到: {model_id}。请将 .gguf 或 safetensors 放入 {models_dir} 后重新扫描。",
                "type": "model_not_found",
            }
        }
        _emit_failure(err, stream)
        return 1

    fmt = str(model.get("format") or "")
    path = str(model.get("path") or "")
    model_type = str(model.get("type") or "chat")
    if model_type == "video":
        err = {
            "error": {
                "message": (
                    f"「{model_id}」是文生视频模型（ComfyUI-GGUF / WAN），不能用于聊天。"
                    "请在 ComfyUI 中配合 UnetLoaderGGUF 使用，或放到 ComfyUI/models/unet/。"
                ),
                "type": "unsupported_video_model",
            }
        }
        _emit_failure(err, stream)
        return 1

    prompt = _format_messages(messages)

    try:
        if fmt == "gguf":
            llama_err = _llama_cpp_import_error()
            if llama_err is not None:
                raise RuntimeError(
                    "无法加载 llama-cpp-python"
                    f"（当前 Python: {sys.executable}）。"
                    f"原因: {llama_err}。"
                    "PowerShell 请执行: "
                    f'& "{sys.executable}" -m pip install llama-cpp-python'
                    "  或: pip install -r requirements-local-inference.txt"
                )
            generator = _stream_gguf(path, messages, temperature, max_tokens)
        elif fmt == "safetensors":
            if not _has_transformers():
                raise RuntimeError(
                    "未安装 transformers/torch"
                    f"（当前 Python: {sys.executable}）。"
                    "请执行: "
                    f'"{sys.executable}" -m pip install torch transformers'
                )
            generator = _stream_safetensors(path, prompt, temperature, max_tokens)
        else:
            raise RuntimeError(f"不支持的模型格式: {fmt}")

        if stream:
            for piece in generator:
                if isinstance(piece, str) and piece.startswith("\x00PROGRESS:"):
                    _sse_comment(piece[len("\x00PROGRESS:") :])
                    continue
                _sse_chunk(piece)
            _sse_done()
            return 0

        text_parts = []
        for piece in generator:
            if isinstance(piece, str) and piece.startswith("\x00PROGRESS:"):
                continue
            text_parts.append(piece)
        text = "".join(text_parts)
        _json_out(
            {
                "id": "local-" + uuid.uuid4().hex[:12],
                "object": "chat.completion",
                "choices": [{"message": {"role": "assistant", "content": text}}],
            }
        )
        return 0
    except Exception as exc:
        err = {"error": {"message": str(exc), "type": "local_inference_error"}}
        _emit_failure(err, stream)
        return 1


def cmd_serve(args: argparse.Namespace) -> int:
    """
    常驻本地推理服务：模型加载一次后复用，避免每次聊天冷启动。
    Persistent local inference server — load once, reuse across chats.
    """
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
    import traceback

    host = str(args.host or "127.0.0.1")
    port = int(args.port or 18765)

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt: str, *a: Any) -> None:
            sys.stderr.write("[local-worker] " + (fmt % a) + "\n")

        def _send(self, code: int, body: bytes, content_type: str) -> None:
            self.send_response(code)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self) -> None:  # noqa: N802
            if self.path.startswith("/health"):
                payload = {
                    "ok": True,
                    "cached_models": list(_LLM_CACHE.keys()),
                    "python": sys.executable,
                }
                raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
                self._send(200, raw, "application/json; charset=utf-8")
                return
            self._send(404, b'{"error":"not_found"}', "application/json")

        def do_POST(self) -> None:  # noqa: N802
            if not self.path.startswith("/chat"):
                self._send(404, b'{"error":"not_found"}', "application/json")
                return
            try:
                length = int(self.headers.get("Content-Length") or "0")
                raw = self.rfile.read(max(0, length))
                req = json.loads(raw.decode("utf-8"))
            except Exception as exc:
                self._send(
                    400,
                    json.dumps({"error": str(exc)}, ensure_ascii=False).encode("utf-8"),
                    "application/json; charset=utf-8",
                )
                return

            models_dir = str(req.get("models_dir") or "").strip()
            model_id = str(req.get("model_id") or "").strip()
            messages = req.get("messages") if isinstance(req.get("messages"), list) else []
            stream = bool(req.get("stream", True))
            temperature = float(req.get("temperature", 0.7) or 0.7)
            max_tokens = int(req.get("max_tokens", 512) or 512)

            model = _resolve_model(models_dir, model_id)
            if not model:
                self._send(
                    404,
                    json.dumps(
                        {"error": {"message": f"本地模型未找到: {model_id}"}},
                        ensure_ascii=False,
                    ).encode("utf-8"),
                    "application/json; charset=utf-8",
                )
                return

            path = str(model.get("path") or "")
            fmt = str(model.get("format") or "")
            if fmt != "gguf":
                self._send(
                    400,
                    json.dumps(
                        {"error": {"message": "worker 当前仅支持 GGUF"}},
                        ensure_ascii=False,
                    ).encode("utf-8"),
                    "application/json; charset=utf-8",
                )
                return

            try:
                if stream:
                    self.send_response(200)
                    self.send_header("Content-Type", "text/event-stream; charset=utf-8")
                    self.send_header("Cache-Control", "no-cache")
                    self.send_header("X-AdaChat-Local-Worker", "1")
                    self.end_headers()
                    for piece in _stream_gguf(path, messages, temperature, max_tokens):
                        if isinstance(piece, str) and piece.startswith("\x00PROGRESS:"):
                            msg = str(piece[len("\x00PROGRESS:") :]).replace("\n", " ").strip()
                            if msg:
                                self.wfile.write(f": {msg}\n\n".encode("utf-8"))
                                self.wfile.flush()
                            continue
                        payload = {
                            "id": "local-" + uuid.uuid4().hex[:12],
                            "object": "chat.completion.chunk",
                            "created": int(time.time()),
                            "model": "local",
                            "choices": [
                                {
                                    "index": 0,
                                    "delta": {"content": piece},
                                    "finish_reason": None,
                                }
                            ],
                        }
                        self.wfile.write(
                            ("data: " + json.dumps(payload, ensure_ascii=False) + "\n\n").encode(
                                "utf-8"
                            )
                        )
                        self.wfile.flush()
                    self.wfile.write(b"data: [DONE]\n\n")
                    self.wfile.flush()
                    return

                text_parts = []
                for piece in _stream_gguf(path, messages, temperature, max_tokens):
                    if isinstance(piece, str) and piece.startswith("\x00PROGRESS:"):
                        continue
                    text_parts.append(piece)
                text = "".join(text_parts)
                body = {
                    "id": "local-" + uuid.uuid4().hex[:12],
                    "object": "chat.completion",
                    "choices": [{"message": {"role": "assistant", "content": text}}],
                }
                self._send(
                    200,
                    json.dumps(body, ensure_ascii=False).encode("utf-8"),
                    "application/json; charset=utf-8",
                )
            except Exception as exc:
                err = {"error": {"message": str(exc), "type": "local_inference_error"}}
                detail = traceback.format_exc()
                sys.stderr.write(detail + "\n")
                if stream and not self.wfile.closed:
                    try:
                        self.wfile.write(
                            (
                                "data: "
                                + json.dumps(err, ensure_ascii=False)
                                + "\n\ndata: [DONE]\n\n"
                            ).encode("utf-8")
                        )
                        self.wfile.flush()
                    except Exception:
                        pass
                else:
                    self._send(
                        500,
                        json.dumps(err, ensure_ascii=False).encode("utf-8"),
                        "application/json; charset=utf-8",
                    )

    sys.stderr.write(f"[local-worker] listening on http://{host}:{port}\n")
    httpd = ThreadingHTTPServer((host, port), Handler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_scan = sub.add_parser("scan")
    p_scan.add_argument("--models-dir", required=True)
    p_scan.set_defaults(func=cmd_scan)

    p_doc = sub.add_parser("doctor")
    p_doc.set_defaults(func=cmd_doctor)

    p_chat = sub.add_parser("chat")
    p_chat.add_argument("--models-dir", default="")
    p_chat.add_argument("--request-file", required=True)
    p_chat.set_defaults(func=cmd_chat)

    p_serve = sub.add_parser("serve")
    p_serve.add_argument("--host", default="127.0.0.1")
    p_serve.add_argument("--port", type=int, default=18765)
    p_serve.set_defaults(func=cmd_serve)

    args = parser.parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
