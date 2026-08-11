                <!-- 本地运行时 / Local Runtime -->
                <div id="localRuntimePanel" style="display: none;">
                    <h3 data-i18n="local_runtime_title">🖥️ 本地运行时</h3>
                    <p class="hint" data-i18n="local_runtime_desc">统一查看本机 LLM / 图像 / 视频 Runtime 健康状态与近期任务（只读）。</p>
                    <div class="form-actions" style="justify-content:flex-start; gap:10px; margin-bottom:12px;">
                        <button type="button" class="fetch-models-btn" onclick="refreshLocalRuntimeStatus()" data-i18n="local_runtime_refresh">刷新状态</button>
                        <button type="button" class="fetch-models-btn" onclick="scanLocalRuntimeModels()" data-i18n="local_runtime_scan">扫描本地模型</button>
                    </div>
                    <div id="localRuntimeStatus" class="hint" style="margin-bottom:12px;" data-i18n="local_runtime_checking">检测中…</div>
                    <pre id="localRuntimeDetail" style="max-height:220px; overflow:auto; background:#0b1220; color:#d1d5db; border:1px solid #334155; border-radius:10px; padding:12px; font-size:12px; line-height:1.45; white-space:pre-wrap; margin-bottom:14px;"></pre>
                    <h4 data-i18n="local_runtime_jobs_title" style="margin:8px 0;">近期任务</h4>
                    <pre id="localRuntimeJobs" style="max-height:180px; overflow:auto; background:#0b1220; color:#d1d5db; border:1px solid #334155; border-radius:10px; padding:12px; font-size:12px; line-height:1.45; white-space:pre-wrap; margin-bottom:14px;"></pre>
                    <h4 data-i18n="local_runtime_models_title" style="margin:8px 0;">扫描结果</h4>
                    <pre id="localRuntimeModels" style="max-height:220px; overflow:auto; background:#0b1220; color:#d1d5db; border:1px solid #334155; border-radius:10px; padding:12px; font-size:12px; line-height:1.45; white-space:pre-wrap;"></pre>
                </div>
