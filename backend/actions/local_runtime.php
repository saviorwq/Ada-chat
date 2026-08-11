<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * Local Runtime Manager — ai_proxy actions
 * （避免与 actions/runtime.php 引导文件重名）
 */

require_once __DIR__ . '/../runtime/entry.php';
require_once __DIR__ . '/../json.php';

function adachat_handle_local_runtime_actions(string $action): bool
{
    if ($action === 'runtime_status') {
        adachat_json([
            'success' => true,
            'runtime' => adachat_runtime_build_status(),
        ]);
    }

    if ($action === 'runtime_scan') {
        $input = json_decode((string) file_get_contents('php://input'), true);
        $modelsDir = null;
        if (is_array($input) && isset($input['models_dir'])) {
            $modelsDir = (string) $input['models_dir'];
        } elseif (isset($_GET['models_dir'])) {
            $modelsDir = (string) $_GET['models_dir'];
        }
        $result = adachat_runtime_scan_all($modelsDir);
        adachat_json($result);
    }

    if ($action === 'runtime_jobs') {
        $limit = isset($_GET['limit']) ? (int) $_GET['limit'] : 30;
        if ($limit < 1) {
            $limit = 30;
        }
        if ($limit > 100) {
            $limit = 100;
        }
        adachat_json(adachat_runtime_list_recent_jobs($limit));
    }

    if ($action === 'runtime_prepare') {
        $input = json_decode((string) file_get_contents('php://input'), true);
        $modality = is_array($input) ? (string) ($input['modality'] ?? 'image') : 'image';
        if (isset($_GET['modality']) && trim((string) $_GET['modality']) !== '') {
            $modality = (string) $_GET['modality'];
        }
        $ret = adachat_runtime_prepare($modality);
        adachat_json([
            'success' => (bool) ($ret['ok'] ?? false),
            'result' => $ret,
        ], !empty($ret['ok']) ? 200 : 400);
    }

    if ($action === 'runtime_release') {
        $input = json_decode((string) file_get_contents('php://input'), true);
        $modality = is_array($input) ? (string) ($input['modality'] ?? 'image') : 'image';
        if (isset($_GET['modality']) && trim((string) $_GET['modality']) !== '') {
            $modality = (string) $_GET['modality'];
        }
        $ret = adachat_runtime_release($modality);
        adachat_json([
            'success' => (bool) ($ret['ok'] ?? false),
            'result' => $ret,
        ], !empty($ret['ok']) ? 200 : 400);
    }

    return false;
}
