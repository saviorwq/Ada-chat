<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * providers 相关 action 路由（模块化）
 * Provider-related action routes (module)
 */

require_once __DIR__ . '/../providers.php';
require_once __DIR__ . '/../models.php';
require_once __DIR__ . '/../json.php';
require_once __DIR__ . '/../local_inference/gateway.php';
require_once __DIR__ . '/../local_inference/paths.php';
require_once __DIR__ . '/../image/paths.php';
require_once __DIR__ . '/../image/local.php';

function adachat_actions_is_list($arr): bool
{
    if (!is_array($arr)) {
        return false;
    }
    $i = 0;
    foreach ($arr as $k => $_) {
        if ($k !== $i++) {
            return false;
        }
    }
    return true;
}

function adachat_actions_normalize_deployment_type($rawType): string
{
    $type = strtolower(trim((string) $rawType));
    return $type === 'local' ? 'local' : 'cloud';
}

function adachat_actions_build_api_headers($apiKey): array
{
    $headers = ['Content-Type: application/json'];
    $trimmedKey = trim((string) $apiKey);
    if ($trimmedKey !== '') {
        $headers[] = 'Authorization: Bearer ' . $trimmedKey;
    }
    $headers[] = 'HTTP-Referer: ' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
    $headers[] = 'X-Title: Ada Chat';
    return $headers;
}

/**
 * Handle provider actions; returns true if action was handled (and script exited).
 */
