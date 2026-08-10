<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

require_once dirname(__DIR__) . '/backend/local_inference/worker.php';

$health = adachat_local_worker_health();
echo 'health=' . ($health ? 'up' : 'down') . PHP_EOL;

$t0 = microtime(true);
$ok = adachat_local_worker_ensure(800, false);
$ms = (int) ((microtime(true) - $t0) * 1000);
echo 'ensure=' . ($ok ? 'true' : 'false') . " ms={$ms}" . PHP_EOL;

// spawn() 在无 python/脚本时应快速失败；此处验证 ensure 不会无限挂起
// Ensure must not hang forever when worker cannot start
if ($ms > 5000) {
    fwrite(STDERR, "W2-slow: ensure took {$ms}ms (>5s)\n");
    exit(2);
}

echo $ok ? "W2-ensure: worker became healthy\n" : "W2-ensure: failed closed (ok for down env)\n";
exit(0);
