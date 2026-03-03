/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
// Debug and diagnostics tools extracted from script.js

let debugLogs = [];
const DEBUG_MODE_KEY = 'debug_mode_enabled';
const DEBUG_LOGS_KEY = 'debug_logs';
const DEBUG_MAX_LOGS = 300;

function isDebugModeEnabled() {
    return localStorage.getItem(DEBUG_MODE_KEY) === 'true';
}

function loadDebugLogs() {
    try {
        const saved = localStorage.getItem(DEBUG_LOGS_KEY);
        debugLogs = saved ? JSON.parse(saved) : [];
        if (!Array.isArray(debugLogs)) debugLogs = [];
    } catch {
        debugLogs = [];
    }
}

function saveDebugLogs() {
    localStorage.setItem(DEBUG_LOGS_KEY, JSON.stringify(debugLogs));
}

function sanitizeErrorMessage(msg) {
    if (!msg) return '';
    return String(msg)
        .replace(/sk-[a-zA-Z0-9_-]{8,}/g, 'sk-***')
        .replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer ***')
        .slice(0, 300);
}

function addDebugLog(event, data = {}, level = 'info') {
    if (!isDebugModeEnabled()) return;
    const entry = {
        ts: new Date().toISOString(),
        event,
        level,
        ...data
    };
    debugLogs.push(entry);
    if (debugLogs.length > DEBUG_MAX_LOGS) {
        debugLogs = debugLogs.slice(-DEBUG_MAX_LOGS);
    }
    saveDebugLogs();
    if ($('debugPanel') && $('debugPanel').style.display !== 'none') {
        renderDebugLogs();
    }
}

function renderDebugLogs() {
    const logEl = $('debugLogList');
    const countEl = $('debugLogCount');
    if (!logEl || !countEl) return;
    countEl.textContent = `${debugLogs.length} logs`;
    const lines = [...debugLogs].reverse().map(item => JSON.stringify(item));
    logEl.textContent = lines.length ? lines.join('\n') : '[]';
}

function toggleDebugMode(checkbox) {
    const enabled = !!checkbox.checked;
    localStorage.setItem(DEBUG_MODE_KEY, enabled ? 'true' : 'false');
    if (enabled) {
        addDebugLog('debug_mode_enabled', { message: 'debug mode enabled' });
    }
    renderDebugLogs();
}

