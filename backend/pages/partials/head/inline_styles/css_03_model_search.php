        /* 模型搜索栏 */
        .model-search-bar {
            position: relative;
            margin: 10px 0 0;
        }
        .model-search-bar input {
            width: 100%;
            padding: 10px 14px;
            padding-right: 80px;
            border: 2px solid var(--border);
            border-radius: var(--radius-lg);
            font-size: 14px;
            outline: none;
            background: var(--bg);
            color: var(--text);
            transition: border-color 0.2s;
            box-sizing: border-box;
        }
        .model-search-bar input:focus {
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1);
        }
        .model-search-count {
            position: absolute;
            right: 14px;
            top: 50%;
            transform: translateY(-50%);
            font-size: 12px;
            color: var(--text-light);
            pointer-events: none;
        }

        @media (max-width: 768px) {
            .auto-switch-toggle { padding: 0 8px; }
            .auto-switch-text { display: none; }
        }
