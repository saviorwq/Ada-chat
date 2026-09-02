#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only
"""
Demucs 四轨分轨 → DAW 用 WAV ZIP
Separate mix into drums/bass/other/vocals WAV stems and zip for DAW import.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path


STEM_ORDER = (
    ("drums", "01_drums.wav"),
    ("bass", "02_bass.wav"),
    ("other", "03_other.wav"),
    ("vocals", "04_vocals.wav"),
)


def _mix_wavs_ffmpeg(ffmpeg: str, inputs: list[Path], dest: Path) -> None:
    """Sum aligned WAV stems with ffmpeg amix (same length from Demucs)."""
    if not inputs:
        raise ValueError("no_inputs")
    cmd = [ffmpeg, "-y"]
    for p in inputs:
        cmd += ["-i", str(p)]
    n = len(inputs)
    cmd += [
        "-filter_complex",
        f"amix=inputs={n}:duration=longest:dropout_transition=0:normalize=0",
        "-ac",
        "2",
        str(dest),
    ]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0 or not dest.is_file():
        raise RuntimeError((r.stderr or r.stdout or "amix_failed")[-800:])


def _add_convenience_stems(pack_dir: Path) -> None:
    """
    额外打包：仅人声 / 仅伴奏（鼓+贝斯+其它），方便不进 DAW 也能用
    Also pack vocals-only + instrumental (drums+bass+other)
    """
    vocals = pack_dir / "04_vocals.wav"
    if vocals.is_file():
        shutil.copy2(vocals, pack_dir / "05_vocals_only.wav")
    parts = [
        pack_dir / "01_drums.wav",
        pack_dir / "02_bass.wav",
        pack_dir / "03_other.wav",
    ]
    present = [p for p in parts if p.is_file()]
    if not present:
        return
    dest = pack_dir / "06_instrumental.wav"
    ff = _which_ffmpeg()
    if not ff:
        return
    try:
        _mix_wavs_ffmpeg(ff, present, dest)
    except Exception:
        # 非致命：四轨仍可用 / Non-fatal: 4 stems still usable
        pass


def _sanitize_windows_path() -> None:
    """
    Ada/PHP worker 常精简 PATH，导致 torch→asyncio→_overlapped 报 WinError 10106。
    Put System32 first so Winsock providers load correctly under Ada's trimmed PATH.
    """
    if os.name != "nt":
        return
    sysroot = os.environ.get("SystemRoot") or r"C:\Windows"
    essentials = [
        rf"{sysroot}\System32",
        sysroot,
        rf"{sysroot}\System32\Wbem",
        rf"{sysroot}\System32\WindowsPowerShell\v1.0",
        rf"{sysroot}\System32\OpenSSH",
    ]
    scripts = str(Path(sys.executable).resolve().parent)
    essentials.append(scripts)
    old = os.environ.get("PATH", "")
    parts: list[str] = []
    seen: set[str] = set()
    for p in essentials + [x for x in old.split(";") if x.strip()]:
        key = p.strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        parts.append(p.strip())
    os.environ["PATH"] = ";".join(parts)
    os.environ.setdefault("NO_PROXY", "127.0.0.1,localhost")
    os.environ.setdefault("no_proxy", "127.0.0.1,localhost")


def _write_status(path: Path | None, **payload) -> None:
    if not path:
        return
    try:
        path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except OSError:
        pass


def _which_ffmpeg() -> str | None:
    return shutil.which("ffmpeg")


def _ensure_wav_mix(src: Path, dest_wav: Path) -> None:
    """Copy/convert source mix to WAV for DAW (prefer ffmpeg)."""
    if src.suffix.lower() == ".wav":
        shutil.copy2(src, dest_wav)
        return
    ffmpeg = _which_ffmpeg()
    if not ffmpeg:
        # Demucs may have already decoded; fall back to copy with .wav name only if needed
        raise RuntimeError("ffmpeg_missing: need ffmpeg to convert mix to WAV")
    cmd = [
        ffmpeg,
        "-y",
        "-i",
        str(src),
        "-acodec",
        "pcm_s16le",
        "-ar",
        "44100",
        str(dest_wav),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, env=os.environ.copy())
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg_mix_failed: {(proc.stderr or proc.stdout)[-800:]}")


def _run_demucs(
    input_path: Path,
    out_root: Path,
    model: str,
    device: str,
    jobs: int,
) -> Path:
    """
    Run demucs.separate; returns directory containing {drums,bass,other,vocals}.wav
    """
    # Prefer module entry to avoid PATH scripts issues under Ada
    cmd = [
        sys.executable,
        "-m",
        "demucs",
        "--out",
        str(out_root),
        "-n",
        model,
        "-d",
        device,
        "-j",
        str(max(1, jobs)),
        str(input_path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, env=os.environ.copy())
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "").strip()
        raise RuntimeError(f"demucs_failed({proc.returncode}): {err[-2000:]}")

    # demucs layout: out_root/<model>/<stem_name>/*.wav
    model_dir = out_root / model
    if not model_dir.is_dir():
        # some versions nest differently
        candidates = [p for p in out_root.rglob("vocals.wav")]
        if not candidates:
            raise RuntimeError("demucs_no_output: vocals.wav not found")
        return candidates[0].parent

    track_dirs = [p for p in model_dir.iterdir() if p.is_dir()]
    if not track_dirs:
        raise RuntimeError(f"demucs_no_track_dir under {model_dir}")
    # Prefer folder matching input stem
    prefer = input_path.stem
    for d in track_dirs:
        if d.name == prefer:
            return d
    return track_dirs[0]


def main() -> int:
    _sanitize_windows_path()

    ap = argparse.ArgumentParser(description="AdaChat Demucs stem export for DAW")
    ap.add_argument("--input", required=True, help="Source mix path (mp3/wav/…)")
    ap.add_argument("--zip", required=True, help="Output ZIP path")
    ap.add_argument("--work-dir", default="", help="Scratch directory (optional)")
    ap.add_argument("--model", default="htdemucs", help="Demucs model name")
    ap.add_argument("--device", default="cpu", help="cpu / cuda / mps")
    ap.add_argument("--jobs", type=int, default=2, help="Demucs -j workers")
    ap.add_argument("--status-file", default="", help="JSON progress file")
    ap.add_argument("--include-mix", action="store_true", default=True)
    ap.add_argument("--no-mix", action="store_true", help="Skip 00_mix.wav in ZIP")
    args = ap.parse_args()

    status_path = Path(args.status_file) if args.status_file else None
    input_path = Path(args.input).resolve()
    zip_path = Path(args.zip).resolve()
    if not input_path.is_file():
        _write_status(status_path, ok=False, error=f"input_missing:{input_path}")
        print(json.dumps({"ok": False, "error": f"input_missing:{input_path}"}))
        return 2

    work = Path(args.work_dir) if args.work_dir else Path(tempfile.mkdtemp(prefix="adachat_stems_"))
    work.mkdir(parents=True, exist_ok=True)
    demucs_out = work / "demucs_out"
    pack_dir = work / "pack"
    demucs_out.mkdir(parents=True, exist_ok=True)
    pack_dir.mkdir(parents=True, exist_ok=True)

    try:
        _write_status(status_path, ok=True, stage="demucs", progress=10)
        stem_dir = _run_demucs(
            input_path,
            demucs_out,
            model=str(args.model),
            device=str(args.device),
            jobs=int(args.jobs),
        )
        _write_status(status_path, ok=True, stage="pack", progress=70, stem_dir=str(stem_dir))

        include_mix = bool(args.include_mix) and not bool(args.no_mix)
        if include_mix:
            mix_wav = pack_dir / "00_mix.wav"
            try:
                _ensure_wav_mix(input_path, mix_wav)
            except Exception as e:
                # Non-fatal: still export stems
                _write_status(
                    status_path,
                    ok=True,
                    stage="pack",
                    progress=75,
                    mix_warning=str(e),
                )

        missing = []
        for src_name, dest_name in STEM_ORDER:
            src = stem_dir / f"{src_name}.wav"
            if not src.is_file():
                missing.append(src_name)
                continue
            shutil.copy2(src, pack_dir / dest_name)
        if missing:
            raise RuntimeError(f"missing_stems:{','.join(missing)}")

        _add_convenience_stems(pack_dir)

        zip_path.parent.mkdir(parents=True, exist_ok=True)
        if zip_path.is_file():
            zip_path.unlink()
        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for f in sorted(pack_dir.glob("*.wav")):
                zf.write(f, arcname=f.name)
            readme = (
                "AdaChat Demucs stems for DAW\n"
                "Tracks (aligned):\n"
                "  00_mix.wav           — original mix (WAV)\n"
                "  01_drums.wav         — drums\n"
                "  02_bass.wav          — bass\n"
                "  03_other.wav         — other / accompaniment texture\n"
                "  04_vocals.wav        — vocals\n"
                "  05_vocals_only.wav   — same as vocals (quick solo use)\n"
                "  06_instrumental.wav  — drums+bass+other (no vocals)\n"
                f"Model: {args.model}\n"
                "Import WAVs into your DAW on the same start position.\n"
                "中文：四轨对齐；05=仅人声，06=仅伴奏（无人声）。\n"
            )
            zf.writestr("README.txt", readme)

        result = {
            "ok": True,
            "zip": str(zip_path),
            "stems": [d for _, d in STEM_ORDER],
            "model": args.model,
            "device": args.device,
        }
        _write_status(status_path, progress=100, stage="done", **result)
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except Exception as e:
        err = str(e)
        _write_status(status_path, ok=False, error=err, progress=100, stage="failed")
        print(json.dumps({"ok": False, "error": err}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
