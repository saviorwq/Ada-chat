                <!-- 模型类型管理面板 -->
                <div id="modelTypePanel" style="display: none;">
                    <h3 data-i18n="model_type_config">模型类型配置</h3>
                    <p data-i18n="model_type_desc">为已启用的模型指定类型（聊天/图像/视频/OCR等）</p>
                    <div id="modelTypeList" class="model-type-list"></div>
                    <button class="save-models-btn" onclick="saveModelTypes()" data-i18n="save_all_types">保存所有类型</button>
                </div>

                <!-- 模式能力矩阵面板（只读） -->
                <div id="modeCapabilitiesPanel" style="display: none;">
                    <h3 data-i18n="mode_capability_matrix">🧭 模式能力矩阵</h3>
                    <p data-i18n="mode_capability_desc">此面板从模式配置实时渲染，仅用于查看当前各模式上传规则与处理方式。</p>
                    <div id="modeCapabilitiesTable"></div>
                </div>