function adachat_handle_providers_actions(string $action): bool
{
    // 获取所有供应商
    if ($action === 'get_providers') {
        // 尽快释放 session 锁，避免并行请求堵在单线程 PHP 上
        if (session_status() === PHP_SESSION_ACTIVE) {
            @session_write_close();
        }
        $providers = adachat_providers_public_list();
        $json = adachat_json_encode_unicode($providers);
        if ($json === false) {
            adachat_json(['success' => false, 'error' => 'providers_json_encode_failed'], 500);
        }
        http_response_code(200);
        adachat_json_headers();
        echo $json;
        exit;
    }

    // 获取单个供应商
    if ($action === 'get_provider') {
        $id = $_GET['id'] ?? '';
        $p = adachat_find_provider((string) $id);
        if ($p) {
            unset($p['api_key']);
            adachat_json($p);
        } else {
            adachat_json(null);
        }
    }

    // 保存供应商（新增图像/视频路径）
    if ($action === 'save_provider') {
        $input = json_decode((string) file_get_contents('php://input'), true);
        $id = is_array($input) ? ($input['id'] ?? null) : null;
        $name = is_array($input) ? (string) ($input['name'] ?? '') : '';
        $base_url = is_array($input) ? rtrim((string) ($input['base_url'] ?? ''), '/') : '';
        $api_key = is_array($input) ? (string) ($input['api_key'] ?? '') : '';
        $models_path = is_array($input) ? (string) ($input['models_path'] ?? '/models') : '/models';
        $chat_path = is_array($input) ? (string) ($input['chat_path'] ?? '/chat/completions') : '/chat/completions';
        $image_gen_path = is_array($input) ? (string) ($input['image_gen_path'] ?? '/images/generations') : '/images/generations';
        $image_edit_path = is_array($input) ? (string) ($input['image_edit_path'] ?? '/images/edits') : '/images/edits';
        $video_path = is_array($input) ? (string) ($input['video_path'] ?? '/videos/generations') : '/videos/generations';
        $cache_strategy = is_array($input) ? (string) ($input['cache_strategy'] ?? 'auto') : 'auto';
        $deployment_type = adachat_actions_normalize_deployment_type(is_array($input) ? ($input['deployment_type'] ?? 'cloud') : 'cloud');
        $inference_engine = strtolower(trim((string) (is_array($input) ? ($input['inference_engine'] ?? '') : '')));
        if ($deployment_type === 'local' && $inference_engine === '') {
            $inference_engine = 'direct';
        } elseif ($inference_engine === '') {
            $inference_engine = 'http';
        }
        $models_dir = is_array($input) ? trim((string) ($input['models_dir'] ?? '')) : '';

        if (!$name) {
            adachat_json(['success' => false, 'error' => '缺少供应商名称'], 400);
        }
        if (!$base_url) {
            if ($deployment_type === 'local' && $inference_engine === 'direct') {
                $base_url = 'direct://local';
            } else {
                adachat_json(['success' => false, 'error' => '缺少 API 基础地址'], 400);
            }
        }
        if (!$id && !$api_key && $deployment_type !== 'local') {
            adachat_json(['success' => false, 'error' => '新增供应商必须提供 API Key'], 400);
        }

        $providers = adachat_get_providers();
        if ($id) {
            foreach ($providers as &$p) {
                if (is_array($p) && ($p['id'] ?? null) === $id) {
                    $p['name'] = $name;
                    $p['base_url'] = $base_url;
                    if ($deployment_type === 'local' && $api_key === '') {
                        $p['api_key'] = '';
                    } elseif (!empty($api_key)) {
                        $p['api_key'] = $api_key;
                    }
                    $p['models_path'] = $models_path;
                    $p['chat_path'] = $chat_path;
                    $p['image_gen_path'] = $image_gen_path;
                    $p['image_edit_path'] = $image_edit_path;
                    $p['video_path'] = $video_path;
                    $p['cache_strategy'] = $cache_strategy;
                    $p['deployment_type'] = $deployment_type;
                    $p['inference_engine'] = $inference_engine;
                    if ($models_dir !== '') {
                        $p['models_dir'] = $models_dir;
                    }
                    break;
                }
            }
        } else {
            $id = uniqid('prov_');
            $providers[] = [
                'id' => $id,
                'name' => $name,
                'base_url' => $base_url,
                'api_key' => $api_key,
                'models_path' => $models_path,
                'chat_path' => $chat_path,
                'image_gen_path' => $image_gen_path,
                'image_edit_path' => $image_edit_path,
                'video_path' => $video_path,
                'cache_strategy' => $cache_strategy,
                'deployment_type' => $deployment_type,
                'inference_engine' => $inference_engine,
                'models_dir' => $models_dir !== '' ? $models_dir : adachat_local_models_default_dir(),
                'all_models' => [],
                'models' => [],
            ];
        }
        adachat_save_providers($providers);
        adachat_json(['success' => true, 'id' => $id]);
    }

    // 删除供应商
    if ($action === 'delete_provider') {
        $id = $_GET['id'] ?? '';
        $providers = adachat_get_providers();
        $providers = array_filter($providers, fn($p) => is_array($p) && ($p['id'] ?? null) !== $id);
        adachat_save_providers(array_values($providers));
        adachat_json(['success' => true]);
    }

    // 获取模型列表（从供应商 API 拉取全量，存入 all_models）
    if ($action === 'fetch_models') {
        $id = $_GET['id'] ?? '';
        $provider = adachat_find_provider((string) $id);
        if (!$provider) {
            adachat_json(['success' => false, 'error' => '供应商不存在'], 404);
        }

        // 本地供应商：优先递归扫描 models_dir（含子目录），勿只信 llama-server /models（仅当前已加载）
        // Local providers: recursive filesystem scan first; HTTP /models only lists the loaded model
        $isLocalDeployment = (($provider['deployment_type'] ?? '') === 'local');
        $localModelsDir = adachat_local_provider_models_dir($provider);
        $preferLocalScan =
            adachat_local_provider_is_direct($provider)
            || ($isLocalDeployment && is_dir($localModelsDir));

        if ($preferLocalScan) {
            $scan = adachat_local_inference_scan_models($provider);
            if (empty($scan['success'])) {
                adachat_json([
                    'success' => false,
                    'error' => $scan['error'] ?? 'scan_failed',
                    'detail' => $scan['detail'] ?? null,
                    'hint' => '请确认已安装 Python 依赖：pip install llama-cpp-python；并将 .gguf / safetensors 模型放入 models_dir（支持子文件夹）。',
                ]);
            }

            $models = is_array($scan['models'] ?? null) ? $scan['models'] : [];
            $allModelObjects = [];
            $allModels = [];
            $seen = [];
            foreach ($models as $m) {
                if (!is_array($m)) {
                    continue;
                }
                $mid = (string) ($m['id'] ?? '');
                if ($mid === '' || isset($seen[$mid])) {
                    continue;
                }
                $seen[$mid] = true;
                $type = (string) ($m['type'] ?? 'chat');
                $allModels[] = $mid;
                $allModelObjects[] = [
                    'id' => $mid,
                    'type' => $type,
                    'format' => $m['format'] ?? '',
                ];
            }

            // 合并文生图模型（Diffusers / 单文件），对话扫描会刻意跳过这些
            // Merge text-to-image models; chat scan intentionally skips Diffusers trees
            $imageScan = adachat_image_scan_models($provider);
            $imageCount = 0;
            $imageLoras = [];
            if (!empty($imageScan['success']) && is_array($imageScan['models'] ?? null)) {
                foreach ($imageScan['models'] as $im) {
                    if (!is_array($im)) {
                        continue;
                    }
                    $mid = (string) ($im['id'] ?? '');
                    if ($mid === '' || isset($seen[$mid])) {
                        continue;
                    }
                    $seen[$mid] = true;
                    $imageCount++;
                    $allModels[] = $mid;
                    $allModelObjects[] = [
                        'id' => $mid,
                        'type' => 'image',
                        'format' => (string) ($im['format'] ?? ''),
                        'family' => (string) ($im['family'] ?? ''),
                    ];
                }
            }
            if (!empty($imageScan['success']) && is_array($imageScan['loras'] ?? null)) {
                foreach ($imageScan['loras'] as $L) {
                    if (!is_array($L)) {
                        continue;
                    }
                    $lid = (string) ($L['id'] ?? '');
                    if ($lid === '') {
                        continue;
                    }
                    $imageLoras[] = [
                        'id' => $lid,
                        'type' => 'lora',
                        'format' => 'lora',
                        'bytes' => (int) ($L['bytes'] ?? 0),
                    ];
                }
            }

            $providers = adachat_get_providers();
            foreach ($providers as &$p) {
                if (is_array($p) && ($p['id'] ?? null) === $id) {
                    $p['all_models'] = $allModels;
                    $p['all_model_objs'] = $allModelObjects;
                    $p['image_loras'] = $imageLoras;
                    if ($isLocalDeployment && trim((string) ($p['models_dir'] ?? '')) === '') {
                        $p['models_dir'] = $localModelsDir;
                    }
                    break;
                }
            }
            unset($p);
            adachat_save_providers($providers);

            $hints = [];
            if (!adachat_local_provider_is_direct($provider)) {
                $hints[] =
                    '已扫描本地目录（含子文件夹）。Vulkan/HTTP 对话仍用 llama-server 当前模型；换 GGUF 需重启 llama 或改「直连文件」。';
            }
            if ($imageCount > 0) {
                $hints[] =
                    '已发现 ' .
                    $imageCount .
                    ' 个文生图模型（标签 image）。请勾选后保存；分类选「图像生成」使用。';
                if ($imageLoras !== []) {
                    $hints[] = 'LoRA 适配器：' . count($imageLoras) . ' 个（图像分类下可选）。';
                }
                if (!adachat_local_image_feature_enabled()) {
                    $hints[] =
                        '本地文生图开关未开：请确认存在 ai_data/features/local_image_enabled。';
                }
            } elseif (empty($imageScan['success'])) {
                $hints[] =
                    '文生图扫描未成功：' .
                    (string) ($imageScan['error'] ?? 'unknown') .
                    '（对话模型列表仍可用）';
            }

            adachat_json([
                'success' => true,
                'models' => $allModels,
                'model_objects' => $allModelObjects,
                'image_loras' => $imageLoras,
                'source' => 'local_scan',
                'models_dir' => $scan['models_dir'] ?? $localModelsDir,
                'image_models' => $imageCount,
                'hint' => $hints !== [] ? implode(' ', $hints) : null,
            ]);
        }

        $url = (string) ($provider['base_url'] ?? '') . (string) ($provider['models_path'] ?? '');
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, adachat_actions_build_api_headers($provider['api_key'] ?? ''));
        $caFile = dirname(__DIR__, 2) . '/php/ssl/cacert.pem';
        if (stripos(PHP_OS, 'WIN') === 0 && file_exists($caFile) && !ini_get('curl.cainfo')) {
            curl_setopt($ch, CURLOPT_CAINFO, $caFile);
        }
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($httpCode !== 200) {
            adachat_json([
                'success' => false,
                'error' => '获取模型失败，HTTP ' . $httpCode . ($curlError ? ' - ' . $curlError : ''),
            ]);
        }

        $data = json_decode((string) $response, true);
        if (!$data) {
            adachat_json([
                'success' => false,
                'error' => '无法解析API响应：' . substr((string) $response, 0, 200),
            ]);
        }

        $allModels = [];

        // 情况1：直接数组（如 Together AI 返回的纯数组）
        if (adachat_actions_is_list($data)) {
            foreach ($data as $item) {
                if (is_string($item)) {
                    $allModels[] = $item;
                } elseif (is_array($item)) {
                    $modelId = $item['id'] ?? $item['model'] ?? $item['name'] ?? null;
                    if (is_string($modelId) && $modelId !== '') {
                        $allModels[] = $modelId;
                    }
                }
            }
        }
        // 情况2：标准 OpenAI 风格 { "data": [ { "id": ... } ] }
        elseif (isset($data['data']) && is_array($data['data'])) {
            foreach ($data['data'] as $item) {
                $modelId = $item['id'] ?? $item['model'] ?? $item['name'] ?? null;
                if (is_string($modelId) && $modelId !== '') {
                    $allModels[] = $modelId;
                }
            }
        }
        // 情况3：{ "models": [ ... ] } 风格
        elseif (isset($data['models']) && is_array($data['models'])) {
            foreach ($data['models'] as $item) {
                if (is_string($item) && $item !== '') {
                    $allModels[] = $item;
                } elseif (is_array($item)) {
                    $modelId = $item['id'] ?? $item['model'] ?? $item['name'] ?? null;
                    if (is_string($modelId) && $modelId !== '') {
                        $allModels[] = $modelId;
                    }
                }
            }
        }
        // 情况4：其他可能的格式，如直接对象映射
        elseif (is_array($data)) {
            foreach ($data as $value) {
                if (is_string($value) && $value !== '') {
                    $allModels[] = $value;
                } elseif (is_array($value) && isset($value['id'])) {
                    $allModels[] = (string) $value['id'];
                }
            }
        }

        if (empty($allModels)) {
            $sample = substr((string) $response, 0, 500);
            adachat_json([
                'success' => false,
                'error' => '未找到任何模型，API返回内容片段：' . $sample,
            ]);
        }

        $allModelObjects = adachat_normalize_all_model_objects($allModels);
        $providers = adachat_get_providers();
        foreach ($providers as &$p) {
            if (is_array($p) && ($p['id'] ?? null) === $id) {
                $p['all_models'] = $allModels;
                $p['all_model_objs'] = $allModelObjects;
                break;
            }
        }
        adachat_save_providers($providers);

        adachat_json([
            'success' => true,
            'models' => $allModels,
            'model_objects' => $allModelObjects,
        ]);
    }

    // 更新启用的模型列表（用户勾选后保存，包含类型）
    if ($action === 'update_provider_models') {
        $input = json_decode((string) file_get_contents('php://input'), true);
        $id = is_array($input) ? (string) ($input['id'] ?? '') : '';
        $models = is_array($input) ? ($input['models'] ?? []) : [];

        $providers = adachat_get_providers();
        $found = false;
        foreach ($providers as &$p) {
            if (is_array($p) && ($p['id'] ?? null) === $id) {
                $p['models'] = $models;
                $found = true;
                break;
            }
        }
        if ($found) {
            adachat_save_providers($providers);
            adachat_json(['success' => true]);
        } else {
            adachat_json(['success' => false, 'error' => '供应商不存在'], 404);
        }
    }

    // 获取所有启用的模型（返回带类型的选项）
    if ($action === 'list_models') {
        $providers = adachat_get_providers();
        $options = [];
        $imageLorasByProvider = [];
        foreach ($providers as $p) {
            if (!is_array($p) || empty($p['id'])) {
                continue;
            }
            $pid = (string) $p['id'];
            $typeMap = [];
            foreach (($p['all_model_objs'] ?? []) as $mo) {
                if (is_array($mo) && !empty($mo['id'])) {
                    $typeMap[(string) $mo['id']] = (string) ($mo['type'] ?? 'chat');
                }
            }
            foreach (($p['models'] ?? []) as $model) {
                if (is_string($model)) {
                    $modelId = $model;
                    $type = $typeMap[$modelId] ?? adachat_infer_model_type((string) $modelId);
                } elseif (is_array($model) && !empty($model['id'])) {
                    $modelId = (string) $model['id'];
                    $type = (string) ($model['type'] ?? ($typeMap[$modelId] ?? adachat_infer_model_type($modelId)));
                    $inferred = adachat_infer_model_type($modelId);
                    if ($inferred === 'embedding' && $type === 'chat') {
                        $type = 'embedding';
                    }
                } else {
                    continue;
                }
                $options[] = [
                    'value' => $pid . '::' . $modelId,
                    'label' => $modelId . ' (' . ($p['name'] ?? $pid) . ')',
                    'type' => $type,
                ];
            }
            $loras = [];
            foreach (($p['image_loras'] ?? []) as $L) {
                if (!is_array($L)) {
                    continue;
                }
                $lid = (string) ($L['id'] ?? '');
                if ($lid === '') {
                    continue;
                }
                $loras[] = [
                    'id' => $lid,
                    'type' => 'lora',
                    'format' => 'lora',
                    'bytes' => (int) ($L['bytes'] ?? 0),
                ];
            }
            if ($loras !== []) {
                $imageLorasByProvider[$pid] = $loras;
            }
        }
        adachat_json([
            'success' => true,
            'models' => $options,
            'image_loras' => $imageLorasByProvider,
        ]);
    }

    // 本地推理环境检查
    if ($action === 'local_inference_status') {
        require_once __DIR__ . '/../local_inference/exec.php';
        require_once __DIR__ . '/../server_control.php';
        $ret = adachat_run_local_inference_bridge('doctor', []);
        if (empty($ret['ok'])) {
            adachat_json([
                'success' => false,
                'error' => $ret['error'] ?? 'doctor_failed',
                'detail' => $ret['error'] ?? null,
                'exec_available' => adachat_is_exec_available(),
                'install_hint' => 'pip install -r requirements-local-inference.txt',
            ]);
        }
        $status = is_array($ret['data'] ?? null) ? $ret['data'] : [];
        $status['exec_available'] = adachat_is_exec_available();
        adachat_json(['success' => true, 'status' => $status]);
    }

    return false;
}

