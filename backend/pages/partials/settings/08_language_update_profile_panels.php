                <!-- 语言设置面板 -->
                <div id="languagePanel" style="display: none;">
                    <h3 data-i18n="language">🌐 语言</h3>
                    <p data-i18n="language_desc">选择界面显示语言。</p>
                    <div class="password-row">
                        <select id="languageSelect" style="width:200px;">
                            <option value="zh" data-i18n="chinese">简体中文</option>
                            <option value="en" data-i18n="english">English</option>
                            <option value="es">Español</option>
                            <option value="ja">日本語</option>
                        </select>
                        <button onclick="saveLanguage()" data-i18n="save_language">保存语言</button>
                    </div>
                </div>

                <!-- 更新中心面板 -->
                <div id="updatePanel" style="display: none;">
                    <h3 data-i18n="update_center">🛎️ 更新中心</h3>
                    <p data-i18n="update_desc">支持手动检查更新，也可自动检查并在角落提示。</p>
                    <table class="form-table">
                        <tr>
                            <th data-i18n="update_auto_check">自动检查更新</th>
                            <td>
                                <label class="switch">
                                    <input type="checkbox" id="updateAutoCheck">
                                    <span class="slider round"></span>
                                </label>
                                <span class="hint" data-i18n="update_auto_check_hint">默认每 6 小时检查一次。</span>
                            </td>
                        </tr>
                        <tr>
                            <th data-i18n="update_current_version">当前版本</th>
                            <td><span id="updateCurrentVersion">-</span></td>
                        </tr>
                        <tr>
                            <th data-i18n="update_latest_version">最新版本</th>
                            <td><span id="updateLatestVersion">-</span></td>
                        </tr>
                        <tr>
                            <th data-i18n="update_last_checked">上次检查</th>
                            <td><span id="updateLastChecked">-</span></td>
                        </tr>
                    </table>
                    <div class="form-actions">
                        <button class="fetch-models-btn" type="button" onclick="checkForUpdatesManual()" data-i18n="update_check_now">立即检查</button>
                        <button class="fetch-models-btn" type="button" onclick="saveUpdateSettings()" data-i18n="update_save_settings">保存更新设置</button>
                        <button class="save-provider-btn" type="button" onclick="openLatestReleasePage()" data-i18n="update_open_release">前往更新页面</button>
                    </div>
                    <h4 data-i18n="update_whats_new">本次更新内容</h4>
                    <pre id="updateWhatsNew" class="update-whats-new">-</pre>
                </div>

                <!-- 聊天身份面板 -->
                <div id="profilePanel" style="display: none;">
                    <h3 data-i18n="chat_profile">👤 聊天身份</h3>
                    <p data-i18n="chat_profile_desc">可自定义玩家与 AI 的昵称和头像（支持图片 URL）。</p>
                    <table class="form-table">
                        <tr>
                            <th data-i18n="player_nickname">玩家昵称</th>
                            <td><input type="text" id="playerNickname" placeholder="你"></td>
                        </tr>
                        <tr>
                            <th data-i18n="player_avatar">玩家头像 URL</th>
                            <td>
                                <div class="avatar-input-row">
                                    <input type="text" id="playerAvatar" placeholder="https://...">
                                    <input type="file" id="playerAvatarFile" accept="image/*" style="display:none" onchange="uploadProfileAvatar('user', this)">
                                    <button type="button" class="fetch-models-btn profile-avatar-upload-btn" onclick="document.getElementById('playerAvatarFile').click()" data-i18n="upload_avatar">上传头像</button>
                                </div>
                                <div class="avatar-preview-row">
                                    <img id="playerAvatarPreview" class="profile-avatar-preview" alt="Player avatar preview">
                                    <span class="hint" data-i18n="avatar_upload_hint">可上传本地图片，自动压缩至 2MB 以内</span>
                                </div>
                            </td>
                        </tr>
                        <tr>
                            <th data-i18n="ai_nickname">AI 昵称</th>
                            <td><input type="text" id="aiNickname" placeholder="Ada"></td>
                        </tr>
                        <tr>
                            <th data-i18n="ai_avatar">AI 头像 URL</th>
                            <td>
                                <div class="avatar-input-row">
                                    <input type="text" id="aiAvatar" placeholder="https://...">
                                    <input type="file" id="aiAvatarFile" accept="image/*" style="display:none" onchange="uploadProfileAvatar('assistant', this)">
                                    <button type="button" class="fetch-models-btn profile-avatar-upload-btn" onclick="document.getElementById('aiAvatarFile').click()" data-i18n="upload_avatar">上传头像</button>
                                </div>
                                <div class="avatar-preview-row">
                                    <img id="aiAvatarPreview" class="profile-avatar-preview" alt="AI avatar preview">
                                    <span class="hint" data-i18n="avatar_upload_hint">可上传本地图片，自动压缩至 2MB 以内</span>
                                </div>
                            </td>
                        </tr>
                        <tr>
                            <th data-i18n="ai_call_user_as">AI 对玩家称呼</th>
                            <td><input type="text" id="aiUserCallName" placeholder="例如：小明 / 朋友 / Boss"></td>
                        </tr>
                    </table>
                    <div class="form-actions">
                        <button class="save-provider-btn" onclick="saveProfileSettings()" data-i18n="save_profile">保存身份</button>
                    </div>
                </div>
