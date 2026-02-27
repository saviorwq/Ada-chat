<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * CYOA 数据存储 API
 * CYOA 游戏数据存储 API（需登录 + CSRF 验证）
 */

// 错误报告设置
error_reporting(E_ALL);
ini_set('display_errors', 0);

// 设置JSON头
header('Content-Type: application/json');

require_once(__DIR__ . '/ai_config.php');

session_name('ADASESSID');
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

if (!isset($_SESSION['loggedin']) || $_SESSION['loggedin'] !== true) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Unauthorized']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $csrfToken = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (empty($_SESSION['csrf_token']) || !hash_equals($_SESSION['csrf_token'], $csrfToken)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'CSRF token mismatch']);
        exit;
    }
}

// 插件后端路由（优先）：api.php?plugin=<id>&action=<action>
$pluginId = preg_replace('/[^a-zA-Z0-9_\-]/', '', $_GET['plugin'] ?? '');
if ($pluginId !== '') {
    $pluginDir = __DIR__ . '/plugins/' . $pluginId . '/';
    $backendFile = $pluginDir . 'backend.php';
    if (!is_dir($pluginDir) || !file_exists($backendFile)) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => '插件后端不存在']);
        exit;
    }

    if (!defined('PLUGIN_ID')) {
        define('PLUGIN_ID', $pluginId);
    }
    if (!defined('PLUGIN_DIR')) {
        define('PLUGIN_DIR', $pluginDir);
    }
    if (!defined('PLUGIN_ACTION')) {
        define('PLUGIN_ACTION', $_GET['action'] ?? '');
    }

    require $backendFile;
    exit;
}

// 设置JSON文件存储目录（在插件目录内）
define('CYOA_DATA_DIR', __DIR__ . '/plugins/cyoa/cyoa_games/');

// 确保目录存在
if (!is_dir(CYOA_DATA_DIR)) {
    if (!mkdir(CYOA_DATA_DIR, 0755, true)) {
        echo json_encode(['success' => false, 'error' => '无法创建数据目录']);
        exit;
    }
}

$action = isset($_GET['action']) ? $_GET['action'] : '';

switch ($action) {
    case 'save_game':
        // 保存游戏数据到JSON文件
        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input) {
            echo json_encode(['success' => false, 'error' => '无效的JSON数据']);
            exit;
        }
        
        $gameId = isset($input['id']) ? $input['id'] : '';
        if (!$gameId) {
            echo json_encode(['success' => false, 'error' => '游戏ID不能为空']);
            exit;
        }
        
        // 清理文件名
        $gameId = preg_replace('/[^a-zA-Z0-9_\-]/', '', $gameId);
        $filename = CYOA_DATA_DIR . $gameId . '.json';
        
        if (file_put_contents($filename, json_encode($input, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE))) {
            echo json_encode(['success' => true, 'id' => $gameId]);
        } else {
            echo json_encode(['success' => false, 'error' => '无法写入文件']);
        }
        break;
        
    case 'load_game':
        // 加载游戏JSON文件
        $gameId = isset($_GET['id']) ? $_GET['id'] : '';
        if (!$gameId) {
            echo json_encode(['success' => false, 'error' => '游戏ID不能为空']);
            exit;
        }
        
        $gameId = preg_replace('/[^a-zA-Z0-9_\-]/', '', $gameId);
        $filename = CYOA_DATA_DIR . $gameId . '.json';
        
        if (!file_exists($filename)) {
            echo json_encode(['success' => false, 'error' => '游戏不存在']);
            exit;
        }
        
        $content = file_get_contents($filename);
        if ($content === false) {
            echo json_encode(['success' => false, 'error' => '无法读取文件']);
            exit;
        }
        
        // 直接返回文件内容
        echo $content;
        break;
        
    case 'list_games':
        // 列出所有游戏
        $games = [];
        $files = glob(CYOA_DATA_DIR . '*.json');
        
        foreach ($files as $file) {
            $content = file_get_contents($file);
            if ($content) {
                $game = json_decode($content, true);
                if ($game && isset($game['id'])) {
                    $games[] = [
                        'id' => $game['id'],
                        'name' => isset($game['name']) ? $game['name'] : '未命名',
                        'author' => isset($game['author']) ? $game['author'] : '',
                        'version' => isset($game['version']) ? $game['version'] : '1.0',
                        'updatedAt' => isset($game['updatedAt']) ? $game['updatedAt'] : '',
                        'attributes' => isset($game['attributes']) ? count($game['attributes']) : 0,
                        'items' => isset($game['items']) ? count($game['items']) : 0,
                        'skills' => isset($game['skills']) ? count($game['skills']) : 0,
                        'quests' => isset($game['quests']) ? count($game['quests']) : 0,
                        'characters' => isset($game['characters']) ? count($game['characters']) : 0,
                        'scenes' => isset($game['scenes']) ? count($game['scenes']) : 0
                    ];
                }
            }
        }
        
        echo json_encode(['success' => true, 'games' => $games]);
        break;
        
    case 'delete_game':
        // 删除游戏
        $gameId = isset($_GET['id']) ? $_GET['id'] : '';
        if (!$gameId && $_SERVER['REQUEST_METHOD'] === 'POST') {
            $input = json_decode(file_get_contents('php://input'), true);
            $gameId = isset($input['id']) ? $input['id'] : '';
        }
        if (!$gameId) {
            echo json_encode(['success' => false, 'error' => '游戏ID不能为空']);
            exit;
        }
        
        $gameId = preg_replace('/[^a-zA-Z0-9_\-]/', '', $gameId);
        $filename = CYOA_DATA_DIR . $gameId . '.json';
        
        if (file_exists($filename)) {
            if (unlink($filename)) {
                echo json_encode(['success' => true]);
            } else {
                echo json_encode(['success' => false, 'error' => '无法删除文件']);
            }
        } else {
            echo json_encode(['success' => false, 'error' => '游戏不存在']);
        }
        break;
        
    default:
        echo json_encode(['success' => false, 'error' => '无效的操作']);
        break;
}
?>