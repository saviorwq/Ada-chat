                <!-- 供应商编辑面板 -->
                <div id="providerEditPanel" style="display: none;">
                    <form id="providerForm" onsubmit="saveProvider(event)">
                        <input type="hidden" id="providerId">
                        <table class="form-table">
                            <tr><th data-i18n="name">名称*</th><td><input type="text" id="provName" required></td></tr>
                            <tr id="provBaseUrlRow"><th data-i18n="api_base_url">API 基础地址*</th><td><input type="url" id="provBaseUrl" placeholder="https://api.openai.com/v1"></td></tr>
                            <tr>
                                <th data-i18n="provider_deployment_type">部署类型</th>
                                <td>
                                    <select id="provDeploymentType" onchange="onProviderDeploymentTypeChange()">
                                        <option value="cloud" data-i18n="provider_deployment_cloud">云端供应商</option>
                                        <option value="local" data-i18n="provider_deployment_local">本地供应商（本机部署）</option>
                                    </select>
                                    <p class="hint" id="providerDeploymentHint" data-i18n="provider_deployment_hint_cloud">云端模式默认需要 API Key。</p>
                                </td>
                            </tr>
                            <tr id="provInferenceEngineRow" style="display:none;">
                                <th data-i18n="provider_inference_engine">推理方式</th>
                                <td>
                                    <select id="provInferenceEngine" onchange="onProviderDeploymentTypeChange()">
                                        <option value="direct" data-i18n="provider_inference_direct">直连文件（GGUF / Safetensors）</option>
                                        <option value="http" data-i18n="provider_inference_http">HTTP 兼容 API（LM Studio 等）</option>
                                    </select>
                                </td>
                            </tr>
                            <tr id="provModelsDirRow" style="display:none;">
                                <th data-i18n="provider_models_dir">本地模型目录</th>
                                <td>
                                    <input type="text" id="provModelsDir" placeholder="D:\models（留空则自动检测）">
                                    <p class="hint" data-i18n="provider_models_dir_hint">将 .gguf 或含 config.json 的 safetensors 目录放入此路径，然后点击「扫描本地模型」。</p>
                                </td>
                            </tr>
                            <tr id="provLocalDepsRow" style="display:none;">
                                <th data-i18n="local_inference_env">本地推理环境</th>
                                <td>
                                    <div id="localInferenceStatus" class="local-inference-status hint" data-i18n="local_inference_checking">检测中…</div>
                                    <button type="button" class="fetch-models-btn" style="margin-top:8px;" onclick="refreshLocalInferenceStatus()" data-i18n="local_inference_recheck">重新检测</button>
                                </td>
                            </tr>
                            <tr><th data-i18n="api_key">API Key*</th><td><input type="password" id="provApiKey"></td></tr>
                            <tr><th data-i18n="models_path">模型列表路径</th><td><input type="text" id="provModelsPath" value="/models" placeholder="/models"></td></tr>
                            <tr><th data-i18n="chat_path">聊天补全路径</th><td><input type="text" id="provChatPath" value="/chat/completions" placeholder="/chat/completions"></td></tr>
                            <tr><th data-i18n="image_gen_path">文生图路径</th><td><input type="text" id="provImageGenPath" value="/images/generations" placeholder="/images/generations"></td></tr>
                            <tr><th data-i18n="image_edit_path">图生图路径</th><td><input type="text" id="provImageEditPath" value="/images/edits" placeholder="/images/edits"></td></tr>
                            <tr><th data-i18n="video_path">视频生成路径</th><td><input type="text" id="provVideoPath" value="/videos/generations" placeholder="/videos/generations"></td></tr>
                            <tr><th data-i18n="cache_strategy">缓存对齐策略</th><td>
                                <select id="provCacheStrategy">
                                    <option value="auto">自动检测 (Auto)</option>
                                    <option value="breakpoint">显式断点 (Anthropic/OpenRouter)</option>
                                    <option value="prefix">前缀缓存 (OpenAI/DeepSeek)</option>
                                    <option value="none">关闭</option>
                                </select>
                                <p class="hint" style="margin:4px 0 0;font-size:12px;color:#888;" data-i18n="cache_strategy_hint">自动检测会根据 API 地址选择最优策略，可节省 50%-90% 输入 token 费用</p>
                            </td></tr>
                        </table>
                        <div class="form-actions">
                            <button type="submit" class="save-provider-btn" data-i18n="save_provider">保存供应商</button>
                        </div>
                    </form>
                    <div class="model-selector">
                        <h4 data-i18n="enable_models">启用模型（可多选）</h4>
                        <div class="model-toolbar">
                            <button type="button" class="fetch-models-btn" onclick="fetchModelsForCurrentProvider()" data-i18n="fetch_models">获取最新模型</button>
                            <button type="button" class="save-models-btn" onclick="saveSelectedModels()" data-i18n="save_model_selection">保存模型选择</button>
                            <button type="button" class="select-all-btn" onclick="selectAllModels()" data-i18n="select_all">全选</button>
                            <button type="button" class="deselect-all-btn" onclick="deselectAllModels()" data-i18n="deselect_all">全不选</button>
                        </div>
                        <div class="model-search-bar">
                            <input type="text" id="modelSearchInput" placeholder="🔍 搜索模型名称..." oninput="filterModelCheckboxes(this.value)" autocomplete="off">
                            <span id="modelSearchCount" class="model-search-count"></span>
                        </div>
                        <div id="modelCheckboxList" class="model-checkbox-list"></div>
                        <p class="hint" data-i18n="save_after_checking">勾选后点击“保存模型选择”</p>
                    </div>
                </div>
