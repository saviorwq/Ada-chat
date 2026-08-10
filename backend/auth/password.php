<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 登录密码存储/校验（模块化）
 * Password storage and verification (module)
 *
 * 约定 / Convention:
 * - 若存在 `AI_DATA_DIR/.auth_password`，其内容为 password_hash() 的结果（优先级最高）
 * - 否则回退到环境变量 `ADA_LOGIN_PASSWORD`
 * - 再回退到内置默认值（仅为兼容旧行为）
 *
 * - If `AI_DATA_DIR/.auth_password` exists, it stores a password_hash() value (highest priority)
 * - Else fallback to env `ADA_LOGIN_PASSWORD`
 * - Else fallback to built-in default (legacy compatibility)
 */

function adachat_auth_password_file(): string
{
    return rtrim(AI_DATA_DIR, "/\\") . DIRECTORY_SEPARATOR . '.auth_password';
}

function adachat_auth_legacy_default_password(): string
{
    return 'admin123';
}

function adachat_auth_fallback_password(): string
{
    $env = getenv('ADA_LOGIN_PASSWORD');
    if (is_string($env) && $env !== '') {
        return $env;
    }
    return adachat_auth_legacy_default_password();
}

function adachat_auth_verify_password(string $plainPassword): bool
{
    $plainPassword = (string) $plainPassword;
    $pwFile = adachat_auth_password_file();
    if (is_file($pwFile)) {
        $hash = trim((string) @file_get_contents($pwFile));
        if ($hash === '') return false;
        return password_verify($plainPassword, $hash);
    }
    return hash_equals(adachat_auth_fallback_password(), $plainPassword);
}

/**
 * Set or clear password store file.
 *
 * @return array{success:bool,message:string}
 */
function adachat_auth_set_password(string $plainPassword): array
{
    $pwFile = adachat_auth_password_file();
    $plainPassword = (string) $plainPassword;

    if ($plainPassword === '') {
        if (is_file($pwFile)) {
            @unlink($pwFile);
        }
        return ['success' => true, 'message' => 'Password cleared'];
    }

    $hash = password_hash($plainPassword, PASSWORD_DEFAULT);
    if (!is_string($hash) || $hash === '') {
        return ['success' => false, 'message' => 'Password hash failed'];
    }

    $ok = @file_put_contents($pwFile, $hash, LOCK_EX);
    if ($ok === false) {
        return ['success' => false, 'message' => 'Password save failed'];
    }
    return ['success' => true, 'message' => 'Password saved'];
}

