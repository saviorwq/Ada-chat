<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * RAG 业务辅助（模块化）
 * RAG feature helpers (module)
 *
 * 依赖：
 * - backend/server_control.php: adachat_is_exec_available()
 * - backend/utils.php: adachat_usub()
 * - backend/rag_exec.php: adachat_get_python_commands()/adachat_run_rag_vector_bridge()
 */

/**
 * @return array{ok: bool, cmd?: string, output?: string, error?: string, detail?: array<string, mixed>}
 */
function adachat_install_rag_vector_deps(): array
{
    if (!adachat_is_exec_available()) {
        return ['ok' => false, 'error' => 'exec_disabled'];
    }
    $attempts = [];
    foreach (adachat_get_python_commands() as $pySpec) {
        $base = [escapeshellarg((string) $pySpec['exe'])];
        foreach (($pySpec['extra'] ?? []) as $e) {
            $base[] = escapeshellarg((string) $e);
        }
        $ensureCmd = implode(' ', $base) . ' -m ensurepip --upgrade 2>&1';
        @exec($ensureCmd, $dummy, $dummyCode);

        $installCmd = implode(' ', $base) . ' -m pip install chromadb 2>&1';
        $lines = [];
        $code = 1;
        @exec($installCmd, $lines, $code);
        $raw = trim(implode("\n", $lines));
        $attempts[] = [
            'cmd' => $installCmd,
            'exit_code' => $code,
            'output' => adachat_usub($raw, 0, 500),
        ];
        if ($code === 0) {
            return [
                'ok' => true,
                'cmd' => $installCmd,
                'output' => $raw,
            ];
        }
    }
    return [
        'ok' => false,
        'error' => 'install_failed',
        'detail' => ['attempts' => $attempts],
    ];
}

/**
 * 向量检索 + 引用元数据（供注入与前端透明化）
 * Vector retrieve + citation meta (for injection + UI transparency)
 *
 * @return array{prompt:string,hits:array}|null
 */
function adachat_build_vector_rag_retrieval(string $query, int $topK, int $maxChars, string $embedModel): ?array
{
    $ret = adachat_run_rag_vector_bridge('retrieve', [
        '--query' => $query,
        '--top-k' => max(1, $topK),
        '--max-chars' => max(600, $maxChars),
        '--embed-model' => $embedModel,
    ]);
    if (empty($ret['ok'])) {
        return null;
    }
    $data = $ret['data'] ?? [];
    $hits = $data['hits'] ?? [];
    if (!is_array($hits) || empty($hits)) {
        return null;
    }

    $refs = [];
    $hitMeta = [];
    foreach ($hits as $h) {
        $doc = trim((string) ($h['doc_name'] ?? 'doc'));
        $chunkIndex = (int) ($h['chunk_index'] ?? 0);
        $txt = trim((string) ($h['text'] ?? ''));
        if ($txt === '') {
            continue;
        }
        $refs[] = "【来源:{$doc}#" . ($chunkIndex + 1) . "】\n{$txt}";
        $hitMeta[] = [
            'docName' => $doc,
            'chunkIndex' => $chunkIndex,
            'preview' => function_exists('mb_substr')
                ? mb_substr($txt, 0, 160)
                : substr($txt, 0, 160),
            'score' => isset($h['score']) ? (float) $h['score'] : null,
        ];
    }
    if (empty($refs)) {
        return null;
    }
    return [
        'prompt' =>
            "以下是从本地知识库检索到的参考资料。回答时请优先参考这些内容；若资料不足，请明确说明并给出保守结论。\n\n"
            . implode("\n\n", $refs),
        'hits' => $hitMeta,
    ];
}

function adachat_build_vector_rag_system_prompt(string $query, int $topK, int $maxChars, string $embedModel): ?string
{
    $ret = adachat_build_vector_rag_retrieval($query, $topK, $maxChars, $embedModel);
    if (!$ret) {
        return null;
    }
    return (string) ($ret['prompt'] ?? '');
}

