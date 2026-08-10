                <!-- RAG 知识库面板 -->
                <div id="ragPanel" style="display: none;">
                    <h3 data-i18n="rag_knowledge">🧠 RAG知识库</h3>
                    <p data-i18n="rag_desc">上传本地文本文件，聊天时自动检索相关片段注入上下文。</p>
                    <table class="form-table">
                        <tr>
                            <th data-i18n="rag_enable">启用RAG增强</th>
                            <td><label class="switch"><input type="checkbox" id="ragEnable"><span class="slider round"></span></label></td>
                        </tr>
                        <tr>
                            <th data-i18n="rag_topk">检索片段数 (Top-K)</th>
                            <td><input type="number" id="ragTopK" min="1" max="10" value="4"></td>
                        </tr>
                        <tr>
                            <th data-i18n="rag_max_chars">上下文最大字符</th>
                            <td><input type="number" id="ragMaxChars" min="600" max="5000" value="1800"></td>
                        </tr>
                        <tr>
                            <th data-i18n="rag_retrieval_mode">检索模式</th>
                            <td>
                                <select id="ragMode">
                                    <option value="vector" data-i18n="rag_mode_vector">向量检索（推荐）</option>
                                    <option value="lexical" data-i18n="rag_mode_lexical">词法检索（回退）</option>
                                </select>
                            </td>
                        </tr>
                        <tr>
                            <th data-i18n="rag_embed_model">向量模型</th>
                            <td>
                                <select id="ragEmbedModel" onchange="toggleRagEmbedModelCustomInput()"></select>
                                <input type="text" id="ragEmbedModelCustom" style="margin-top:8px; display:none;" placeholder="自定义 embedding 模型名，如: text-embedding-3-large">
                                <span class="hint">下拉可选已启用 embedding 模型；也可选择“自定义输入”手动填写</span>
                            </td>
                        </tr>
                    </table>
                    <div class="form-actions" style="justify-content:flex-start; gap:10px;">
                        <input type="file" id="ragFileInput" multiple accept=".txt,.md,.json,.csv,.log" style="display:none">
                        <input type="file" id="ragFolderInput" webkitdirectory directory multiple accept=".txt,.md,.json,.csv,.log" style="display:none">
                        <button class="fetch-models-btn" type="button" onclick="document.getElementById('ragFileInput').click()" data-i18n="rag_import_files">导入文件</button>
                        <button class="fetch-models-btn" type="button" onclick="document.getElementById('ragFolderInput').click()" data-i18n="rag_import_folder">导入整个文件夹</button>
                        <button class="fetch-models-btn" type="button" onclick="checkRagVectorStatus()" data-i18n="rag_check_env">检查向量环境</button>
                        <button class="fetch-models-btn" type="button" onclick="installRagVectorDeps()" data-i18n="rag_install_deps">一键安装向量依赖</button>
                        <button class="fetch-models-btn" type="button" onclick="rebuildRagVectorIndex()" data-i18n="rag_rebuild_index">重建向量索引</button>
                        <button class="save-provider-btn" type="button" onclick="saveRagSettings()" data-i18n="save_provider">保存</button>
                        <button class="deselect-all-btn" type="button" onclick="clearRagKnowledge()" data-i18n="rag_clear_all">清空知识库</button>
                    </div>
                    <p class="hint" data-i18n="rag_supported_types">支持 .txt .md .json .csv .log（服务器模式≤5MB，离线回退≤1MB）</p>
                    <div id="ragVectorStatus" class="hint" style="margin:6px 0;"></div>
                    <div id="ragStats" class="hint" style="margin:8px 0;"></div>
                    <div id="ragCollections" class="rag-collections"></div>
                    <div id="ragRecentHits" class="rag-recent-hits"></div>
                    <div id="ragDocList"></div>
                </div>
