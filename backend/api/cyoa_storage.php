<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * api.php：CYOA 游戏 JSON 存储（plugins/cyoa/cyoa_games/）
 * CYOA JSON storage API for api.php
 */

/**
 * CYOA JSON storage API (save/load/list/delete).
 * Exits after handling.
 */
function adachat_api_handle_cyoa_storage(string $workspaceRoot): void
{
    $cyoaDir =
        rtrim($workspaceRoot, "/\\")
        . DIRECTORY_SEPARATOR
        . 'plugins'
        . DIRECTORY_SEPARATOR
        . 'cyoa'
        . DIRECTORY_SEPARATOR
        . 'cyoa_games'
        . DIRECTORY_SEPARATOR;

    if (!is_dir($cyoaDir)) {
        if (!mkdir($cyoaDir, 0755, true)) {
            echo json_encode(['success' => false, 'error' => '无法创建数据目录'], JSON_UNESCAPED_UNICODE);
            exit;
        }
    }

    $action = isset($_GET['action']) ? (string) $_GET['action'] : '';

    switch ($action) {
        case 'save_game': {
            $input = json_decode((string) file_get_contents('php://input'), true);
            if (!is_array($input)) {
                echo json_encode(['success' => false, 'error' => '无效的JSON数据'], JSON_UNESCAPED_UNICODE);
                exit;
            }

            $gameId = isset($input['id']) ? (string) $input['id'] : '';
            if ($gameId === '') {
                echo json_encode(['success' => false, 'error' => '游戏ID不能为空'], JSON_UNESCAPED_UNICODE);
                exit;
            }

            $gameId = preg_replace('/[^a-zA-Z0-9_\-]/', '', $gameId);
            $filename = $cyoaDir . $gameId . '.json';

            $ok = file_put_contents($filename, json_encode($input, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            if ($ok !== false) {
                echo json_encode(['success' => true, 'id' => $gameId], JSON_UNESCAPED_UNICODE);
            } else {
                echo json_encode(['success' => false, 'error' => '无法写入文件'], JSON_UNESCAPED_UNICODE);
            }
            exit;
        }
        case 'load_game': {
            $gameId = isset($_GET['id']) ? (string) $_GET['id'] : '';
            if ($gameId === '') {
                echo json_encode(['success' => false, 'error' => '游戏ID不能为空'], JSON_UNESCAPED_UNICODE);
                exit;
            }

            $gameId = preg_replace('/[^a-zA-Z0-9_\-]/', '', $gameId);
            $filename = $cyoaDir . $gameId . '.json';
            if (!file_exists($filename)) {
                echo json_encode(['success' => false, 'error' => '游戏不存在'], JSON_UNESCAPED_UNICODE);
                exit;
            }

            $content = file_get_contents($filename);
            if ($content === false) {
                echo json_encode(['success' => false, 'error' => '无法读取文件'], JSON_UNESCAPED_UNICODE);
                exit;
            }

            echo $content;
            exit;
        }
        case 'list_games': {
            $games = [];
            $files = glob($cyoaDir . '*.json');
            if (is_array($files)) {
                foreach ($files as $file) {
                    $content = file_get_contents($file);
                    if (!$content) {
                        continue;
                    }
                    $game = json_decode($content, true);
                    if (!is_array($game) || !isset($game['id'])) {
                        continue;
                    }
                    $games[] = [
                        'id' => (string) $game['id'],
                        'name' => isset($game['name']) ? (string) $game['name'] : '未命名',
                        'author' => isset($game['author']) ? (string) $game['author'] : '',
                        'version' => isset($game['version']) ? (string) $game['version'] : '1.0',
                        'updatedAt' => isset($game['updatedAt']) ? (string) $game['updatedAt'] : '',
                        'attributes' =>
                            isset($game['attributes']) && is_array($game['attributes'])
                                ? count($game['attributes'])
                                : 0,
                        'items' =>
                            isset($game['items']) && is_array($game['items']) ? count($game['items']) : 0,
                        'skills' =>
                            isset($game['skills']) && is_array($game['skills']) ? count($game['skills']) : 0,
                        'quests' =>
                            isset($game['quests']) && is_array($game['quests']) ? count($game['quests']) : 0,
                        'characters' =>
                            isset($game['characters']) && is_array($game['characters'])
                                ? count($game['characters'])
                                : 0,
                        'scenes' =>
                            isset($game['scenes']) && is_array($game['scenes']) ? count($game['scenes']) : 0,
                    ];
                }
            }
            echo json_encode(['success' => true, 'games' => $games], JSON_UNESCAPED_UNICODE);
            exit;
        }
        case 'delete_game': {
            $gameId = isset($_GET['id']) ? (string) $_GET['id'] : '';
            if ($gameId === '' && ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
                $input = json_decode((string) file_get_contents('php://input'), true);
                $gameId = is_array($input) && isset($input['id']) ? (string) $input['id'] : '';
            }
            if ($gameId === '') {
                echo json_encode(['success' => false, 'error' => '游戏ID不能为空'], JSON_UNESCAPED_UNICODE);
                exit;
            }

            $gameId = preg_replace('/[^a-zA-Z0-9_\-]/', '', $gameId);
            $filename = $cyoaDir . $gameId . '.json';
            if (!file_exists($filename)) {
                echo json_encode(['success' => false, 'error' => '游戏不存在'], JSON_UNESCAPED_UNICODE);
                exit;
            }

            if (@unlink($filename)) {
                echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
            } else {
                echo json_encode(['success' => false, 'error' => '无法删除文件'], JSON_UNESCAPED_UNICODE);
            }
            exit;
        }
        default:
            echo json_encode(['success' => false, 'error' => '无效的操作'], JSON_UNESCAPED_UNICODE);
            exit;
    }
}
