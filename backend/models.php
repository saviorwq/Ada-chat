<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 模型类型推断与归一化（模块化）
 * Model-type inference and normalization (module)
 */

function adachat_infer_model_type(string $modelId): string
{
    $id = strtolower(trim($modelId));
    if ($id === '') {
        return 'chat';
    }

    // embedding / rerank models are not for chat generation.
    if (
        strpos($id, 'embed') !== false ||
        strpos($id, 'embedding') !== false ||
        strpos($id, 'bge-') !== false ||
        strpos($id, 'e5-') !== false ||
        strpos($id, 'gte-') !== false ||
        strpos($id, 'rerank') !== false
    ) {
        return 'embedding';
    }

    if (strpos($id, 'ocr') !== false || strpos($id, 'asr') !== false) {
        return 'ocr';
    }

    if (
        strpos($id, 'vision') !== false ||
        strpos($id, 'vl-') !== false ||
        strpos($id, 'llava') !== false
    ) {
        return 'vision';
    }

    if (
        strpos($id, 'translate') !== false ||
        strpos($id, 'translation') !== false ||
        strpos($id, 'nllb') !== false
    ) {
        return 'translation';
    }

    if (strpos($id, 'video') !== false || strpos($id, 'sora') !== false) {
        return 'video';
    }

    if (
        strpos($id, 'image') !== false ||
        strpos($id, 'sdxl') !== false ||
        strpos($id, 'stable-diffusion') !== false ||
        strpos($id, 'flux') !== false ||
        strpos($id, 'wanx') !== false
    ) {
        return 'image';
    }

    if (
        strpos($id, 'coder') !== false ||
        strpos($id, 'code') !== false ||
        strpos($id, 'deepseek-coder') !== false
    ) {
        return 'code';
    }

    return 'chat';
}

/**
 * @param array<int, mixed> $allModels
 * @return array<int, array{id: string, type: string}>
 */
function adachat_normalize_all_model_objects(array $allModels): array
{
    $out = [];
    $seen = [];
    foreach ($allModels as $m) {
        $id = trim((string) $m);
        if ($id === '' || isset($seen[$id])) {
            continue;
        }
        $seen[$id] = true;
        $out[] = [
            'id' => $id,
            'type' => adachat_infer_model_type($id),
        ];
    }
    return $out;
}

