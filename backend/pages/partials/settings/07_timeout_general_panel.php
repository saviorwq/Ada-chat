                <!-- 模型总设置面板 -->
                <div id="timeoutPanel" style="display: none;">
                    <h3 data-i18n="timeout_settings">🎛️ 模型总设置</h3>
                    <p data-i18n="timeout_desc">统一配置聊天模型请求参数（超时、采样与惩罚项）。</p>
                    <table class="form-table">
                        <tr>
                            <th data-i18n="total_timeout">总超时（秒）</th>
                            <td>
                                <input type="number" id="timeoutTotal" min="10" max="3600" value="600" step="10">
                                <span class="hint" data-i18n="total_timeout_hint">默认 600 秒（10分钟）</span>
                            </td>
                        </tr>
                        <tr>
                            <th data-i18n="idle_timeout">空闲超时（秒）</th>
                            <td>
                                <input type="number" id="timeoutIdle" min="10" max="600" value="120" step="10">
                                <span class="hint" data-i18n="idle_timeout_hint">默认 120 秒（2分钟）</span>
                            </td>
                        </tr>
                        <tr>
                            <th data-i18n="sampling_temperature">温度（聊天类）</th>
                            <td>
                                <input type="number" id="samplingTemperature" min="0" max="2" value="0.7" step="0.1">
                                <span class="hint" data-i18n="sampling_temperature_hint">范围 0.0 - 2.0，默认 0.7；越高越发散，越低越稳定。</span>
                            </td>
                        </tr>
                        <tr>
                            <th data-i18n="sampling_top_p">Top P（聊天类）</th>
                            <td>
                                <input type="number" id="samplingTopP" min="0" max="1" value="1" step="0.05">
                                <span class="hint" data-i18n="sampling_top_p_hint">范围 0.0 - 1.0，默认 1.0；与温度二选一微调即可。</span>
                            </td>
                        </tr>
                        <tr>
                            <th data-i18n="sampling_max_tokens">Max Tokens（可选覆盖）</th>
                            <td>
                                <input type="number" id="samplingMaxTokens" min="1" max="65535" value="" step="1" placeholder="留空使用自动策略">
                                <span class="hint" data-i18n="sampling_max_tokens_hint">留空时沿用系统自动策略；填写后将优先生效。</span>
                            </td>
                        </tr>
                        <tr>
                            <th data-i18n="sampling_presence_penalty">Presence Penalty</th>
                            <td>
                                <input type="number" id="samplingPresencePenalty" min="-2" max="2" value="0" step="0.1">
                                <span class="hint" data-i18n="sampling_presence_penalty_hint">范围 -2.0 到 2.0，越高越倾向引入新主题。</span>
                            </td>
                        </tr>
                        <tr>
                            <th data-i18n="sampling_frequency_penalty">Frequency Penalty</th>
                            <td>
                                <input type="number" id="samplingFrequencyPenalty" min="-2" max="2" value="0" step="0.1">
                                <span class="hint" data-i18n="sampling_frequency_penalty_hint">范围 -2.0 到 2.0，越高越抑制重复表达。</span>
                            </td>
                        </tr>
                        <tr>
                            <th data-i18n="sampling_stop_sequences">Stop Sequences（可选）</th>
                            <td>
                                <textarea id="samplingStopSequences" rows="2" placeholder="每行一条 stop 序列"></textarea>
                                <span class="hint" data-i18n="sampling_stop_sequences_hint">每行一个终止序列；留空则不设置。</span>
                            </td>
                        </tr>
                        <tr>
                            <th data-i18n="intent_route_enable">聊天自动路由</th>
                            <td>
                                <label style="display:flex;align-items:center;gap:8px;">
                                    <input type="checkbox" id="intentRouteEnabled">
                                    <span data-i18n="intent_route_enable_desc">在聊天分类下自动识别意图并切换到对应模型（文生图/识图/编程等）。</span>
                                </label>
                            </td>
                        </tr>
                        <tr>
                            <th data-i18n="intent_route_default_models">自动路由默认模型</th>
                            <td>
                                <div style="display:grid;grid-template-columns:repeat(2,minmax(220px,1fr));gap:8px;">
                                    <label><span data-i18n="category_image">🎨 图像生成</span><br><select id="intentRouteModelImage"></select></label>
                                    <label><span data-i18n="category_vision">👁️ 图像理解</span><br><select id="intentRouteModelVision"></select></label>
                                    <label><span data-i18n="category_ocr">📄 文字识别</span><br><select id="intentRouteModelOcr"></select></label>
                                    <label><span data-i18n="category_translation">🌐 翻译</span><br><select id="intentRouteModelTranslation"></select></label>
                                    <label><span data-i18n="category_code">💻 编程</span><br><select id="intentRouteModelCode"></select></label>
                                </div>
                                <span class="hint" data-i18n="intent_route_default_models_hint">可留空，留空时会使用当前供应商下该分类第一个可用模型。</span>
                            </td>
                        </tr>
                    </table>
                    <div class="form-actions">
                        <button class="save-provider-btn" onclick="saveModelGeneralSettings()" data-i18n="save_timeout">保存模型设置</button>
                    </div>
                    <p class="hint" data-i18n="timeout_effect">修改后仅对新发送的请求生效。</p>
                </div>
