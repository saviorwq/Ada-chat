    <style>
        /* 
         * 专属布局样式
         * 注意：通用样式已通过 Vite 构建产物（manifest）注入；此处仅保留本页面特有覆盖。
         */
        .main {
            display: flex;
            flex-direction: column;
            height: 100%;
            overflow: hidden; /* 防止双重滚动条 */
        }

        .log-container {
            flex: 1 1 auto;
            padding-bottom: 16px;
            overflow-y: auto; /* 确保聊天记录独立滚动 */
        }

        /* 底部输入区域容器 */
        #dropZone {
            background: var(--bg-light);
            border-top: 1px solid var(--border);
            padding: 16px 28px 20px;
            box-shadow: 0 -4px 15px rgba(0, 0, 0, 0.03);
            flex-shrink: 0; /* 防止被压缩 */
        }

        .remove-preview {
            background: none;
            border: none;
            color: var(--text-light);
            font-size: 20px;
            cursor: pointer;
            padding: 4px 10px;
            border-radius: 50%;
            line-height: 1;
            transition: var(--transition);
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .remove-preview:hover {
            background: rgba(239,68,68,0.1);
            color: var(--danger);
        }

        /* 控件行 (传图、下拉框、发送) */
        .controls-row {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 10px;
            width: 100%;
        }

        .controls-row .upload-btn {
            background: var(--bg);
            border: 1px solid var(--border);
            border-radius: var(--radius-xl);
            padding: 0 18px;
            height: 42px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            color: var(--text-light);
            transition: var(--transition);
            display: inline-flex;
            align-items: center;
            gap: 6px;
            white-space: nowrap;
        }

        .controls-row .upload-btn:hover {
            background: var(--border);
            color: var(--text);
        }

        .controls-row .send-btn {
            background: var(--primary);
            color: white;
            border: none;
            border-radius: var(--radius-xl);
            padding: 0 28px;
            height: 42px;
            font-weight: 600;
            font-size: 15px;
            cursor: pointer;
            transition: var(--transition);
            white-space: nowrap;
            margin-left: auto;
        }

        .controls-row .send-btn:hover {
            background: var(--primary-dark);
        }

        .controls-row .send-btn:disabled {
            background: var(--border-dark);
            cursor: not-allowed;
            opacity: 0.7;
        }

        /* 下拉框统一尺寸 */
        .controls-row .select-mini {
            min-width: 130px;
            height: 42px;
            background-color: var(--bg-light);
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
            color: var(--text);
            padding: 0 10px;
            outline: none;
        }

        /* 图片模式包装 */
        .mode-wrapper {
            display: flex;
            align-items: center;
            gap: 6px;
            background: var(--bg);
            padding: 0 8px;
            border-radius: var(--radius-xl);
            border: 1px solid var(--border);
            height: 42px;
        }

        .mode-wrapper .select-mini {
            min-width: 100px;
            border: none;
            background: transparent;
            height: 40px;
            box-shadow: none;
            padding-left: 5px;
        }

        .mode-wrapper .hint {
            color: var(--text-light);
            font-size: 12px;
            white-space: nowrap;
            padding-right: 5px;
        }

        /* 移动端适配 */
        @media (max-width: 768px) {
            #dropZone { padding: 12px 16px; }
            .controls-row { gap: 8px; }
            .controls-row .select-mini { min-width: calc(50% - 20px); flex: 1 1 auto; }
            .mode-wrapper { width: 100%; order: 3; justify-content: space-between; margin-top: 8px; }
            .controls-row .upload-btn { order: 1; }
            .controls-row .send-btn { order: 2; margin-left: 0; flex: 1; }
        }

