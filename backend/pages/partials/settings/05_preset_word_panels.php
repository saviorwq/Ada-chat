                <!-- 预设管理面板 -->
                <div id="presetManagerPanel" style="display: none;">
                    <h3 data-i18n="preset_manager">📚 预设管理</h3>
                    <p data-i18n="preset_manager_desc">你可以创建多个预设，并在发送消息时自动应用激活的预设。系统预设用于聊天，角色预设用于图像生成。</p>
                    
                    <div id="presetList" class="preset-list"></div>
                    
                    <div style="margin-top: 20px;">
                        <input type="hidden" id="editingPresetId" value="">
                        <table class="form-table">
                            <tr>
                                <th data-i18n="preset_name">预设名称</th>
                                <td><input type="text" id="presetName" placeholder="例如：通用写实人像"></td>
                            </tr>
                            <tr>
                                <th data-i18n="preset_type">类型</th>
                                <td>
                                    <select id="presetType">
                                        <option value="system" data-i18n="system_preset">系统预设（聊天）</option>
                                        <option value="role" data-i18n="role_preset">角色预设（图像生成）</option>
                                    </select>
                                </td>
                            </tr>
                            <tr>
                                <th data-i18n="preset_content">内容</th>
                                <td><textarea id="presetContent" rows="6" style="width:100%; padding:12px; border-radius:var(--radius-md); border:1px solid var(--border); font-family:monospace;" placeholder="输入预设内容..."></textarea></td>
                            </tr>
                            <tr>
                                <th data-i18n="preset_route_models">预设绑定模型</th>
                                <td>
                                    <div class="route-model-grid">
                                        <label class="route-model-item"><span data-i18n="category_chat">💬 对话</span><br><select id="presetModelChat"></select></label>
                                        <label class="route-model-item"><span data-i18n="category_code">💻 编程</span><br><select id="presetModelCode"></select></label>
                                        <label class="route-model-item"><span data-i18n="category_image">🎨 图像生成</span><br><select id="presetModelImage"></select></label>
                                        <label class="route-model-item"><span data-i18n="category_video">🎬 视频生成</span><br><select id="presetModelVideo"></select></label>
                                        <label class="route-model-item"><span data-i18n="category_ocr">📄 文字识别</span><br><select id="presetModelOcr"></select></label>
                                        <label class="route-model-item"><span data-i18n="category_vision">👁️ 图像理解</span><br><select id="presetModelVision"></select></label>
                                        <label class="route-model-item"><span data-i18n="category_translation">🌐 翻译</span><br><select id="presetModelTranslation"></select></label>
                                    </div>
                                    <span class="hint" data-i18n="preset_route_models_hint">每个分类可绑定一个默认模型；留空则使用全局/自动选择。</span>
                                </td>
                            </tr>
                        </table>
                        <div class="form-actions">
                            <button type="button" class="save-provider-btn" onclick="savePreset()" data-i18n="save_preset">保存预设</button>
                            <button type="button" class="fetch-models-btn" onclick="clearPresetForm()" data-i18n="new_preset">新建预设</button>
                        </div>
                    </div>
                </div>

                <!-- 新增：文生图单词转换面板 -->
                <div id="wordConversionPanel" style="display: none;">
                    <h3 data-i18n="word_conversion">🔄 文生图单词转换</h3>
                    <p data-i18n="word_conversion_desc">设置短语自动转换为更详细的Prompt，提升图像生成质量。</p>
                    
                    <div id="conversionList" class="word-conversion-list"></div>
                    
                    <div class="conversion-form" id="conversionForm">
                        <h4 data-i18n="add_edit_conversion" id="conversionFormTitle">新增转换规则</h4>
                        <input type="hidden" id="editingConversionId" value="">
                        
                        <div class="form-row">
                            <label for="conversionShort" data-i18n="short_phrase">短词/短语</label>
                            <input type="text" id="conversionShort" placeholder="例如：cat, 狗, 风景" maxlength="50">
                        </div>
                        
                        <div class="form-row">
                            <label for="conversionLong" data-i18n="long_prompt">详细Prompt</label>
                            <textarea id="conversionLong" rows="4" placeholder="例如：A beautiful fluffy cat sitting on a windowsill, sunlight streaming in, soft focus, 4k, highly detailed"></textarea>
                        </div>
                        
                        <div class="conversion-form-actions">
                            <button class="fetch-models-btn" onclick="clearConversionForm()" data-i18n="clear_form">清空表单</button>
                            <button class="save-provider-btn" onclick="saveConversion()" data-i18n="save_conversion">保存转换规则</button>
                        </div>
                    </div>
                </div>
