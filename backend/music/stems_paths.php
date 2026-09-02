<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * Demucs 四轨分轨路径 / Demucs stem paths
 */

function adachat_music_stems_jobs_dir(): string
{
    return AI_DATA_DIR . DIRECTORY_SEPARATOR . 'stem_jobs';
}

function adachat_music_stems_output_dir(): string
{
    return AI_DATA_DIR . DIRECTORY_SEPARATOR . 'generated_stems';
}

function adachat_music_stems_script_path(): string
{
    return dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'music_stems_demucs.py';
}

function adachat_music_stems_worker_script_path(): string
{
    return __DIR__ . DIRECTORY_SEPARATOR . 'run_stems_worker.php';
}

/** Demucs 专用 Python（tools/demucs/.venv） */
function adachat_music_stems_python(): string
{
    $env = trim((string) (getenv('ADACHAT_DEMUCS_PYTHON') ?: ''));
    if ($env !== '' && is_file($env)) {
        return $env;
    }
    $venv = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'tools' . DIRECTORY_SEPARATOR
        . 'demucs' . DIRECTORY_SEPARATOR . '.venv' . DIRECTORY_SEPARATOR
        . 'Scripts' . DIRECTORY_SEPARATOR . 'python.exe';
    if (is_file($venv)) {
        return $venv;
    }
    $venvUnix = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'tools' . DIRECTORY_SEPARATOR
        . 'demucs' . DIRECTORY_SEPARATOR . '.venv' . DIRECTORY_SEPARATOR
        . 'bin' . DIRECTORY_SEPARATOR . 'python';
    if (is_file($venvUnix)) {
        return $venvUnix;
    }
    return '';
}