function exportDebugLogs() {
    if (debugLogs.length === 0) {
        alert(i18n[currentLanguage].debug_export_empty);
        return;
    }
    const data = JSON.stringify(debugLogs, null, 2);
    const blob = new Blob([data], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `adachat-debug-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function clearDebugLogs() {
    debugLogs = [];
    saveDebugLogs();
    renderDebugLogs();
    alert(i18n[currentLanguage].debug_cleared);
}

function refreshDebugLogs() {
    loadDebugLogs();
    renderDebugLogs();
}

function getDebugHelpText() {
    return [
        'Debug Commands',
        '------------------------------',
        'help                  显示帮助',
        'stats                 显示日志统计',
        'explain [n]           输出问题翻译（定位到模块+建议）',
        'route [n]             输出项目内排查路径（文件+步骤）',
        'last [n]              查看最近 n 条日志（默认 10）',
        'errors [n]            查看最近 n 条错误日志（默认 20）',
        'find <keyword>        搜索关键词（event/message/model）',
        'diag [n]              生成诊断码 + 问题翻译（默认 120）',
        'export                导出 JSON 日志',
        'clear                 清空日志',
        'mode on|off           开关调试模式'
    ].join('\n');
}

function writeDebugCommandOutput(text) {
    const out = $('debugCommandOutput');
    if (!out) return;
    out.textContent = text;
}

function computeDiagnostics(logs) {
    const metrics = {
        total: logs.length,
        errors: 0,
        retries: 0,
        switches: 0,
        blocked: 0,
        timeoutErrors: 0,
        streamNoSuccess: 0
    };
    const byRequest = {};
    logs.forEach(l => {
        const rid = l.request_id || 'unknown';
        if (!byRequest[rid]) byRequest[rid] = { hasStart: false, hasSuccess: false, hasError: false, hasEnd: false };
        if (l.event === 'request_start') byRequest[rid].hasStart = true;
        if (l.event === 'request_success') byRequest[rid].hasSuccess = true;
        if (l.event === 'request_error') byRequest[rid].hasError = true;
        if (l.event === 'request_end') byRequest[rid].hasEnd = true;
        if (l.event === 'request_error') metrics.errors++;
        if (l.event === 'request_retry') metrics.retries++;
        if (l.event === 'model_switch') metrics.switches++;
        if (l.event === 'request_blocked_by_plugin') metrics.blocked++;
        if (l.event === 'request_error' && /timeout|超时/i.test(String(l.message || ''))) metrics.timeoutErrors++;
    });

    Object.values(byRequest).forEach(v => {
        if (v.hasStart && !v.hasSuccess && !v.hasError && v.hasEnd) {
            metrics.streamNoSuccess++;
        }
    });

    const flags = [];
    if (metrics.errors > 0) flags.push('ERR');
    if (metrics.timeoutErrors > 0) flags.push('TO');
    if (metrics.retries > 0 || metrics.switches > 0) flags.push('RL');
    if (metrics.streamNoSuccess > 0) flags.push('ST');
    if (metrics.blocked > 0) flags.push('PLG');
    if (flags.length === 0) flags.push('OK');

    const hashBase = `${metrics.total}|${metrics.errors}|${metrics.retries}|${metrics.switches}|${metrics.timeoutErrors}|${metrics.blocked}|${metrics.streamNoSuccess}`;
    let hash = 0;
    for (let i = 0; i < hashBase.length; i++) {
        hash = ((hash << 5) - hash) + hashBase.charCodeAt(i);
        hash |= 0;
    }
    const shortHash = Math.abs(hash).toString(16).toUpperCase().padStart(6, '0').slice(0, 6);
    const code = `ADA-DBG-${flags.join('-')}-${shortHash}`;
    return { code, metrics, flags };
}

function translateProblem(logs) {
    const lastError = [...logs].reverse().find(l => l.event === 'request_error' || l.level === 'error');
    const lastResponse = [...logs].reverse().find(l => l.event === 'response_received');
    const hasPluginBlock = logs.some(l => l.event === 'request_blocked_by_plugin');

    if (hasPluginBlock) {
        return {
            where: '插件层（beforeSend 钩子）',
            issue: '请求被插件拦截',
            evidence: '存在 request_blocked_by_plugin 事件',
            suggestion: '在设置里禁用最近启用的插件，或检查插件 beforeSend 返回值'
        };
    }

    if (lastError) {
        const msg = String(lastError.message || '').toLowerCase();
        if (/timeout|超时/.test(msg)) {
            return {
                where: '网络层 / 上游模型响应链路',
                issue: '请求超时',
                evidence: `错误信息: ${sanitizeErrorMessage(lastError.message || '')}`,
                suggestion: '增大超时设置，或切换更稳定模型/供应商'
            };
        }
        if (/http error 401|401|unauthorized|invalid api key|api key/.test(msg)) {
            return {
                where: '供应商鉴权（API Key）',
                issue: '鉴权失败',
                evidence: `错误信息: ${sanitizeErrorMessage(lastError.message || '')}`,
                suggestion: '检查供应商 API Key、Base URL、路径是否匹配'
            };
        }
        if (/http error 403|403|forbidden/.test(msg)) {
            return {
                where: '供应商权限/账号策略',
                issue: '无权限访问模型或接口',
                evidence: `错误信息: ${sanitizeErrorMessage(lastError.message || '')}`,
                suggestion: '检查账号权限、模型白名单、企业策略限制'
            };
        }
        if (/http error 404|404|not found/.test(msg)) {
            return {
                where: 'API 路径配置',
                issue: '请求路径不存在',
                evidence: `错误信息: ${sanitizeErrorMessage(lastError.message || '')}`,
                suggestion: '检查 chat/models/image 路径配置是否与供应商文档一致'
            };
        }
        if (/http error 429|429|rate limit|quota|exceeded|limit/.test(msg)) {
            return {
                where: '上游模型限流',
                issue: '触发频率或配额限制',
                evidence: `错误信息: ${sanitizeErrorMessage(lastError.message || '')}`,
                suggestion: '开启自动切换、降低并发、检查余额与配额'
            };
        }
        if (/http error 5\d\d|502|503|504|upstream|bad gateway/.test(msg)) {
            return {
                where: '上游服务可用性',
                issue: '供应商服务异常',
                evidence: `错误信息: ${sanitizeErrorMessage(lastError.message || '')}`,
                suggestion: '稍后重试，或切换到备用供应商'
            };
        }
        return {
            where: '请求执行链路（前端->代理->上游）',
            issue: '出现未分类错误',
            evidence: `错误信息: ${sanitizeErrorMessage(lastError.message || '')}`,
            suggestion: '导出日志并提供给维护者进一步定位'
        };
    }

    if (lastResponse && Number(lastResponse.status) >= 400) {
        return {
            where: 'HTTP 响应阶段',
            issue: `响应状态异常 (${lastResponse.status})`,
            evidence: `最后状态码: ${lastResponse.status}`,
            suggestion: '优先检查供应商配置、模型权限和网络连通性'
        };
    }

    const d = computeDiagnostics(logs);
    if (d.metrics.streamNoSuccess > 0) {
        return {
            where: '流式渲染阶段（前端）',
            issue: '流结束但未确认成功',
            evidence: `streamNoSuccess=${d.metrics.streamNoSuccess}`,
            suggestion: '检查浏览器控制台、网络中断、SSE 数据格式'
        };
    }

    return {
        where: '未发现明确故障点',
        issue: '当前日志中无显著异常',
        evidence: '未检出 error / 非 2xx / 插件拦截',
        suggestion: '若仍异常，请复现后立即导出日志再分析'
    };
}

function getTroubleshootRoute(t) {
    const text = `${t.where} ${t.issue}`.toLowerCase();
    if (text.includes('插件')) {
        return [
            '定位路径: 前端插件钩子',
            '1) 在设置 -> 插件管理中禁用最近启用插件',
            '2) 检查插件 beforeSend 是否返回 false',
            '3) 关键文件: plugins/*/*.js, script.js (PluginSystem.runHook)'
        ];
    }
    if (text.includes('鉴权') || text.includes('401') || text.includes('权限') || text.includes('403')) {
        return [
            '定位路径: 供应商配置与鉴权',
            '1) 设置 -> 供应商列表 -> 检查 API Key / Base URL / 路径',
            '2) 确认模型权限与账号额度',
            '3) 关键文件: ai_proxy.php, AI.php (供应商设置)'
        ];
    }
    if (text.includes('路径') || text.includes('404')) {
        return [
            '定位路径: API 路径配置',
            '1) 设置 -> 供应商列表 -> 校验 chat/models/image/video 路径',
            '2) 对照供应商文档确认 endpoint',
            '3) 关键文件: ai_proxy.php, AI.php'
        ];
    }
    if (text.includes('限流') || text.includes('429') || text.includes('配额')) {
        return [
            '定位路径: 模型限流与切换策略',
            '1) 开启自动切换并配置候选模型顺序',
            '2) 检查模型可用性与余额/配额',
            '3) 关键文件: script.js (auto switch), ai_proxy.php'
        ];
    }
    if (text.includes('超时') || text.includes('网络')) {
        return [
            '定位路径: 网络与超时参数',
            '1) 设置 -> 超时设置，适当提高 total/idle timeout',
            '2) 检查服务器到上游模型的网络连通性',
            '3) 关键文件: script.js (send timeout), ai_proxy.php (上游请求)'
        ];
    }
    if (text.includes('流式') || text.includes('stream')) {
        return [
            '定位路径: 前端流式渲染',
            '1) 检查浏览器网络面板的 SSE 数据是否连续',
            '2) 观察是否有 DONE 但无 content delta',
            '3) 关键文件: script.js (stream parser / appendToLastAIMessage)'
        ];
    }
    if (text.includes('上游服务') || text.includes('5')) {
        return [
            '定位路径: 上游服务稳定性',
            '1) 更换备用供应商/模型验证是否恢复',
            '2) 重试并记录发生时段',
            '3) 关键文件: ai_proxy.php, 供应商后台状态页'
        ];
    }
    return [
        '定位路径: 通用排查',
        '1) 先执行 explain 120 查看最近问题翻译',
        '2) 执行 errors 20 查看最近错误',
        '3) 导出日志后结合 ai_proxy.php 与 script.js 联合排查'
    ];
}

function buildDiagnosticText(logs) {
    const d = computeDiagnostics(logs);
    const t = translateProblem(logs);
    const route = getTroubleshootRoute(t);
    return [
        `Diagnostic Code: ${d.code}`,
        `Flags: ${d.flags.join(', ')}`,
        '',
        '[问题翻译]',
        `问题位置: ${t.where}`,
        `问题类型: ${t.issue}`,
        `证据: ${t.evidence}`,
        `建议: ${t.suggestion}`,
        '',
        '[项目定位路径]',
        ...route,
        '',
        '[统计]',
        JSON.stringify(d.metrics, null, 2)
    ].join('\n');
}

function showDebugHelp() {
    writeDebugCommandOutput(getDebugHelpText());
}

function generateDiagnosticCode(sampleSize = 120) {
    const n = Math.max(10, Math.min(500, parseInt(sampleSize, 10) || 120));
    const sample = debugLogs.slice(-n);
    const report = buildDiagnosticText(sample);
    const d = computeDiagnostics(sample);
    writeDebugCommandOutput(report);
    addDebugLog('diagnostic_generated', {
        code: d.code,
        sample_size: n,
        flags: d.flags
    });
    return d.code;
}

function executeDebugCommand() {
    const input = $('debugCommandInput');
    if (!input) return;
    const raw = input.value.trim();
    if (!raw) {
        showDebugHelp();
        return;
    }
    const parts = raw.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const arg1 = parts[1];

    if (cmd === 'help') {
        showDebugHelp();
    } else if (cmd === 'stats') {
        const d = computeDiagnostics(debugLogs);
        writeDebugCommandOutput(JSON.stringify({
            diagnostic_code: d.code,
            flags: d.flags,
            metrics: d.metrics
        }, null, 2));
    } else if (cmd === 'explain') {
        const n = Math.max(10, Math.min(500, parseInt(arg1 || '120', 10) || 120));
        const sample = debugLogs.slice(-n);
        writeDebugCommandOutput(buildDiagnosticText(sample));
    } else if (cmd === 'route') {
        const n = Math.max(10, Math.min(500, parseInt(arg1 || '120', 10) || 120));
        const sample = debugLogs.slice(-n);
        const t = translateProblem(sample);
        writeDebugCommandOutput(getTroubleshootRoute(t).join('\n'));
    } else if (cmd === 'last') {
        const n = Math.max(1, Math.min(100, parseInt(arg1 || '10', 10) || 10));
        const slice = debugLogs.slice(-n);
        writeDebugCommandOutput(JSON.stringify(slice, null, 2));
    } else if (cmd === 'errors') {
        const n = Math.max(1, Math.min(200, parseInt(arg1 || '20', 10) || 20));
        const errs = debugLogs.filter(l => l.level === 'error' || l.event === 'request_error').slice(-n);
        writeDebugCommandOutput(JSON.stringify(errs, null, 2));
    } else if (cmd === 'find') {
        const keyword = parts.slice(1).join(' ').toLowerCase();
        if (!keyword) {
            writeDebugCommandOutput('Usage: find <keyword>');
        } else {
            const rows = debugLogs.filter(l => {
                return JSON.stringify(l).toLowerCase().includes(keyword);
            }).slice(-120);
            writeDebugCommandOutput(JSON.stringify(rows, null, 2));
        }
    } else if (cmd === 'diag') {
        generateDiagnosticCode(arg1 || '120');
    } else if (cmd === 'export') {
        exportDebugLogs();
        writeDebugCommandOutput('OK: exported logs');
    } else if (cmd === 'clear') {
        clearDebugLogs();
        writeDebugCommandOutput('OK: logs cleared');
    } else if (cmd === 'mode') {
        const mode = (arg1 || '').toLowerCase();
        if (mode !== 'on' && mode !== 'off') {
            writeDebugCommandOutput('Usage: mode on|off');
        } else {
            const enabled = mode === 'on';
            localStorage.setItem(DEBUG_MODE_KEY, enabled ? 'true' : 'false');
            const toggle = $('debugModeToggle');
            if (toggle) toggle.checked = enabled;
            writeDebugCommandOutput(`OK: debug mode ${enabled ? 'enabled' : 'disabled'}`);
        }
    } else {
        writeDebugCommandOutput(`Unknown command: ${cmd}\n\n${getDebugHelpText()}`);
    }
}

function handleDebugCommandKeydown(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        executeDebugCommand();
    }
}
