<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * RAG 相关 action 路由（模块化）
 * RAG-related action routes (module)
 */

require_once __DIR__ . '/../rag_store.php';
require_once __DIR__ . '/../rag_exec.php';
require_once __DIR__ . '/../rag_features.php';
require_once __DIR__ . '/../json.php';

function adachat_handle_rag_actions(string $action): bool
{
    // 获取 RAG 知识库（服务端存储）
    if ($action === 'get_rag_store') {
        $store = adachat_load_rag_store();
        adachat_json([
            'success' => true,
            'store' => $store,
            'stats' => adachat_rag_store_stats($store),
        ]);
    }

    // 保存 RAG 知识库（服务端存储）
    if ($action === 'save_rag_store') {
        $input = json_decode((string) file_get_contents('php://input'), true);
        if (!is_array($input) || !isset($input['store'])) {
            adachat_json(['success' => false, 'error' => '无效数据']);
        }
        $ok = adachat_save_rag_store($input['store']);
        if (!$ok) {
            adachat_json(['success' => false, 'error' => '写入失败']);
        }
        $store = adachat_load_rag_store();
        adachat_json([
            'success' => true,
            'store' => $store,
            'stats' => adachat_rag_store_stats($store),
        ]);
    }

    // 手动重建向量索引（Ollama embedding + Chroma）
    if ($action === 'rag_rebuild_index') {
        $input = json_decode((string) file_get_contents('php://input'), true);
        $embedModel = trim((string) (($input['embed_model'] ?? null) ?: 'qwen3-embedding:0.6b'));
        $ret = adachat_run_rag_vector_bridge('rebuild', [
            '--embed-model' => $embedModel,
        ]);
        if (empty($ret['ok'])) {
            adachat_json([
                'success' => false,
                'error' => $ret['error'] ?? 'rebuild_failed',
                'detail' => $ret['detail'] ?? null,
                'hint' => '若在 Windows 服务进程下找不到 py/python，请在系统环境变量中配置 Python 或设置 RAG_PYTHON_BIN。'
            ]);
        }
        adachat_json(['success' => true, 'result' => ($ret['data'] ?? [])]);
    }

    // 查询向量RAG运行状态（Python/chromadb/ollama）
    if ($action === 'rag_vector_status') {
        $ret = adachat_run_rag_vector_bridge('doctor', []);
        if (empty($ret['ok'])) {
            adachat_json([
                'success' => false,
                'error' => $ret['error'] ?? 'status_failed',
                'detail' => $ret['detail'] ?? null,
            ]);
        }
        adachat_json(['success' => true, 'status' => ($ret['data'] ?? [])]);
    }

    // 一键安装向量依赖（chromadb）
    if ($action === 'rag_vector_install_deps') {
        $install = adachat_install_rag_vector_deps();
        if (empty($install['ok'])) {
            adachat_json([
                'success' => false,
                'error' => $install['error'] ?? 'install_failed',
                'detail' => $install['detail'] ?? null,
                'hint' => '请在服务器终端手动执行其一: python3 -m pip install chromadb 或 python -m pip install chromadb；也可配置环境变量 RAG_PYTHON_BIN 指向 python 可执行文件。'
            ]);
        }
        $ret = adachat_run_rag_vector_bridge('doctor', []);
        adachat_json([
            'success' => true,
            'installed_with' => $install['cmd'] ?? '',
            'status' => !empty($ret['ok']) ? ($ret['data'] ?? []) : null,
        ]);
    }

    return false;
}

