                <!-- 皮肤模式面板 -->
                <div id="skinPanel" style="display: none;">
                    <h3 data-i18n="skin_mode">🎨 皮肤模式</h3>
                    <p data-i18n="skin_mode_desc">选择界面主题，或自定义颜色。</p>
                    <table class="form-table">
                        <tr>
                            <th data-i18n="theme_preset">主题预设</th>
                            <td>
                                <select id="themePreset" onchange="onThemePresetChange()">
                                    <option value="light" data-i18n="theme_light">浅色</option>
                                    <option value="dark" data-i18n="theme_dark">深色</option>
                                    <option value="custom" data-i18n="theme_custom">自定义</option>
                                </select>
                            </td>
                        </tr>
                        <tr>
                            <th data-i18n="theme_primary">主色</th>
                            <td><input type="color" id="themePrimary" value="#10b981"></td>
                        </tr>
                        <tr>
                            <th data-i18n="theme_bg">背景色</th>
                            <td><input type="color" id="themeBg" value="#f9fafc"></td>
                        </tr>
                        <tr>
                            <th data-i18n="theme_text">文字色</th>
                            <td><input type="color" id="themeText" value="#1e293b"></td>
                        </tr>
                    </table>
                    <div class="form-actions">
                        <button class="save-provider-btn" onclick="saveSkinSettings()" data-i18n="save_skin">保存皮肤</button>
                    </div>
                </div>

                <!-- 成本优化面板 -->
                <div id="costOptimizerPanel" style="display: none;">
                    <h3>💰 成本优化引擎</h3>
                    <p style="color:#888;margin-bottom:16px;">在不影响对话质量的前提下，自动降低 API 调用成本。所有优化在服务端透明执行。</p>

                    <!-- 1. 滑动窗口 -->
                    <div class="cost-section">
                        <div class="cost-header">
                            <label class="switch"><input type="checkbox" id="costSlidingEnabled"><span class="slider round"></span></label>
                            <strong>📐 滑动窗口 (Sliding Window)</strong>
                        </div>
                        <p class="hint">对话历史超过 token 上限时，自动裁剪中间旧消息，保留开头（定锚）+ 结尾（记忆）。</p>
                        <table class="form-table" style="margin-top:8px;">
                            <tr><th>Token 上限</th><td><input type="number" id="costSlidingMaxTokens" value="10000" min="1000" step="1000" style="width:100px;"> tokens</td></tr>
                            <tr><th>保留开头轮数</th><td><input type="number" id="costSlidingKeepFirst" value="2" min="0" max="10" style="width:60px;"> 轮</td></tr>
                            <tr><th>保留结尾轮数</th><td><input type="number" id="costSlidingKeepLast" value="5" min="1" max="20" style="width:60px;"> 轮</td></tr>
                        </table>
                    </div>

                    <!-- 2. 模型路由 -->
                    <div class="cost-section">
                        <div class="cost-header">
                            <label class="switch"><input type="checkbox" id="costRoutingEnabled"><span class="slider round"></span></label>
                            <strong>🔀 智能模型路由 (Model Routing)</strong>
                        </div>
                        <p class="hint">短消息/简单指令（"好的"、"继续"等）自动路由到廉价模型，复杂问题保持原模型。</p>
                        <table class="form-table" style="margin-top:8px;">
                            <tr><th>廉价模型</th><td><select id="costRoutingLightModel" style="width:100%;max-width:400px;"><option value="">-- 未配置（请先添加供应商和模型）--</option></select></td></tr>
                            <tr><th>简单消息阈值</th><td><input type="number" id="costRoutingMaxChars" value="30" min="5" max="100" style="width:60px;"> 字符以下视为简单消息</td></tr>
                            <tr><th>复杂关键词</th><td><textarea id="costRoutingKeywords" rows="2" style="width:100%;max-width:400px;font-size:12px;" placeholder="逗号分隔"></textarea><br><span class="hint">包含这些词的消息不会被路由到廉价模型</span></td></tr>
                        </table>
                    </div>

                    <!-- 3. 压缩回复 -->
                    <div class="cost-section">
                        <div class="cost-header">
                            <label class="switch"><input type="checkbox" id="costCompressEnabled"><span class="slider round"></span></label>
                            <strong>📦 压缩回复 (Compress Output)</strong>
                        </div>
                        <p class="hint">在 System Prompt 末尾注入简洁指令，减少 AI 废话，输出 token 预计减少 20%-30%。</p>
                        <table class="form-table" style="margin-top:8px;">
                            <tr><th>注入指令</th><td><textarea id="costCompressInstruction" rows="2" style="width:100%;max-width:400px;"></textarea></td></tr>
                        </table>
                    </div>

                    <!-- 4. KV 缓存 -->
                    <div class="cost-section">
                        <div class="cost-header">
                            <label class="switch"><input type="checkbox" id="costKvEnabled"><span class="slider round"></span></label>
                            <strong>🗄️ 回复缓存 (Response Cache)</strong>
                        </div>
                        <p class="hint">对相同问题（相同 system prompt + user message + model）缓存回复，重复提问零成本零延迟。使用 SQLite 存储。</p>
                        <table class="form-table" style="margin-top:8px;">
                            <tr><th>缓存有效期</th><td><input type="number" id="costKvTtl" value="3600" min="60" step="60" style="width:100px;"> 秒 <span class="hint">（3600 = 1小时）</span></td></tr>
                            <tr><th>跨会话宽松匹配</th><td><label class="switch"><input type="checkbox" id="costKvLoose"><span class="slider round"></span></label> <span class="hint">忽略 System Prompt 差异，仅匹配 user message + model</span></td></tr>
                        </table>
                    </div>

                    <!-- 5. 智能 max_tokens -->
                    <div class="cost-section">
                        <div class="cost-header">
                            <label class="switch"><input type="checkbox" id="costMaxTokensEnabled"><span class="slider round"></span></label>
                            <strong>📏 智能 max_tokens 限制</strong>
                        </div>
                        <p class="hint">根据用户输入长度自动设置输出上限。短问题不需要 4096 token 的预算。输出 token 价格是输入的 2-3 倍。</p>
                        <table class="form-table" style="margin-top:8px;">
                            <tr><th>分级规则</th><td><input type="text" id="costMaxTokensTiers" value="20:512,100:1024,500:2048,0:4096" style="width:100%;max-width:350px;"><br><span class="hint">格式: 字符数:max_tokens，逗号分隔。0 表示默认值。例: 20:512 = 20字以下限512</span></td></tr>
                        </table>
                    </div>

                    <!-- 6. Prompt 压缩 -->
                    <div class="cost-section">
                        <div class="cost-header">
                            <label class="switch"><input type="checkbox" id="costPromptCompressEnabled"><span class="slider round"></span></label>
                            <strong>🗜️ System Prompt 压缩</strong>
                        </div>
                        <p class="hint">自动将 System Prompt 中的结构化角色/物品/场景定义压缩为简记符号，减少 40-60% token。AI 能无损理解压缩格式。</p>
                    </div>

                    <div class="form-actions" style="margin-top:16px;">
                        <button class="save-provider-btn" onclick="saveCostSettings()">保存优化设置</button>
                    </div>
                </div>
