<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 运行时执行预算（模块化）
 * Runtime execution budget (module)
 */

function adachat_gateway_apply_runtime_budget(bool $stream, bool $isCyoaChat): void
{
    // 避免 CYOA 流式长回合被 PHP 默认 30 秒硬切断。
    if ($stream || $isCyoaChat) {
        @ini_set('max_execution_time', '0');
        @set_time_limit(0);
        return;
    }

    // 常规请求也给足缓冲，避免慢模型在边界超时。
    @ini_set('max_execution_time', '900');
    @set_time_limit(900);
}

