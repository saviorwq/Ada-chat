                <!-- 密码设置面板 -->
                <div id="passwordPanel" style="display: none;">
                    <h3 data-i18n="password_settings">🔐 密码设置</h3>
                    <div class="password-row">
                        <input type="password" id="settingsPassword" placeholder="设置密码（留空则无密码）">
                        <button onclick="savePassword()" data-i18n="save_password">保存密码</button>
                    </div>
                    <p class="hint" data-i18n="password_hint">下次打开设置需输入此密码（简单前端保护）</p>
                </div>

                <!-- 自动切换面板 -->
                <div id="autoSwitchPanel" style="display: none;">
                    <h3 data-i18n="auto_switch_settings">🔄 模型自动切换</h3>
                    <p data-i18n="auto_switch_settings_desc">启用后，当模型达到频率限制时自动切换到列表中的下一个模型。拖拽可调整优先级。</p>
                    
                    <div style="margin: 20px 0; display:flex; align-items:center; gap:12px;">
                        <label class="switch">
                            <input type="checkbox" id="autoSwitchSettingToggle" onchange="toggleAutoSwitch(this)">
                            <span class="slider round"></span>
                        </label>
                        <span data-i18n="auto_switch_enable_label" style="font-weight:600;">启用自动切换</span>
                    </div>
                    
                    <h4 data-i18n="auto_switch_select_models" style="margin-top:24px;">选择参与切换的模型</h4>
                    <p class="hint" data-i18n="auto_switch_drag_hint">拖拽排序 · 勾选启用</p>
                    <div id="autoSwitchModelList" class="auto-switch-model-list"></div>
                    
                    <div class="form-actions" style="margin-top:16px;">
                        <button class="save-provider-btn" onclick="saveAutoSwitchList()" data-i18n="auto_switch_save">保存切换列表</button>
                    </div>
                </div>

                <!-- 插件管理面板 -->
                <div id="pluginManagerPanel" style="display: none;">
                    <h3 data-i18n="plugin_manager">🧩 插件管理</h3>
                    <p data-i18n="plugin_manager_desc">启用/禁用插件，配置插件设置。</p>
                    <div id="pluginList" class="plugin-list"></div>
                </div>

                <!-- 调试模式面板 -->
                <div id="debugPanel" style="display: none;">
                    <h3 data-i18n="debug_mode">🪲 调试模式</h3>
                    <p class="hint" data-i18n="debug_mode_desc">默认关闭。开启后记录请求调试日志（自动脱敏），用于问题排查。</p>

                    <div style="margin: 20px 0; display:flex; align-items:center; gap:12px;">
                        <label class="switch">
                            <input type="checkbox" id="debugModeToggle" onchange="toggleDebugMode(this)">
                            <span class="slider round"></span>
                        </label>
                        <span data-i18n="debug_mode_enable_label" style="font-weight:600;">启用调试模式</span>
                    </div>

                    <div class="form-actions" style="margin:12px 0;">
                        <button class="fetch-models-btn" onclick="refreshDebugLogs()" data-i18n="debug_refresh">刷新日志</button>
                        <button class="save-provider-btn" onclick="exportDebugLogs()" data-i18n="debug_export">导出日志(JSON)</button>
                        <button class="fetch-models-btn" onclick="generateDiagnosticCode()" data-i18n="debug_diag">生成诊断码</button>
                        <button class="deselect-all-btn" onclick="clearDebugLogs()" data-i18n="debug_clear">清空日志</button>
                    </div>

                    <h4 data-i18n="debug_cmd_title" style="margin: 10px 0 8px;">命令控制台</h4>
                    <div class="password-row" style="margin-bottom:8px;">
                        <input type="text" id="debugCommandInput" data-i18n="debug_cmd_placeholder" placeholder="输入命令，例如：help / diag / stats / errors 20" onkeydown="handleDebugCommandKeydown(event)">
                        <button onclick="executeDebugCommand()" data-i18n="debug_run">执行</button>
                        <button onclick="showDebugHelp()" data-i18n="debug_help">帮助</button>
                    </div>
                    <pre id="debugCommandOutput" style="max-height:180px; overflow:auto; background:#111827; color:#e5e7eb; border:1px solid #334155; border-radius:10px; padding:10px; font-size:12px; line-height:1.45; white-space:pre-wrap; margin-bottom:10px;"></pre>

                    <div id="debugLogCount" class="hint" style="margin-bottom:8px;">0 logs</div>
                    <pre id="debugLogList" style="max-height:360px; overflow:auto; background:#0b1220; color:#d1d5db; border:1px solid #334155; border-radius:10px; padding:12px; font-size:12px; line-height:1.45; white-space:pre-wrap;"></pre>
                </div>
