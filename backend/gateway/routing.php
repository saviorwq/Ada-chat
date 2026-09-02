<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 网关路由辅助（模块化）
 * Gateway routing helpers (module)
 */

function adachat_gateway_select_api_path(string $task, array $provider, string $mode = ''): string {
    switch ($task) {
        case 'chat':
            return (string) ($provider['chat_path'] ?? '/chat/completions');
        case 'image':
            if ($mode === 'text2img') {
                return (string) ($provider['image_gen_path'] ?? '/images/generations');
            }
            return (string) ($provider['image_edit_path'] ?? '/images/edits');
        case 'video':
            return (string) ($provider['video_path'] ?? '/videos/generations');
        case 'music':
            return '/release_task';
        default:
            return '';
    }
}

function adachat_gateway_force_stream_for_task(string $task, bool $stream): bool {
    // 图像/视频/音乐生成一般不支持流式，保持旧行为：强制关闭。
    if ($task === 'image' || $task === 'video' || $task === 'music') return false;
    return $stream;
}

