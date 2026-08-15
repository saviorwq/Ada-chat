<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 角色档案库 API（调用 face_identity.cli）
 * Character library actions via Python CLI
 */

require_once __DIR__ . '/../json.php';
require_once __DIR__ . '/../utils.php';
require_once __DIR__ . '/../rag_exec.php';
require_once __DIR__ . '/../image/jobs.php';

function adachat_face_identity_cli_path(): string
{
    return dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'face_identity' . DIRECTORY_SEPARATOR . 'cli.py';
}

/**
 * @param array<string, scalar|null> $args
 * @return array{ok:bool, data?:array, error?:string, raw?:string}
 */
function adachat_face_identity_run(string $subcmd, array $args = []): array
{
    $script = adachat_face_identity_cli_path();
    if (!is_file($script)) {
        return ['ok' => false, 'error' => 'face_identity/cli.py 缺失'];
    }
    $flat = [];
    foreach ($args as $k => $v) {
        if ($v === null || $v === '') {
            continue;
        }
        $flat['--' . $k] = $v;
    }
    $attempts = [];
    foreach (adachat_get_python_commands() as $py) {
        $cmd = adachat_build_command_line($py, $script, $subcmd, $flat);
        $lines = [];
        $code = 1;
        @exec($cmd, $lines, $code);
        $raw = trim(implode("\n", $lines));
        $attempts[] = ['exit' => $code, 'out' => adachat_usub($raw, 0, 500)];
        $parsed = adachat_parse_json_from_mixed_output($raw);
        if (!is_array($parsed)) {
            continue;
        }
        if (!empty($parsed['success'])) {
            return ['ok' => true, 'data' => $parsed];
        }
        return [
            'ok' => false,
            'error' => (string) ($parsed['error'] ?? 'cli_failed'),
            'data' => $parsed,
            'raw' => adachat_usub($raw, 0, 800),
        ];
    }
    return [
        'ok' => false,
        'error' => 'python_cli_failed',
        'raw' => json_encode($attempts, JSON_UNESCAPED_UNICODE),
    ];
}

function adachat_handle_character_actions(string $action): bool
{
    if ($action === 'list_characters') {
        $ret = adachat_face_identity_run('list');
        if (empty($ret['ok'])) {
            adachat_json(['success' => false, 'error' => $ret['error'] ?? 'list_failed', 'detail' => $ret], 500);
        }
        $data = $ret['data'] ?? [];
        adachat_json([
            'success' => true,
            'characters' => $data['characters'] ?? [],
            'library_root' => $data['library_root'] ?? '',
        ]);
    }

    if ($action === 'create_character') {
        $input = json_decode((string) file_get_contents('php://input'), true);
        if (!is_array($input)) {
            adachat_json(['success' => false, 'error' => 'bad_json'], 400);
        }
        $name = trim((string) ($input['char_name'] ?? $input['name'] ?? ''));
        $image = (string) ($input['image'] ?? $input['face_image'] ?? '');
        $tags = trim((string) ($input['tags'] ?? ''));
        if ($name === '' || trim($image) === '') {
            adachat_json(['success' => false, 'error' => '需要 char_name 与人脸图 image'], 400);
        }
        $tmpId = 'charup_' . bin2hex(random_bytes(6));
        $path = adachat_image_save_face_image($tmpId, $image);
        if ($path === null) {
            adachat_json(['success' => false, 'error' => '人脸图无效或过大'], 400);
        }
        $args = ['image' => $path, 'name' => $name];
        if ($tags !== '') {
            $args['tags'] = $tags;
        }
        $ret = adachat_face_identity_run('create', $args);
        @unlink($path);
        if (empty($ret['ok'])) {
            adachat_json([
                'success' => false,
                'error' => $ret['error'] ?? 'create_failed',
                'detail' => $ret['data'] ?? null,
            ], 400);
        }
        adachat_json(['success' => true, 'character' => $ret['data']]);
    }

    if ($action === 'delete_character') {
        $cid = trim((string) ($_GET['cid'] ?? ''));
        if ($cid === '') {
            $input = json_decode((string) file_get_contents('php://input'), true);
            $cid = is_array($input) ? trim((string) ($input['cid'] ?? '')) : '';
        }
        if ($cid === '') {
            adachat_json(['success' => false, 'error' => '缺少 cid'], 400);
        }
        $ret = adachat_face_identity_run('delete', ['cid' => $cid]);
        if (empty($ret['ok'])) {
            adachat_json(['success' => false, 'error' => $ret['error'] ?? 'delete_failed'], 400);
        }
        adachat_json(['success' => true, 'cid' => $cid]);
    }

    if ($action === 'rename_character') {
        $input = json_decode((string) file_get_contents('php://input'), true);
        $cid = is_array($input) ? trim((string) ($input['cid'] ?? '')) : '';
        $name = is_array($input) ? trim((string) ($input['char_name'] ?? $input['name'] ?? '')) : '';
        if ($cid === '' || $name === '') {
            adachat_json(['success' => false, 'error' => '需要 cid 与 name'], 400);
        }
        $ret = adachat_face_identity_run('rename', ['cid' => $cid, 'name' => $name]);
        if (empty($ret['ok'])) {
            adachat_json(['success' => false, 'error' => $ret['error'] ?? 'rename_failed'], 400);
        }
        adachat_json(['success' => true, 'character' => $ret['data']]);
    }

    return false;
}
