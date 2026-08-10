    <!-- 设置模态框 -->
    <div id="settingsModal" class="modal">
        <div class="modal-content settings-layout">
            <!-- 左侧导航菜单 -->
            <div class="settings-sidebar">
                <div class="settings-sidebar-header">
                    <h3 data-i18n="settings">⚙️ 设置</h3>
                </div>
                <div class="settings-menu">
                    <div class="menu-item expandable settings-group-title" onclick="toggleSettingsGroup('settingsGroupModelSubmenu','settingsGroupModelArrow')">
                        <span class="menu-icon">🧩</span> <span data-i18n="settings_group_model">模型与供应商</span> <span class="arrow" id="settingsGroupModelArrow">▼</span>
                    </div>
                    <div class="submenu settings-group-submenu" id="settingsGroupModelSubmenu">
                        <div class="menu-item" id="addProviderMenuItem">
                            <span class="menu-icon">➕</span> <span data-i18n="add_provider">新增供应商</span>
                        </div>
                        <div class="menu-item expandable" id="providerListToggle" onclick="toggleProviderList()">
                            <span class="menu-icon">📋</span> <span data-i18n="provider_list">供应商列表</span> <span class="arrow" id="providerListArrow">▼</span>
                        </div>
                        <div class="submenu provider-list-submenu" id="providerListSubmenu" style="display: none;"></div>
                        <div class="menu-item" id="modelTypeManagerMenuItem">
                            <span class="menu-icon">🎛️</span> <span data-i18n="model_type_manager">模型类型管理</span>
                        </div>
                        <div class="menu-item" id="autoSwitchMenuItem">
                            <span class="menu-icon">🔄</span> <span data-i18n="auto_switch_settings">模型自动切换</span>
                        </div>
                        <div class="menu-item" id="timeoutMenuItem">
                            <span class="menu-icon">🎛️</span> <span data-i18n="timeout_settings">模型总设置</span>
                        </div>
                    </div>

                    <div class="menu-item expandable settings-group-title" onclick="toggleSettingsGroup('settingsGroupCapabilitySubmenu','settingsGroupCapabilityArrow')">
                        <span class="menu-icon">🧠</span> <span data-i18n="settings_group_capability">对话与能力</span> <span class="arrow" id="settingsGroupCapabilityArrow">▼</span>
                    </div>
                    <div class="submenu settings-group-submenu" id="settingsGroupCapabilitySubmenu">
                        <div class="menu-item" id="presetManagerMenuItem">
                            <span class="menu-icon">📚</span> <span data-i18n="preset_manager">预设管理</span>
                        </div>
                        <div class="menu-item" id="ragMenuItem">
                            <span class="menu-icon">🧠</span> <span data-i18n="rag_knowledge">RAG知识库</span>
                        </div>
                        <div class="menu-item" id="modeCapabilitiesMenuItem">
                            <span class="menu-icon">🧭</span> <span data-i18n="mode_capability_matrix">模式能力矩阵</span>
                        </div>
                        <div class="menu-item" id="wordConversionMenuItem">
                            <span class="menu-icon">🔄</span> <span data-i18n="word_conversion">文生图单词转换</span>
                        </div>
                        <div class="menu-item" id="profileMenuItem">
                            <span class="menu-icon">👤</span> <span data-i18n="chat_profile">聊天身份</span>
                        </div>
                    </div>

                    <div class="menu-item expandable settings-group-title" onclick="toggleSettingsGroup('settingsGroupUiSubmenu','settingsGroupUiArrow')">
                        <span class="menu-icon">🎨</span> <span data-i18n="settings_group_ui">界面与系统</span> <span class="arrow" id="settingsGroupUiArrow">▼</span>
                    </div>
                    <div class="submenu settings-group-submenu" id="settingsGroupUiSubmenu">
                        <div class="menu-item" id="languageMenuItem">
                            <span class="menu-icon">🌐</span> <span data-i18n="language">语言</span>
                        </div>
                        <div class="menu-item" id="updateMenuItem">
                            <span class="menu-icon">🛎️</span> <span data-i18n="update_center">更新中心</span>
                        </div>
                        <div class="menu-item" id="skinMenuItem">
                            <span class="menu-icon">🎨</span> <span data-i18n="skin_mode">皮肤模式</span>
                        </div>
                        <div class="menu-item" id="costOptimizerMenuItem">
                            <span class="menu-icon">💰</span> <span data-i18n="cost_optimizer">成本优化</span>
                        </div>
                    </div>

                    <div class="menu-item expandable settings-group-title" onclick="toggleSettingsGroup('settingsGroupDevSubmenu','settingsGroupDevArrow')">
                        <span class="menu-icon">🛡️</span> <span data-i18n="settings_group_dev">安全与开发</span> <span class="arrow" id="settingsGroupDevArrow">▼</span>
                    </div>
                    <div class="submenu settings-group-submenu" id="settingsGroupDevSubmenu">
                        <div class="menu-item" id="passwordMenuItem">
                            <span class="menu-icon">🔐</span> <span data-i18n="password_settings">密码设置</span>
                        </div>
                        <div class="menu-item" id="pluginManagerMenuItem">
                            <span class="menu-icon">🧩</span> <span data-i18n="plugin_manager">插件管理</span>
                        </div>
                        <div class="menu-item" id="debugMenuItem">
                            <span class="menu-icon">🪲</span> <span data-i18n="debug_mode">调试模式</span>
                        </div>
                    </div>
                </div>
            </div>
