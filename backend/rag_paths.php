<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * RAG 相关路径（模块化）
 * RAG path helpers (module)
 *
 * 依赖：ai_config.php 中 AI_DATA_DIR 常量
 */

function adachat_rag_vector_script_path(): string
{
    return __DIR__ . DIRECTORY_SEPARATOR . '..' . DIRECTORY_SEPARATOR . 'rag_vector_bridge.py';
}

function adachat_rag_vector_store_path(): string
{
    return AI_DATA_DIR . '/rag_store.json';
}

function adachat_rag_vector_db_dir(): string
{
    return AI_DATA_DIR . '/rag_vector_db';
}

