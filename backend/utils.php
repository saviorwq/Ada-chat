<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 通用工具函数（模块化）
 * Common helpers (module)
 */

function adachat_is_local_request(): bool
{
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
    return $ip === '127.0.0.1' || $ip === '::1' || $ip === '::ffff:127.0.0.1';
}

function adachat_ulen(string $text): int
{
    if (function_exists('mb_strlen')) {
        return (int) mb_strlen($text, 'UTF-8');
    }
    return strlen($text);
}

function adachat_usub(string $text, int $start, int $length): string
{
    if (function_exists('mb_substr')) {
        return (string) mb_substr($text, $start, $length, 'UTF-8');
    }
    return (string) substr($text, $start, $length);
}

